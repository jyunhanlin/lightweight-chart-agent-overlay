// src/core/agent-overlay.ts

import type {
  AgentOverlay,
  AgentOverlayEventMap,
  AgentOverlayOptions,
  AnalyzeOptions,
  AnalysisPreset,
  ChartContext,
  LLMProvider,
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
import { applyThemeVars } from './ui/theme'
import { DEFAULT_PRESETS } from './default-presets'
import { createHistoryStore } from './history-store'
import { HistoryButton } from './ui/history-button'
import { parseStreamedResponse } from '../providers/parse-response'

async function resolveHeaders(provider: {
  headers?: LLMProvider['headers']
}): Promise<Readonly<Record<string, string>> | undefined> {
  if (!provider.headers) return undefined
  if (typeof provider.headers === 'function') {
    return provider.headers()
  }
  return { ...provider.headers }
}

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

export function createAgentOverlay(
  chart: ChartLike,
  series: SeriesLike,
  options: AgentOverlayOptions,
): AgentOverlay {
  // ── Initialization ─────────────────────────────────────────────────────────

  const emitter = createEventEmitter<AgentOverlayEventMap>()
  const chartEl = chart.chartElement()
  let theme: 'light' | 'dark' = options.theme ?? 'dark'
  const promptBuilder = options.promptBuilder ?? defaultPromptBuilder
  const presets = options.presets ?? DEFAULT_PRESETS

  if (getComputedStyle(chartEl).position === 'static') {
    chartEl.style.position = 'relative'
  }
  applyThemeVars(chartEl, theme)

  const rangeSelector = new RangeSelector(chart as never, series as never)
  const renderer = new OverlayRenderer(series as never)
  const historyStore = createHistoryStore()
  const historyButton = new HistoryButton(chartEl)
  historyButton.setCount(0)

  const promptInput = new PromptInput(chartEl, {
    availableModels: options.provider.availableModels,
    presets,
    requiresApiKey: options.provider.requiresApiKey,
    apiKeyStorageKey: options.apiKeyStorageKey,
  })
  const explanationPopup = new ExplanationPopup(chartEl)

  let abortController: AbortController | null = null
  let currentHistoryIndex = -1

  // ── Core logic ─────────────────────────────────────────────────────────────

  function getSmartPosition(range: { from: TimeValue; to: TimeValue }) {
    return calculateSmartPosition({
      chartEl,
      timeToCoordinate: (time) => chart.timeScale().timeToCoordinate(time),
      priceToCoordinate: (price) => series.priceToCoordinate(price),
      range,
      seriesData: series.data(),
    })
  }

  function cancelInFlight(): void {
    abortController?.abort()
    abortController = null
  }

  function buildAnalysisContext() {
    const seriesData = series.data() as never[]
    const currentRange = rangeSelector.getRange()
    if (!currentRange) throw new Error('No selection range available')
    const context = buildChartContext(seriesData, currentRange as never, options.dataAccessor)
    return { context, currentRange }
  }

  async function runAnalysis(
    context: ChartContext,
    prompt: string,
    additionalSystemPrompt: string | undefined,
    isQuickRun: boolean,
    analysisPresets: readonly AnalysisPreset[],
    currentRange: { readonly from: TimeValue; readonly to: TimeValue },
  ): Promise<void> {
    const storageKey = options.apiKeyStorageKey ?? 'agent-overlay-api-key'
    const storedApiKey = options.provider.requiresApiKey
      ? (localStorage.getItem(storageKey) ?? undefined)
      : undefined

    // Check if key is required but missing
    if (options.provider.requiresApiKey && !storedApiKey) {
      promptInput.openSettings('Please enter your API key to continue.')
      return
    }

    promptInput.setLoading(true)
    emitter.emit('analyze-start')
    abortController = new AbortController()
    const { signal } = abortController

    try {
      const resolvedHeaders = await resolveHeaders(options.provider)

      const analyzeOptions: AnalyzeOptions = {
        model: promptInput.getSelectedModel(),
        additionalSystemPrompt: additionalSystemPrompt || undefined,
        apiKey: storedApiKey,
        headers: resolvedHeaders,
      }

      let result: NormalizedAnalysisResult
      // Capture position before hiding prompt input (used by both paths)
      const position = promptInput.getLastPosition() ?? undefined

      if (options.provider.analyzeStream) {
        // ── Streaming path ──────────────────────────────────
        // Keep loading bar visible until first chunk arrives

        let fullText = ''
        let streamingStarted = false

        for await (const chunk of options.provider.analyzeStream(
          context,
          prompt,
          signal,
          analyzeOptions,
        )) {
          fullText += chunk

          // On first chunk: switch from loading bar to streaming popup
          if (!streamingStarted) {
            streamingStarted = true
            explanationPopup.showStreaming({
              position,
              prompt,
              isQuickRun,
              model: promptInput.getSelectedModel(),
              presets: analysisPresets,
            })
            promptInput.hide()
          }

          // Display only text before the JSON fence; trim partial backticks
          const fenceIdx = fullText.indexOf('```json')
          let safeEnd: number
          if (fenceIdx !== -1) {
            safeEnd = fenceIdx
          } else {
            safeEnd = fullText.length
            // Trim trailing backticks that might be the start of a fence
            if (fullText.endsWith('```')) safeEnd -= 3
            else if (fullText.endsWith('``')) safeEnd -= 2
            else if (fullText.endsWith('`')) safeEnd -= 1
          }
          explanationPopup.setStreamText(fullText.slice(0, safeEnd).trimEnd())
        }

        const parsed = parseStreamedResponse(fullText)
        result = validateResult({
          explanation: parsed.explanation || undefined,
          priceLines: parsed.overlays.priceLines,
          markers: parsed.overlays.markers,
        })
      } else {
        // ── Fallback path (non-streaming) ───────────────────
        const rawResult = await options.provider.analyze(context, prompt, signal, analyzeOptions)
        result = validateResult(rawResult)
      }

      const entry = {
        prompt,
        isQuickRun,
        model: promptInput.getSelectedModel(),
        presets: analysisPresets,
        result,
        range: currentRange,
      }

      historyStore.push(entry)
      historyButton.setCount(historyStore.size())
      currentHistoryIndex = historyStore.size() - 1

      if (options.provider.analyzeStream) {
        // Finalize streaming popup → structured view
        // Use the position captured before promptInput.hide()
        explanationPopup.finalizeStream({
          entry,
          currentIndex: currentHistoryIndex,
          totalCount: historyStore.size(),
          position,
        })
      } else {
        // Non-streaming: show popup
        // Show popup BEFORE rendering overlays — show() calls hide() which
        // triggers onClose → renderer.clear(). Rendering after ensures
        // the new overlays are not immediately cleared.
        if (result.explanation) {
          explanationPopup.show({
            entry,
            currentIndex: currentHistoryIndex,
            totalCount: historyStore.size(),
            position,
          })
        }
        promptInput.hide()
      }

      renderer.clear()
      renderer.render(result)
      emitter.emit('analyze-complete', result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : String(err)
        const isAuthError = /\b(401|403)\b/.test(message)

        if (isAuthError && options.provider.requiresApiKey) {
          promptInput.setLoading(false)
          promptInput.openSettings('Invalid API key. Please check your key in Settings.')
        } else {
          promptInput.setLoading(false)
          promptInput.showError(message)
        }
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
      // On abort or error, clean up any streaming popup
      explanationPopup.hide()
    } finally {
      abortController = null
      promptInput.setLoading(false)
    }
  }

  function showHistoryEntry(index: number): void {
    const entry = historyStore.get(index)
    if (!entry) return

    currentHistoryIndex = index

    explanationPopup.show({
      entry,
      currentIndex: index,
      totalCount: historyStore.size(),
      position: getSmartPosition(entry.range),
    })

    renderer.render(entry.result)
    rangeSelector.setRange(entry.range as { from: never; to: never })
  }

  // ── Event wiring: Selection ────────────────────────────────────────────────

  rangeSelector.onSelect = (range) => {
    cancelInFlight()
    promptInput.hide()
    explanationPopup.hide()
    promptInput.show(getSmartPosition(range))
  }

  rangeSelector.onDismiss = () => {
    cancelInFlight()
    promptInput.hide()
    explanationPopup.hide()
  }

  // ── Event wiring: Prompt ───────────────────────────────────────────────────

  promptInput.onSubmit = async (userPrompt: string) => {
    const { context, currentRange } = buildAnalysisContext()
    const selectedPresets = promptInput.getSelectedPresets()
    const { prompt, additionalSystemPrompt } = promptBuilder.build({
      userPrompt,
      selectedPresets,
      isQuickRun: false,
    })
    await runAnalysis(context, prompt, additionalSystemPrompt, false, selectedPresets, currentRange)
  }

  promptInput.onQuickRun = async (runPresets: readonly AnalysisPreset[]) => {
    const { context, currentRange } = buildAnalysisContext()
    const { prompt, additionalSystemPrompt } = promptBuilder.build({
      userPrompt: '',
      selectedPresets: runPresets,
      isQuickRun: true,
    })
    await runAnalysis(context, prompt, additionalSystemPrompt, true, [...runPresets], currentRange)
  }

  promptInput.onCancel = () => {
    cancelInFlight()
    rangeSelector.clearSelection()
  }

  // ── Event wiring: History ──────────────────────────────────────────────────

  explanationPopup.onClose = () => {
    renderer.clear()
    rangeSelector.clearSelection()
  }

  explanationPopup.onNavigate = (direction: -1 | 1) => {
    const targetIndex = currentHistoryIndex + direction
    if (targetIndex >= 0 && targetIndex < historyStore.size()) {
      showHistoryEntry(targetIndex)
    }
  }

  explanationPopup.onAbort = () => {
    cancelInFlight()
    explanationPopup.hide()
    rangeSelector.clearSelection()
  }

  historyButton.onClick = () => {
    if (chartEl.querySelector('[data-agent-overlay-explanation]')) return
    promptInput.hide()
    const latestIndex = historyStore.size() - 1
    if (latestIndex >= 0) {
      showHistoryEntry(latestIndex)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    destroy() {
      cancelInFlight()
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

    setTheme(newTheme: 'light' | 'dark') {
      if (theme === newTheme) return
      theme = newTheme
      applyThemeVars(chartEl, newTheme)
    },

    on<K extends keyof AgentOverlayEventMap>(
      event: K,
      handler: AgentOverlayEventMap[K],
    ): () => void {
      return emitter.on(event, handler)
    },
  }
}
