// src/core/agent-overlay.test.ts
import { createAgentOverlay } from './agent-overlay'
import type { LLMProvider, AnalysisResult, PromptBuilder, AnalysisPreset } from './types'

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
    priceToCoordinate: vi.fn(() => 200),
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

function getTextarea(el: HTMLElement): HTMLTextAreaElement | null {
  return el.querySelector('textarea')
}

function submitPrompt(el: HTMLElement, text: string) {
  const textarea = getTextarea(el)
  if (!textarea) return
  textarea.value = text
  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

/** Helper: enable selection, drag, and submit a prompt in one call */
function selectAndSubmit(
  agent: ReturnType<typeof createAgentOverlay>,
  el: HTMLElement,
  text: string,
  fromX = 10,
  toX = 50,
) {
  agent.setSelectionEnabled(true)
  fireDrag(el, fromX, toX)
  submitPrompt(el, text)
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

    selectAndSubmit(agent, el, 'Find support levels')

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

    selectAndSubmit(agent, el, 'test')

    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'API failed' }))
    })

    el.remove()
  })

  it('shows error via showError when provider rejects', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider: LLMProvider = {
      analyze: vi.fn().mockRejectedValue(new Error('API failed')),
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })

    selectAndSubmit(agent, el, 'test')

    await vi.waitFor(() => {
      const errorDiv = el.querySelector('[data-agent-overlay-error]') as HTMLElement | null
      expect(errorDiv).not.toBeNull()
      expect(errorDiv?.textContent).toBe('API failed')
      expect(errorDiv?.style.display).toBe('block')
    })

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

    submitPrompt(el, 'test')

    // New drag selection while request is in-flight — triggers abort
    fireDrag(el, 20, 60)

    // AbortError should be swallowed, not emitted
    await new Promise((r) => setTimeout(r, 50))
    expect(onError).not.toHaveBeenCalled()

    el.remove()
  })

  describe('PromptBuilder integration', () => {
    it('uses defaultPromptBuilder when none provided', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'test result' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'analyze this')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      // defaultPromptBuilder passes userPrompt through as-is when no presets
      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[1]).toBe('analyze this')

      el.remove()
    })

    it('custom promptBuilder is called with correct params', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'test result' })

      const customBuilder: PromptBuilder = {
        build: vi.fn().mockReturnValue({
          prompt: 'custom prompt',
          additionalSystemPrompt: 'custom system',
        }),
      }

      const agent = createAgentOverlay(chart as never, series as never, {
        provider,
        promptBuilder: customBuilder,
      })

      selectAndSubmit(agent, el, 'user text')

      await vi.waitFor(() => {
        expect(customBuilder.build).toHaveBeenCalledWith({
          userPrompt: 'user text',
          selectedPresets: [],
          isQuickRun: false,
        })
      })

      // Provider should receive the custom prompt
      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[1]).toBe('custom prompt')

      el.remove()
    })

    it('provider receives AnalyzeOptions with model and additionalSystemPrompt', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'test result' })

      const customBuilder: PromptBuilder = {
        build: vi.fn().mockReturnValue({
          prompt: 'built prompt',
          additionalSystemPrompt: 'system instructions',
        }),
      }

      const agent = createAgentOverlay(chart as never, series as never, {
        provider,
        promptBuilder: customBuilder,
      })

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      // The 4th argument should be AnalyzeOptions
      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[3]).toEqual({
        model: undefined,
        additionalSystemPrompt: 'system instructions',
      })

      el.remove()
    })

    it('omits additionalSystemPrompt when empty', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'test result' })

      const customBuilder: PromptBuilder = {
        build: vi.fn().mockReturnValue({
          prompt: 'built prompt',
          additionalSystemPrompt: '',
        }),
      }

      const agent = createAgentOverlay(chart as never, series as never, {
        provider,
        promptBuilder: customBuilder,
      })

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[3]).toEqual({
        model: undefined,
        additionalSystemPrompt: undefined,
      })

      el.remove()
    })
  })

  describe('onQuickRun', () => {
    it('triggers the quick run flow via preset dropdown Run button', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'quick result' })

      const presets: AnalysisPreset[] = [
        {
          label: 'Support/Resistance',
          systemPrompt: 'Find S/R',
          defaultPrompt: 'Analyze S/R levels',
        },
      ]

      const agent = createAgentOverlay(chart as never, series as never, { provider, presets })

      // Need to enable selection and create a range first
      agent.setSelectionEnabled(true)
      fireDrag(el, 10, 50)

      // Find and interact with preset dropdown
      const presetWrapper = el.querySelector('[data-agent-overlay-preset-dropdown]')
      expect(presetWrapper).not.toBeNull()

      const trigger = presetWrapper?.querySelector('[data-dropdown-trigger]') as HTMLElement
      expect(trigger).not.toBeNull()

      // Open dropdown
      trigger.click()

      // Select the preset item
      const item = el.querySelector('[data-dropdown-item="preset-0"]') as HTMLElement
      expect(item).not.toBeNull()
      item.click()

      // Click Run
      const runBtn = el.querySelector('[data-dropdown-run]') as HTMLButtonElement
      expect(runBtn).not.toBeNull()
      runBtn.click()

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      // Verify the prompt was built with isQuickRun = true
      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      // The prompt should come from the preset's defaultPrompt
      expect(call[1]).toBe('Analyze S/R levels')

      el.remove()
    })
  })

  describe('HistoryStore & HistoryButton integration', () => {
    it('pushes history entry after successful analysis', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const result = {
        explanation: 'Support at 100',
        priceLines: [{ price: 100, title: 'Support' }],
      }
      const provider = createMockProvider(result)

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'Find support')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      // After analysis, history button should be visible with badge count 1
      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        expect(histBtn).not.toBeNull()
        expect(histBtn.style.display).not.toBe('none')
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('1')
      })

      el.remove()
    })

    it('updates badge count after multiple analyses', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'result' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First analysis
      selectAndSubmit(agent, el, 'first')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalledTimes(1)
      })

      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('1')
      })

      // Second analysis — need to re-select range first
      agent.setSelectionEnabled(true)
      fireDrag(el, 10, 50)
      submitPrompt(el, 'second')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalledTimes(2)
      })

      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('2')
      })

      el.remove()
    })

    it('history button is hidden when no entries', () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider()

      createAgentOverlay(chart as never, series as never, { provider })

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      expect(histBtn).not.toBeNull()
      expect(histBtn.style.display).toBe('none')

      el.remove()
    })

    it('closing popup clears overlay but preserves history', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({
        explanation: 'result',
        priceLines: [{ price: 100, title: 'S' }],
      })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      // Verify history button shows count 1
      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('1')
      })

      // Close the popup via its close button
      const closeBtn = el.querySelector('[data-agent-overlay-popup] button') as HTMLElement
      if (closeBtn) closeBtn.click()

      // History should still show count 1
      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      const badge = histBtn.querySelector('span:last-child') as HTMLElement
      expect(badge.textContent).toBe('1')

      el.remove()
    })

    it('new selection clears overlay but preserves history', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'result' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('1')
      })

      // Make a new selection — should not clear history
      fireDrag(el, 20, 60)

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      const badge = histBtn.querySelector('span:last-child') as HTMLElement
      expect(badge.textContent).toBe('1')

      el.remove()
    })

    it('destroy removes history button from DOM and clears store', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'result' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        expect(histBtn).not.toBeNull()
        expect(histBtn.style.display).not.toBe('none')
      })

      agent.destroy()

      // History button should be removed from DOM
      const histBtn = el.querySelector('[data-agent-overlay-history]')
      expect(histBtn).toBeNull()

      el.remove()
    })
  })
})
