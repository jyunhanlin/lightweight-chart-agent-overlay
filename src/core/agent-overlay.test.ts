// src/core/agent-overlay.test.ts
import { createAgentOverlay } from './agent-overlay'
import type { LLMProvider, AnalysisResult } from './types'

// Mock lightweight-charts
vi.mock('lightweight-charts', () => ({
  createSeriesMarkers: vi.fn(() => ({
    setMarkers: vi.fn(),
    detach: vi.fn(),
    markers: vi.fn().mockReturnValue([]),
  })),
  LineStyle: { Solid: 0, Dashed: 1, LargeDashed: 2, Dotted: 3 },
}))

function createMockChart() {
  const el = document.createElement('div')
  el.style.position = 'relative'
  document.body.appendChild(el)
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect

  return {
    el,
    chart: {
      timeScale: () => ({
        coordinateToTime: vi.fn((x: number) => x * 10),
        timeToCoordinate: vi.fn((t: number) => t / 10),
      }),
      chartElement: () => el,
      applyOptions: vi.fn(),
    },
  }
}

function createMockSeries() {
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    createPriceLine: vi.fn(() => ({})),
    removePriceLine: vi.fn(),
    data: vi.fn().mockReturnValue([
      { time: 1000, open: 100, high: 110, low: 90, close: 105 },
      { time: 2000, open: 105, high: 115, low: 95, close: 110 },
      { time: 3000, open: 110, high: 120, low: 100, close: 115 },
    ]),
  }
}

function createMockProvider(result: AnalysisResult = {}): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue(result),
  }
}

function fireDrag(el: HTMLElement, fromX: number, toX: number) {
  el.dispatchEvent(new MouseEvent('mousedown', { clientX: fromX, bubbles: true }))
  el.dispatchEvent(new MouseEvent('mousemove', { clientX: toX, bubbles: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { clientX: toX, bubbles: true }))
}

describe('createAgentOverlay', () => {
  it('returns AgentOverlay with expected methods', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })

    expect(agent.destroy).toBeInstanceOf(Function)
    expect(agent.clearOverlays).toBeInstanceOf(Function)
    expect(agent.setSelectionEnabled).toBeInstanceOf(Function)
    expect(agent.on).toBeInstanceOf(Function)
  })

  it('on() returns an unsubscribe function', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const handler = vi.fn()
    const unsub = agent.on('analyze-start', handler)

    expect(typeof unsub).toBe('function')
  })

  it('destroy cleans up without errors', () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    expect(() => agent.destroy()).not.toThrow()

    el.remove()
  })

  it('clearOverlays does not throw when no overlays exist', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    expect(() => agent.clearOverlays()).not.toThrow()
  })

  it('emits analyze-complete after successful provider call', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const result = {
      explanation: 'Support at 100',
      priceLines: [{ price: 100, title: 'Support' }],
    }
    const provider = createMockProvider(result)

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onComplete = vi.fn()
    agent.on('analyze-complete', onComplete)

    agent.setSelectionEnabled(true)
    fireDrag(el, 10, 50)

    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'Find support levels'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(
          expect.objectContaining({
            explanation: {
              sections: [{ label: 'Analysis', content: 'Support at 100' }],
            },
          }),
        )
      })
    }

    el.remove()
  })

  it('emits error when provider rejects', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider: LLMProvider = {
      analyze: vi.fn().mockRejectedValue(new Error('API failed')),
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onError = vi.fn()
    agent.on('error', onError)

    agent.setSelectionEnabled(true)
    fireDrag(el, 10, 50)

    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'test'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'API failed' }))
      })
    }

    el.remove()
  })

  it('swallows AbortError when request is cancelled', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider: LLMProvider = {
      analyze: vi.fn().mockImplementation((_ctx, _prompt, signal) => {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }),
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onError = vi.fn()
    agent.on('error', onError)

    // First drag selection and submit
    agent.setSelectionEnabled(true)
    fireDrag(el, 10, 50)

    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'test'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    // New drag selection while request is in-flight — triggers abort
    fireDrag(el, 20, 60)

    // AbortError should be swallowed, not emitted
    await new Promise((r) => setTimeout(r, 50))
    expect(onError).not.toHaveBeenCalled()

    el.remove()
  })
})
