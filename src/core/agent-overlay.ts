// src/core/agent-overlay.ts

import type {
  AgentOverlay,
  AgentOverlayEventMap,
  AgentOverlayOptions,
  AnalysisResult,
} from './types'
import { createEventEmitter } from './event-emitter'
import { RangeSelector } from './selection/range-selector'
import { buildChartContext } from './selection/context-builder'
import { OverlayRenderer } from './overlay/overlay-renderer'
import { PromptInput } from './ui/prompt-input'
import { ExplanationPopup } from './ui/explanation-popup'

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
}

function isValidPriceLine(item: unknown): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>).price === 'number'
  )
}

function isValidMarker(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const m = item as Record<string, unknown>
  return m.time != null && typeof m.position === 'string' && typeof m.shape === 'string'
}

function validateResult(raw: unknown): AnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid analysis result: expected an object')
  }
  const obj = raw as Record<string, unknown>

  const priceLines = Array.isArray(obj.priceLines)
    ? obj.priceLines.filter(isValidPriceLine)
    : undefined
  const markers = Array.isArray(obj.markers) ? obj.markers.filter(isValidMarker) : undefined

  return {
    ...(typeof obj.explanation === 'string' && { explanation: obj.explanation }),
    ...(priceLines && priceLines.length > 0 && { priceLines }),
    ...(markers && markers.length > 0 && { markers }),
  }
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

  let abortController: AbortController | null = null

  rangeSelector.onDismiss = () => {
    abortController?.abort()
    abortController = null
    promptInput.hide()
    explanationPopup.hide()
    // Re-enable selection so user can drag again without pressing S
    rangeSelector.setEnabled(true)
  }

  rangeSelector.onSelect = (_range) => {
    // Cancel any in-flight request
    abortController?.abort()
    abortController = null

    // Hide previous UI
    promptInput.hide()
    explanationPopup.hide()

    // Disable selection so clicking elsewhere dismisses
    rangeSelector.setEnabled(false)

    promptInput.show()
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
        const fromX = chart.timeScale().timeToCoordinate(currentRange.from)
        explanationPopup.show(result.explanation, {
          x: (fromX ?? 100) as number,
          y: options.ui?.promptPlacement === 'bottom' ? 8 : chartEl.clientHeight - 220,
        })
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
