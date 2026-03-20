// src/core/agent-overlay.test.ts
import { createAgentOverlay } from './agent-overlay'
import type { LLMProvider, AnalysisResult, PromptBuilder } from './types'

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
  return el.querySelector('[data-agent-overlay-chat] textarea')
}

function submitPrompt(el: HTMLElement, text: string) {
  const textarea = getTextarea(el)
  if (!textarea) return
  textarea.value = text
  textarea.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
  )
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

function createStreamingProvider(chunks: string[], result: AnalysisResult = {}): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue(result),
    async *analyzeStream() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('createAgentOverlay', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

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
      const errorDiv = el.querySelector('[data-chat-error]') as HTMLElement | null
      expect(errorDiv).not.toBeNull()
      expect(errorDiv?.textContent).toBe('API failed')
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

      // In multi-turn mode, the userMessage is passed directly to the provider
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
        presets: [],
      })

      selectAndSubmit(agent, el, 'user text')

      await vi.waitFor(() => {
        expect(customBuilder.build).toHaveBeenCalledWith({
          userPrompt: 'user text',
          selectedPresets: [],
          isQuickRun: false,
        })
      })

      // Provider receives the raw userMessage (not the builder's prompt)
      const call = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[1]).toBe('user text')

      el.remove()
    })

    it('provider receives AnalyzeOptions with model, additionalSystemPrompt, and chatMessages', async () => {
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
      expect(call[3]).toEqual(
        expect.objectContaining({
          model: undefined,
          additionalSystemPrompt: 'system instructions',
          chatMessages: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        }),
      )

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
      expect(call[3]).toEqual(
        expect.objectContaining({
          model: undefined,
          additionalSystemPrompt: undefined,
        }),
      )

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

    it('updates badge count after multiple analyses (new selections)', async () => {
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

      // Second analysis — new selection starts new chat
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

    it('closing chat panel clears overlay but preserves history', async () => {
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

      // Close the chat panel via its close button
      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
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

  describe('Provider auth — apiKey and headers', () => {
    it('passes apiKey from localStorage to provider.analyze()', async () => {
      localStorage.setItem('agent-overlay-api-key', 'sk-stored')
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        requiresApiKey: true,
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      const options = (provider.analyze as any).mock.calls[0][3]
      expect(options.apiKey).toBe('sk-stored')
      agent.destroy()
      localStorage.clear()
    })

    it('resolves static provider.headers and passes to analyze()', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        headers: { Authorization: 'Bearer token123' },
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      const options = (provider.analyze as any).mock.calls[0][3]
      expect(options.headers).toEqual({ Authorization: 'Bearer token123' })
      agent.destroy()
    })

    it('resolves async provider.headers and passes to analyze()', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        headers: async () => ({ 'X-Custom': 'async-value' }),
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      const options = (provider.analyze as any).mock.calls[0][3]
      expect(options.headers).toEqual({ 'X-Custom': 'async-value' })
      agent.destroy()
    })

    it('does not pass apiKey when provider does not require it', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      const options = (provider.analyze as any).mock.calls[0][3]
      expect(options.apiKey).toBeUndefined()
      agent.destroy()
    })

    it('auto-opens settings panel when requiresApiKey and no key available', async () => {
      localStorage.clear()
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        requiresApiKey: true,
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      // Give async a tick
      await new Promise((r) => setTimeout(r, 10))
      // Settings panel should be open
      expect(el.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
      // Provider should NOT have been called
      expect(provider.analyze).not.toHaveBeenCalled()
      agent.destroy()
    })

    it('auto-opens settings panel on 401 auth error', async () => {
      localStorage.setItem('agent-overlay-api-key', 'sk-bad')
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        requiresApiKey: true,
        analyze: vi.fn().mockRejectedValue(new Error('Anthropic API error (401): Invalid API key')),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(el.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
      })
      const msg = el.querySelector('[data-agent-overlay-settings-message]') as HTMLElement
      expect(msg.textContent).toContain('Invalid API key')
      agent.destroy()
      localStorage.clear()
    })
  })

  describe('History navigation', () => {
    it('history button click when nothing showing restores latest entry', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({
        explanation: 'Support at 100',
        priceLines: [{ price: 100, title: 'Support' }],
      })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // Run an analysis to populate history
      selectAndSubmit(agent, el, 'Find support')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalled())
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close the chat panel (this clears overlays)
      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn?.click()

      // Verify chat panel is gone
      expect(el.querySelector('[data-agent-overlay-chat]')).toBeNull()

      // Click history button
      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      // Chat panel should reappear with the entry
      const chatPanel = el.querySelector('[data-agent-overlay-chat]')
      expect(chatPanel).not.toBeNull()

      // Overlay should be rendered (renderer.render was called)
      // The series.createPriceLine proves overlays were re-rendered
      // (First call from initial analysis, second from history restore)
      expect(series.createPriceLine).toHaveBeenCalledTimes(2)

      el.remove()
    })

    it('history button click when chat panel already showing is a no-op', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({
        explanation: 'result',
        priceLines: [{ price: 100, title: 'S' }],
      })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      selectAndSubmit(agent, el, 'test')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalled())
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Chat panel is already showing — clicking history button should be no-op
      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      const panelBefore = el.querySelector('[data-agent-overlay-chat]')

      histBtn.click()

      // Chat panel should still be the same (no-op)
      const panelAfter = el.querySelector('[data-agent-overlay-chat]')
      expect(panelAfter).not.toBeNull()
      expect(panelAfter).toBe(panelBefore)

      el.remove()
    })

    it('navigate forward (onNavigate(1)) switches to next entry', async () => {
      const el = document.createElement('div')
      el.style.position = 'relative'
      document.body.appendChild(el)
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect

      const chart = {
        timeScale: () => ({
          coordinateToTime: vi.fn((x: number) => x * 10),
          timeToCoordinate: vi.fn((t: number) => t / 10),
        }),
        chartElement: () => el,
        applyOptions: vi.fn(),
      }
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'first' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First analysis
      selectAndSubmit(agent, el, 'first')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close chat panel
      const closeBtn1 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn1?.click()

      // Second analysis
      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'second',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'second')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close chat panel, then use history to go back
      const closeBtn2 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn2?.click()

      // Click history button to show latest (index 1)
      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      // Nav bar should show "2 / 2"
      await vi.waitFor(() => {
        const nav = el.querySelector('[data-agent-overlay-nav]')
        expect(nav).not.toBeNull()
      })

      // Navigate backward to index 0
      const prevBtn = el.querySelector('[data-agent-overlay-nav-prev]') as HTMLElement
      prevBtn?.click()

      // Should now show first entry content
      await vi.waitFor(() => {
        const sectionContent = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
        expect(sectionContent?.textContent).toContain('first')
      })

      // Navigate forward back to index 1
      const nextBtn = el.querySelector('[data-agent-overlay-nav-next]') as HTMLElement
      nextBtn?.click()

      await vi.waitFor(() => {
        const sectionContent = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
        expect(sectionContent?.textContent).toContain('second')
      })

      el.remove()
    })

    it('navigate backward (onNavigate(-1)) switches to previous entry', async () => {
      const el = document.createElement('div')
      el.style.position = 'relative'
      document.body.appendChild(el)
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect

      const chart = {
        timeScale: () => ({
          coordinateToTime: vi.fn((x: number) => x * 10),
          timeToCoordinate: vi.fn((t: number) => t / 10),
        }),
        chartElement: () => el,
        applyOptions: vi.fn(),
      }
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'alpha' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First analysis
      selectAndSubmit(agent, el, 'alpha prompt')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close and do second analysis
      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn?.click()

      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'beta',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'beta prompt')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close, then open from history
      const closeBtn2 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn2?.click()

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      // Currently showing index 1 (beta). Navigate backward.
      const prevBtn = el.querySelector('[data-agent-overlay-nav-prev]') as HTMLElement
      prevBtn?.click()

      // Should show alpha
      await vi.waitFor(() => {
        const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
        expect(content?.textContent).toContain('alpha')
      })

      el.remove()
    })

    it('navigation at boundaries does nothing', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'only entry' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // Single analysis
      selectAndSubmit(agent, el, 'test')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalled())
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // With a single entry, close and use history button
      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn?.click()

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      // Only 1 entry, so nav controls are hidden
      const nav = el.querySelector('[data-agent-overlay-nav]') as HTMLElement
      expect(nav).not.toBeNull()
      const navLeft = nav.firstElementChild as HTMLElement
      expect(navLeft.style.visibility).toBe('hidden')

      // Chat panel still shows the single entry
      const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
      expect(content?.textContent).toContain('only entry')

      el.remove()
    })

    it('navigation at first entry cannot go further left', async () => {
      const el = document.createElement('div')
      el.style.position = 'relative'
      document.body.appendChild(el)
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect

      const chart = {
        timeScale: () => ({
          coordinateToTime: vi.fn((x: number) => x * 10),
          timeToCoordinate: vi.fn((t: number) => t / 10),
        }),
        chartElement: () => el,
        applyOptions: vi.fn(),
      }
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'first' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // Two analyses
      selectAndSubmit(agent, el, 'first')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn?.click()

      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'second',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'second')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close, open from history, navigate to first
      const closeBtn2 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn2?.click()

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      // Navigate back to first entry (index 0)
      const prevBtn = el.querySelector('[data-agent-overlay-nav-prev]') as HTMLElement
      prevBtn?.click()

      await vi.waitFor(() => {
        const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
        expect(content?.textContent).toContain('first')
      })

      // Try to navigate further left — should do nothing
      const prevBtn2 = el.querySelector('[data-agent-overlay-nav-prev]') as HTMLElement
      prevBtn2?.click()

      // Still showing first entry
      const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
      expect(content?.textContent).toContain('first')

      el.remove()
    })

    it('navigation at last entry cannot go further right', async () => {
      const el = document.createElement('div')
      el.style.position = 'relative'
      document.body.appendChild(el)
      el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 }) as DOMRect

      const chart = {
        timeScale: () => ({
          coordinateToTime: vi.fn((x: number) => x * 10),
          timeToCoordinate: vi.fn((t: number) => t / 10),
        }),
        chartElement: () => el,
        applyOptions: vi.fn(),
      }
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'first' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // Two analyses
      selectAndSubmit(agent, el, 'first')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn?.click()

      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'second',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'second')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Already at last entry (index 1). Try to go right.
      const closeBtn2 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn2?.click()

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      const nextBtn = el.querySelector('[data-agent-overlay-nav-next]') as HTMLElement
      nextBtn?.click()

      // Still showing second entry
      const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
      expect(content?.textContent).toContain('second')

      el.remove()
    })

    it('currentHistoryIndex updates after new analysis', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({
        explanation: 'result one',
        priceLines: [{ price: 100, title: 'S' }],
      })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First analysis
      selectAndSubmit(agent, el, 'first')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close chat panel
      const closeBtn1 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn1?.click()

      // Second analysis
      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'result two',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'second')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))
      await vi.waitFor(() => expect(el.querySelector('[data-agent-overlay-chat]')).not.toBeNull())

      // Close and click history — should show latest (index 1, "result two")
      const closeBtn2 = el.querySelector('[data-agent-overlay-close]') as HTMLElement
      closeBtn2?.click()

      const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
      histBtn.click()

      const content = el.querySelector('[data-agent-overlay-markdown]') as HTMLElement
      expect(content?.textContent).toContain('result two')

      el.remove()
    })
  })

  describe('streaming path', () => {
    it('uses analyzeStream when provider has it', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createStreamingProvider([
        'Analysis text.\n\n',
        '```json\n{"priceLines":[{"price":100,"title":"S"}]}\n```',
      ])

      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        // Chat panel should be showing with streamed content
        const chat = el.querySelector('[data-agent-overlay-chat]')
        expect(chat).not.toBeNull()
      })

      expect(provider.analyze).not.toHaveBeenCalled()

      el.remove()
    })

    it('falls back to analyze when no analyzeStream', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const mockResult: AnalysisResult = {
        explanation: 'Fallback result',
        priceLines: [{ price: 100, title: 'Support' }],
      }
      const provider = createMockProvider(mockResult)

      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })

      el.remove()
    })

    it('emits analyze-start and analyze-complete for streaming', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createStreamingProvider([
        'Text.\n\n',
        '```json\n{"priceLines":[],"markers":[]}\n```',
      ])

      const agent = createAgentOverlay(chart as never, series as never, { provider })
      const onStart = vi.fn()
      const onComplete = vi.fn()
      agent.on('analyze-start', onStart)
      agent.on('analyze-complete', onComplete)

      selectAndSubmit(agent, el, 'test')

      await vi.waitFor(() => {
        expect(onStart).toHaveBeenCalledTimes(1)
        expect(onComplete).toHaveBeenCalledTimes(1)
      })

      el.remove()
    })
  })

  describe('multi-turn chat', () => {
    it('follow-up turn appends to conversation within same selection', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'first answer' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First turn
      selectAndSubmit(agent, el, 'first question')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))

      // Submit follow-up in same chat panel
      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'second answer',
      })
      submitPrompt(el, 'follow-up question')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))

      // History should still be 1 entry (updated, not pushed)
      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('1')
      })

      // Second call should have chatMessages with history of first turn
      const call2 = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[1]
      const options2 = call2[3]
      // chatMessages should contain: user(first), assistant(first rawResponse), user(follow-up)
      expect(options2.chatMessages).toHaveLength(3)
      expect(options2.chatMessages[0].role).toBe('user')
      expect(options2.chatMessages[1].role).toBe('assistant')
      expect(options2.chatMessages[2].role).toBe('user')
      expect(options2.chatMessages[2].content).toBe('follow-up question')

      el.remove()
    })

    it('new selection starts fresh chat (new history entry)', async () => {
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider = createMockProvider({ explanation: 'first chat' })

      const agent = createAgentOverlay(chart as never, series as never, { provider })

      // First selection + turn
      selectAndSubmit(agent, el, 'question 1')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(1))

      // New selection starts new chat
      ;(provider.analyze as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        explanation: 'second chat',
      })
      agent.setSelectionEnabled(true)
      fireDrag(el, 20, 60)
      submitPrompt(el, 'question 2')
      await vi.waitFor(() => expect(provider.analyze).toHaveBeenCalledTimes(2))

      // History should have 2 entries
      await vi.waitFor(() => {
        const histBtn = el.querySelector('[data-agent-overlay-history]') as HTMLElement
        const badge = histBtn.querySelector('span:last-child') as HTMLElement
        expect(badge.textContent).toBe('2')
      })

      // Second call should have chatMessages with only the new question (no prior turns)
      const call2 = (provider.analyze as ReturnType<typeof vi.fn>).mock.calls[1]
      const options2 = call2[3]
      expect(options2.chatMessages).toHaveLength(1)
      expect(options2.chatMessages[0].role).toBe('user')

      el.remove()
    })
  })
})
