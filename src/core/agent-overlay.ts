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

function validateResult(raw: unknown): AnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid analysis result: expected an object')
  }
  const obj = raw as Record<string, unknown>

  return {
    ...(typeof obj.explanation === 'string' && { explanation: obj.explanation }),
    ...(Array.isArray(obj.priceLines) && { priceLines: obj.priceLines }),
    ...(Array.isArray(obj.markers) && { markers: obj.markers }),
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

  rangeSelector.onSelect = (range) => {
    // Cancel any in-flight request
    abortController?.abort()
    abortController = null

    // Hide previous UI
    promptInput.hide()
    explanationPopup.hide()

    // Show prompt input near the selection
    const fromX = chart.timeScale().timeToCoordinate(range.from)
    const placement = options.ui?.promptPlacement ?? 'top'
    const y = placement === 'top' ? 8 : chartEl.clientHeight - 48
    const x = fromX ?? 100

    promptInput.show({ x, y })
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

      const context = buildChartContext(
        seriesData,
        currentRange as never,
        options.dataAccessor,
      )

      const rawResult = await options.provider.analyze(context, prompt, abortController.signal)
      const result = validateResult(rawResult)

      renderer.render(result)

      if (result.explanation) {
        const fromX = chart.timeScale().timeToCoordinate(currentRange.from)
        explanationPopup.show(result.explanation, {
          x: (fromX ?? 100) as number,
          y: (options.ui?.promptPlacement === 'bottom' ? 8 : chartEl.clientHeight - 220),
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

    on<K extends keyof AgentOverlayEventMap>(
      event: K,
      handler: AgentOverlayEventMap[K],
    ): () => void {
      return emitter.on(event, handler)
    },
  }
}
