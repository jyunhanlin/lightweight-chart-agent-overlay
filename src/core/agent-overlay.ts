// src/core/agent-overlay.ts

import type {
  AgentOverlay,
  AgentOverlayEventMap,
  AgentOverlayOptions,
  AnalysisPreset,
  ChartContext,
  NormalizedAnalysisResult,
  TimeValue,
} from './types'
import { createEventEmitter } from './event-emitter'
import { validateResult } from './validate-result'
import { defaultPromptBuilder } from './prompt-builder'
import { RangeSelector } from './selection/range-selector'
import { buildChartContext } from './selection/context-builder'
import { OverlayRenderer } from './overlay/overlay-renderer'
import { PromptInput } from './ui/prompt-input'
import { ExplanationPopup } from './ui/explanation-popup'
import { calculateSmartPosition } from './ui/calculate-position'
import { createHistoryStore } from './history-store'
import { HistoryButton } from './ui/history-button'

interface ChartLike {
  timeScale(): {
    coordinateToTime(x: number): unknown
    timeToCoordinate(time: unknown): number | null
  }
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
  data(): readonly Record<string, unknown>[]
  priceToCoordinate(price: number): number | null
}

interface AnalyzeParams {
  readonly context: ChartContext
  readonly prompt: string
  readonly additionalSystemPrompt: string | undefined
  readonly model: string | undefined
  readonly isQuickRun: boolean
  readonly presets: readonly AnalysisPreset[]
  readonly currentRange: { readonly from: TimeValue; readonly to: TimeValue }
}

export function createAgentOverlay(
  chart: ChartLike,
  series: SeriesLike,
  options: AgentOverlayOptions,
): AgentOverlay {
  const emitter = createEventEmitter<AgentOverlayEventMap>()
  const rangeSelector = new RangeSelector(chart as never, series as never)
  const renderer = new OverlayRenderer(series as never)
  const chartEl = chart.chartElement()
  const theme = options.ui?.theme ?? 'dark'
  const promptBuilder = options.promptBuilder ?? defaultPromptBuilder

  // Ensure container supports absolute positioning for UI overlays
  if (getComputedStyle(chartEl).position === 'static') {
    chartEl.style.position = 'relative'
  }

  const historyStore = createHistoryStore()
  const historyButton = new HistoryButton(chartEl, theme)
  historyButton.setCount(0)

  let currentHistoryIndex = -1

  const promptInput = new PromptInput(chartEl, {
    models: options.provider.models,
    presets: options.presets,
    theme,
  })
  const explanationPopup = new ExplanationPopup(chartEl, theme)

  explanationPopup.onClose = () => {
    renderer.clear()
    rangeSelector.clearSelection()
  }

  function showHistoryEntry(index: number): void {
    const entry = historyStore.get(index)
    if (!entry) return

    currentHistoryIndex = index

    const position = calculateSmartPosition({
      chartEl,
      timeToCoordinate: (time) => chart.timeScale().timeToCoordinate(time),
      priceToCoordinate: (price) => series.priceToCoordinate(price),
      range: entry.range,
      seriesData: series.data(),
    })

    // Show popup first — this internally calls hide() which triggers onClose,
    // clearing the previous overlay and selection. Then we render the new state.
    explanationPopup.show({
      entry,
      currentIndex: index,
      totalCount: historyStore.size(),
      position,
    })

    renderer.render(entry.result)
    rangeSelector.setRange(entry.range as { from: never; to: never })
  }

  historyButton.onClick = () => {
    // If popup is already showing, do nothing
    if (chartEl.querySelector('[data-agent-overlay-explanation]')) return

    // Hide prompt input if showing
    promptInput.hide()

    // Show most recent entry
    const latestIndex = historyStore.size() - 1
    if (latestIndex < 0) return

    showHistoryEntry(latestIndex)
  }

  explanationPopup.onNavigate = (direction: -1 | 1) => {
    const targetIndex = currentHistoryIndex + direction
    if (targetIndex < 0 || targetIndex >= historyStore.size()) return

    showHistoryEntry(targetIndex)
  }

  let abortController: AbortController | null = null

  async function runAnalysis(params: AnalyzeParams): Promise<void> {
    promptInput.setLoading(true)
    emitter.emit('analyze-start')
    abortController = new AbortController()

    try {
      const rawResult = await options.provider.analyze(
        params.context,
        params.prompt,
        abortController.signal,
        {
          model: params.model,
          additionalSystemPrompt: params.additionalSystemPrompt || undefined,
        },
      )
      const result: NormalizedAnalysisResult = validateResult(rawResult)

      const entry = {
        prompt: params.prompt,
        isQuickRun: params.isQuickRun,
        model: params.model,
        presets: params.presets,
        result,
        range: params.currentRange,
      }

      historyStore.push(entry)
      historyButton.setCount(historyStore.size())
      currentHistoryIndex = historyStore.size() - 1

      // Show popup BEFORE rendering overlays — show() internally calls hide()
      // which triggers onClose → renderer.clear(). Rendering after ensures
      // the new overlays are not immediately cleared.
      if (result.explanation) {
        const pos = promptInput.getLastPosition()
        explanationPopup.show({
          entry,
          currentIndex: historyStore.size() - 1,
          totalCount: historyStore.size(),
          position: pos ?? undefined,
        })
      }

      promptInput.hide()
      renderer.clear()
      renderer.render(result)
      emitter.emit('analyze-complete', result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        promptInput.setLoading(false)
        promptInput.showError(err instanceof Error ? err.message : String(err))
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      abortController = null
    }
  }

  rangeSelector.onDismiss = () => {
    abortController?.abort()
    abortController = null
    promptInput.hide()
    explanationPopup.hide()
  }

  rangeSelector.onSelect = (range) => {
    // Cancel any in-flight request
    abortController?.abort()
    abortController = null

    // Hide previous UI
    promptInput.hide()
    explanationPopup.hide()

    // Calculate smart position based on candle data
    const position = calculateSmartPosition({
      chartEl,
      timeToCoordinate: (time) => chart.timeScale().timeToCoordinate(time),
      priceToCoordinate: (price) => series.priceToCoordinate(price),
      range,
      seriesData: series.data(),
    })

    promptInput.show(position)
  }

  promptInput.onSubmit = async (userPrompt: string) => {
    const seriesData = series.data() as never[]
    const currentRange = rangeSelector.getRange()
    if (!currentRange) throw new Error('No selection range available')

    const context = buildChartContext(seriesData, currentRange as never, options.dataAccessor)
    const selectedPresets = promptInput.getSelectedPresets()
    const buildResult = promptBuilder.build({
      userPrompt,
      selectedPresets,
      isQuickRun: false,
    })
    const selectedModel = promptInput.getSelectedModel()

    await runAnalysis({
      context,
      prompt: buildResult.prompt,
      additionalSystemPrompt: buildResult.additionalSystemPrompt,
      model: selectedModel,
      isQuickRun: false,
      presets: selectedPresets,
      currentRange,
    })
  }

  promptInput.onQuickRun = async (presets: readonly AnalysisPreset[]) => {
    const seriesData = series.data() as never[]
    const currentRange = rangeSelector.getRange()
    if (!currentRange) throw new Error('No selection range available')

    const context = buildChartContext(seriesData, currentRange as never, options.dataAccessor)
    const buildResult = promptBuilder.build({
      userPrompt: '',
      selectedPresets: presets,
      isQuickRun: true,
    })
    const selectedModel = promptInput.getSelectedModel()

    await runAnalysis({
      context,
      prompt: buildResult.prompt,
      additionalSystemPrompt: buildResult.additionalSystemPrompt,
      model: selectedModel,
      isQuickRun: true,
      presets: [...presets],
      currentRange,
    })
  }

  promptInput.onCancel = () => {
    abortController?.abort()
    abortController = null
    rangeSelector.clearSelection()
  }

  return {
    destroy() {
      abortController?.abort()
      rangeSelector.destroy()
      promptInput.destroy()
      explanationPopup.destroy()
      historyButton.destroy()
      historyStore.clear()
      renderer.clear()
      emitter.removeAll()
    },

    clearOverlays() {
      renderer.clear()
      explanationPopup.hide()
    },

    setSelectionEnabled(enabled: boolean) {
      rangeSelector.setEnabled(enabled)
      emitter.emit('selection-mode-change', enabled)
    },

    on<K extends keyof AgentOverlayEventMap>(
      event: K,
      handler: AgentOverlayEventMap[K],
    ): () => void {
      return emitter.on(event, handler)
    },
  }
}
