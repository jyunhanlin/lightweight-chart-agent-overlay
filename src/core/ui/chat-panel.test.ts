// src/core/ui/chat-panel.test.ts
import type { ChatTurn, AnalysisPreset } from '../types'
import { ChatPanel } from './chat-panel'

function makeTurn(overrides: Partial<ChatTurn> = {}): ChatTurn {
  return {
    userMessage: 'test question',
    rawResponse: '## Answer\ntest response',
    result: { explanation: { sections: [{ label: 'Answer', content: 'test response' }] } },
    model: 'claude-haiku',
    presets: [{ label: 'Technical', systemPrompt: '', quickPrompt: '' }],
    ...overrides,
  }
}

const MODELS = [
  { id: 'claude-haiku', label: 'Haiku' },
  { id: 'claude-sonnet', label: 'Sonnet' },
]

const PRESETS: readonly AnalysisPreset[] = [
  { label: 'Technical', systemPrompt: 'sys', quickPrompt: 'quick' },
]

describe('ChatPanel', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.restoreAllMocks()
  })

  // ── 1. show() creates panel with header, message list, and input ──────────

  it('show() creates panel with header, message list, and input', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    const wrapper = container.querySelector('[data-agent-overlay-chat]')
    expect(wrapper).not.toBeNull()

    // header (nav bar)
    const nav = wrapper!.querySelector('[data-agent-overlay-nav]')
    expect(nav).not.toBeNull()

    // message list container
    const msgList = wrapper!.querySelector('[data-agent-overlay-message-list]')
    expect(msgList).not.toBeNull()

    // input container
    const inputEl = wrapper!.querySelector('[data-agent-overlay-chat-input]')
    expect(inputEl).not.toBeNull()

    panel.destroy()
  })

  // ── 2. header has history nav, collapse toggle, close button ─────────────

  it('header has history nav, collapse toggle, and close button', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 1, totalCount: 3 })

    const nav = container.querySelector('[data-agent-overlay-nav]')!
    expect(nav).not.toBeNull()

    // prev / counter / next
    expect(nav.querySelector('[data-agent-overlay-nav-prev]')).not.toBeNull()
    expect(nav.querySelector('[data-agent-overlay-nav-next]')).not.toBeNull()
    // counter shows N/M
    expect(nav.textContent).toContain('2')
    expect(nav.textContent).toContain('3')

    // collapse toggle
    expect(nav.querySelector('[data-agent-overlay-collapse]')).not.toBeNull()

    // close button
    expect(nav.querySelector('[data-agent-overlay-close]')).not.toBeNull()

    panel.destroy()
  })

  // ── 3. close button fires onClose ─────────────────────────────────────────

  it('close button fires onClose', () => {
    const panel = new ChatPanel(container)
    const onClose = vi.fn()
    panel.onClose = onClose
    panel.show({ currentIndex: 0, totalCount: 1 })

    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()

    expect(onClose).toHaveBeenCalledTimes(1)
    panel.destroy()
  })

  // ── 4. collapse toggle hides / shows content area ─────────────────────────

  it('collapse toggle hides and shows content area', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    const wrapper = container.querySelector('[data-agent-overlay-chat]') as HTMLElement
    const collapseBtn = wrapper.querySelector('[data-agent-overlay-collapse]') as HTMLButtonElement
    const msgList = wrapper.querySelector('[data-agent-overlay-message-list]') as HTMLElement
    const chatInput = wrapper.querySelector('[data-agent-overlay-chat-input]') as HTMLElement

    // initially visible
    expect(msgList.style.display).not.toBe('none')
    expect(chatInput.style.display).not.toBe('none')

    // collapse
    collapseBtn.click()
    expect(msgList.style.display).toBe('none')
    expect(chatInput.style.display).toBe('none')
    expect(collapseBtn.textContent).toBe('\u25fb') // ◻

    // expand
    collapseBtn.click()
    expect(msgList.style.display).not.toBe('none')
    expect(chatInput.style.display).not.toBe('none')
    expect(collapseBtn.textContent).toBe('\u2013') // –

    panel.destroy()
  })

  // ── 5. Escape fires onClose when not streaming ────────────────────────────

  it('Escape fires onClose when not streaming', () => {
    const panel = new ChatPanel(container)
    const onClose = vi.fn()
    panel.onClose = onClose
    panel.show({ currentIndex: 0, totalCount: 1 })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
    panel.destroy()
  })

  // ── 6. Escape fires onAbort when streaming ────────────────────────────────

  it('Escape fires onAbort when streaming', () => {
    const panel = new ChatPanel(container)
    const onAbort = vi.fn()
    const onClose = vi.fn()
    panel.onAbort = onAbort
    panel.onClose = onClose
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.startStreaming('why drop?')
    expect(panel.isStreaming).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    panel.destroy()
  })

  // ── 7. onSubmit propagates from ChatInput ─────────────────────────────────

  it('onSubmit propagates from ChatInput', () => {
    const panel = new ChatPanel(container, { availableModels: MODELS })
    const onSubmit = vi.fn()
    panel.onSubmit = onSubmit
    panel.show({ currentIndex: 0, totalCount: 1 })

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'hello world'
    textarea.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
    )

    expect(onSubmit).toHaveBeenCalledWith('hello world')
    panel.destroy()
  })

  // ── 8. addTurn delegates to message list ─────────────────────────────────

  it('addTurn delegates to message list', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.addTurn(makeTurn({ userMessage: 'hello' }))

    const bubble = container.querySelector('[data-chat-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble!.textContent).toBe('hello')
    panel.destroy()
  })

  // ── 9. startStreaming sets isStreaming to true ────────────────────────────

  it('startStreaming sets isStreaming to true', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    expect(panel.isStreaming).toBe(false)
    panel.startStreaming('stream question')
    expect(panel.isStreaming).toBe(true)
    panel.destroy()
  })

  // ── 10. finalizeTurn sets isStreaming to false ────────────────────────────

  it('finalizeTurn sets isStreaming to false', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.startStreaming('stream question')
    expect(panel.isStreaming).toBe(true)

    panel.finalizeTurn(makeTurn())
    expect(panel.isStreaming).toBe(false)
    panel.destroy()
  })

  // ── 11. hide() removes panel from DOM ────────────────────────────────────

  it('hide() removes panel from DOM', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })
    expect(container.querySelector('[data-agent-overlay-chat]')).not.toBeNull()

    panel.hide()
    expect(container.querySelector('[data-agent-overlay-chat]')).toBeNull()
    panel.destroy()
  })

  // ── 12. isVisible() returns correct state ────────────────────────────────

  it('isVisible() returns correct state', () => {
    const panel = new ChatPanel(container)

    expect(panel.isVisible()).toBe(false)

    panel.show({ currentIndex: 0, totalCount: 1 })
    expect(panel.isVisible()).toBe(true)

    panel.hide()
    expect(panel.isVisible()).toBe(false)

    panel.destroy()
  })

  // ── 13. destroy() cleans up ───────────────────────────────────────────────

  it('destroy() cleans up', () => {
    const panel = new ChatPanel(container)
    const onClose = vi.fn()
    panel.onClose = onClose
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.destroy()

    // Panel removed from DOM
    expect(container.querySelector('[data-agent-overlay-chat]')).toBeNull()
    // Callbacks nulled — subsequent hide() does NOT fire onClose
    expect(onClose).not.toHaveBeenCalled()
  })

  // ── Extra: onTurnClick propagates from ChatMessageList ───────────────────

  it('onTurnClick propagates from message list', () => {
    const panel = new ChatPanel(container)
    const onTurnClick = vi.fn()
    panel.onTurnClick = onTurnClick
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.addTurn(makeTurn())
    panel.addTurn(makeTurn())

    const turns = container.querySelectorAll('[data-turn-index]')
    ;(turns[1] as HTMLElement).click()

    expect(onTurnClick).toHaveBeenCalledWith(1)
    panel.destroy()
  })

  // ── Extra: navigate callbacks fire correctly ─────────────────────────────

  it('left/right nav buttons fire onNavigate', () => {
    const panel = new ChatPanel(container)
    const onNavigate = vi.fn()
    panel.onNavigate = onNavigate
    panel.show({ currentIndex: 1, totalCount: 3 })

    const prevBtn = container.querySelector('[data-agent-overlay-nav-prev]') as HTMLButtonElement
    const nextBtn = container.querySelector('[data-agent-overlay-nav-next]') as HTMLButtonElement

    prevBtn.click()
    expect(onNavigate).toHaveBeenCalledWith(-1)

    nextBtn.click()
    expect(onNavigate).toHaveBeenCalledWith(1)

    panel.destroy()
  })

  // ── Extra: close during streaming fires onAbort ───────────────────────────

  it('close button during streaming fires onAbort, not onClose', () => {
    const panel = new ChatPanel(container)
    const onAbort = vi.fn()
    const onClose = vi.fn()
    panel.onAbort = onAbort
    panel.onClose = onClose
    panel.show({ currentIndex: 0, totalCount: 1 })
    panel.startStreaming('question')

    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()

    expect(onAbort).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    panel.destroy()
  })

  // ── Extra: getSelectedModel / getSelectedPresets delegate to ChatInput ────

  it('getSelectedModel returns selected model from ChatInput', () => {
    const panel = new ChatPanel(container, { availableModels: MODELS })
    panel.show({ currentIndex: 0, totalCount: 1 })

    const model = panel.getSelectedModel()
    expect(model).toBe('claude-haiku')
    panel.destroy()
  })

  it('getSelectedPresets returns selected presets from ChatInput', () => {
    const panel = new ChatPanel(container, { availableModels: MODELS, presets: PRESETS })
    panel.show({ currentIndex: 0, totalCount: 1 })

    const presets = panel.getSelectedPresets()
    expect(presets.length).toBe(1)
    expect(presets[0].label).toBe('Technical')
    panel.destroy()
  })

  // ── Extra: show() applies position ───────────────────────────────────────

  it('show() applies position when provided', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1, position: { left: 42, top: 100 } })

    const wrapper = container.querySelector('[data-agent-overlay-chat]') as HTMLElement
    expect(wrapper.style.left).toBe('42px')
    expect(wrapper.style.top).toBe('100px')
    panel.destroy()
  })

  // ── Extra: setLoading delegates to ChatInput ──────────────────────────────

  it('setLoading disables textarea when true', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })

    panel.setLoading(true)
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)

    panel.setLoading(false)
    expect(textarea.disabled).toBe(false)
    panel.destroy()
  })

  // ── Extra: show() replaces existing panel without duplicate ──────────────

  it('show() replaces existing panel without creating duplicates', () => {
    const panel = new ChatPanel(container)
    panel.show({ currentIndex: 0, totalCount: 1 })
    panel.show({ currentIndex: 1, totalCount: 3 })

    const panels = container.querySelectorAll('[data-agent-overlay-chat]')
    expect(panels.length).toBe(1)
    panel.destroy()
  })
})
