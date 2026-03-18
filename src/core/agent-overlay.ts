// src/core/agent-overlay.ts

import type { AgentOverlay, AgentOverlayEventMap, AgentOverlayOptions } from './types'
import { createEventEmitter } from './event-emitter'
import { validateResult } from './validate-result'
import { RangeSelector } from './selection/range-selector'
import { buildChartContext } from './selection/context-builder'
import { OverlayRenderer } from './overlay/overlay-renderer'
import { PromptInput } from './ui/prompt-input'
import { ExplanationPopup } from './ui/explanation-popup'
import { calculateSmartPosition } from './ui/calculate-position'

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
  const emitter = createEventEmitter<AgentOverlayEventMap>()
  const rangeSelector = new RangeSelector(chart as never, series as never)
  const renderer = new OverlayRenderer(series as never)
  const chartEl = chart.chartElement()
  const theme = options.ui?.theme ?? 'dark'

  // Ensure container supports absolute positioning for UI overlays
  if (getComputedStyle(chartEl).position === 'static') {
    chartEl.style.position = 'relative'
  }

  const promptInput = new PromptInput(chartEl, theme)
  const explanationPopup = new ExplanationPopup(chartEl, theme)

  explanationPopup.onClose = () => {
    renderer.clear()
    rangeSelector.clearSelection()
  }

  let abortController: AbortController | null = null

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

  promptInput.onSubmit = async (prompt: string) => {
    promptInput.setLoading(true)
    emitter.emit('analyze-start')

    abortController = new AbortController()

    try {
      const seriesData = series.data() as never[]
      const currentRange = rangeSelector.getRange()

      if (!currentRange) {
        throw new Error('No selection range available')
      }

      const context = buildChartContext(seriesData, currentRange as never, options.dataAccessor)

      const rawResult = await options.provider.analyze(context, prompt, abortController.signal)
      const result = validateResult(rawResult)

      renderer.render(result)

      if (result.explanation) {
        // Use prompt's last position (might have been dragged)
        const pos = promptInput.getLastPosition()
        const entry = {
          prompt,
          isQuickRun: false,
          model: undefined,
          presets: [],
          result,
          range: currentRange as { from: unknown; to: unknown },
        } as Parameters<typeof explanationPopup.show>[0]['entry']
        explanationPopup.show({ entry, currentIndex: 0, totalCount: 1, position: pos ?? undefined })
      }

      promptInput.hide()
      emitter.emit('analyze-complete', result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        promptInput.setLoading(false)
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      abortController = null
    }
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
