// src/core/ui/explanation-popup.test.ts
import type { HistoryEntry } from '../types'
import { ExplanationPopup } from './explanation-popup'

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    prompt: 'What is the support level?',
    isQuickRun: false,
    model: 'claude-haiku-4-5',
    presets: [
      { label: 'Technical', systemPrompt: '', quickPrompt: '' },
      { label: 'Entry/Exit', systemPrompt: '', quickPrompt: '' },
    ],
    result: {
      explanation: {
        sections: [
          { label: 'Technical', content: 'Support at $82,340...' },
          { label: 'Entry/Exit', content: 'Bullish flag forming...' },
        ],
      },
    },
    range: { from: 1000, to: 2000 },
    ...overrides,
  }
}

describe('ExplanationPopup', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  // --- Section rendering ---

  it('shows structured sections with label and content', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const el = container.querySelector('[data-agent-overlay-explanation]')!
    expect(el).not.toBeNull()
    const labels = el.querySelectorAll('[data-agent-overlay-section-label]')
    const contents = el.querySelectorAll('[data-agent-overlay-section-content]')
    expect(labels).toHaveLength(2)
    expect(contents).toHaveLength(2)
    expect(labels[0].textContent).toBe('Technical')
    expect(contents[0].textContent).toBe('Support at $82,340...')
    expect(labels[1].textContent).toBe('Entry/Exit')
    expect(contents[1].textContent).toBe('Bullish flag forming...')
  })

  it('renders sections even when explanation has no sections array (empty)', () => {
    const entry = makeEntry({ result: { explanation: { sections: [] } } })
    const popup = new ExplanationPopup(container)
    popup.show({ entry, currentIndex: 0, totalCount: 1 })
    const el = container.querySelector('[data-agent-overlay-explanation]')!
    expect(el).not.toBeNull()
    expect(el.querySelectorAll('[data-agent-overlay-section-label]')).toHaveLength(0)
  })

  // --- Context area: custom prompt bubble ---

  it('shows user prompt as chat bubble when isQuickRun is false', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry({ isQuickRun: false }), currentIndex: 0, totalCount: 1 })
    const bubble = container.querySelector('[data-agent-overlay-prompt-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble!.textContent).toContain('What is the support level?')
  })

  it('does not show chat bubble when isQuickRun is true', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry({ isQuickRun: true }), currentIndex: 0, totalCount: 1 })
    expect(container.querySelector('[data-agent-overlay-prompt-bubble]')).toBeNull()
  })

  // --- Context area: quick-run indicator bar ---

  it('shows quick-run indicator bar when isQuickRun is true', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry({ isQuickRun: true }), currentIndex: 0, totalCount: 1 })
    const bar = container.querySelector('[data-agent-overlay-quick-indicator]')
    expect(bar).not.toBeNull()
    expect(bar!.textContent).toContain('Quick')
  })

  it('does not show quick-run indicator when isQuickRun is false', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry({ isQuickRun: false }), currentIndex: 0, totalCount: 1 })
    expect(container.querySelector('[data-agent-overlay-quick-indicator]')).toBeNull()
  })

  // --- Tags row ---

  it('shows model and preset tags', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const tags = container.querySelector('[data-agent-overlay-tags]')!
    expect(tags).not.toBeNull()
    expect(tags.textContent).toContain('claude-haiku-4-5')
    expect(tags.textContent).toContain('Technical')
    expect(tags.textContent).toContain('Entry/Exit')
  })

  it('hides model tag when model is undefined', () => {
    const entry = makeEntry({ model: undefined })
    const popup = new ExplanationPopup(container)
    popup.show({ entry, currentIndex: 0, totalCount: 1 })
    const modelTag = container.querySelector('[data-agent-overlay-model-tag]')
    expect(modelTag).toBeNull()
  })

  it('shows model tag when model is defined', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const modelTag = container.querySelector('[data-agent-overlay-model-tag]')
    expect(modelTag).not.toBeNull()
    expect(modelTag!.textContent).toBe('claude-haiku-4-5')
  })

  // --- History nav ---

  it('shows history nav with correct N / M counter', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 2, totalCount: 5 })
    const nav = container.querySelector('[data-agent-overlay-nav]')!
    expect(nav).not.toBeNull()
    expect(nav.textContent).toContain('3')
    expect(nav.textContent).toContain('5')
  })

  it('hides nav controls when totalCount is 1', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const nav = container.querySelector('[data-agent-overlay-nav]') as HTMLElement
    expect(nav).not.toBeNull()
    const navLeft = nav.firstElementChild as HTMLElement
    expect(navLeft.style.visibility).toBe('hidden')
  })

  it('disables left arrow at index 0', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 3 })
    const leftBtn = container.querySelector('[data-agent-overlay-nav-prev]') as HTMLButtonElement
    expect(leftBtn).not.toBeNull()
    expect(leftBtn.disabled).toBe(true)
  })

  it('disables right arrow at last index', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 2, totalCount: 3 })
    const rightBtn = container.querySelector('[data-agent-overlay-nav-next]') as HTMLButtonElement
    expect(rightBtn).not.toBeNull()
    expect(rightBtn.disabled).toBe(true)
  })

  it('enables left arrow when not at index 0', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 1, totalCount: 3 })
    const leftBtn = container.querySelector('[data-agent-overlay-nav-prev]') as HTMLButtonElement
    expect(leftBtn.disabled).toBe(false)
  })

  it('enables right arrow when not at last index', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 3 })
    const rightBtn = container.querySelector('[data-agent-overlay-nav-next]') as HTMLButtonElement
    expect(rightBtn.disabled).toBe(false)
  })

  // --- Callbacks ---

  it('fires onNavigate(-1) when left arrow is clicked', () => {
    const popup = new ExplanationPopup(container)
    const onNavigate = vi.fn()
    popup.onNavigate = onNavigate
    popup.show({ entry: makeEntry(), currentIndex: 1, totalCount: 3 })
    const leftBtn = container.querySelector('[data-agent-overlay-nav-prev]') as HTMLButtonElement
    leftBtn.click()
    expect(onNavigate).toHaveBeenCalledWith(-1)
  })

  it('fires onNavigate(1) when right arrow is clicked', () => {
    const popup = new ExplanationPopup(container)
    const onNavigate = vi.fn()
    popup.onNavigate = onNavigate
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 3 })
    const rightBtn = container.querySelector('[data-agent-overlay-nav-next]') as HTMLButtonElement
    rightBtn.click()
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('fires onClose when close button is clicked', () => {
    const popup = new ExplanationPopup(container)
    const onClose = vi.fn()
    popup.onClose = onClose
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('fires onClose when Escape is pressed', () => {
    const popup = new ExplanationPopup(container)
    const onClose = vi.fn()
    popup.onClose = onClose
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // --- Draggable / event isolation ---

  it('stops propagation on mousedown (draggable)', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    const el = container.querySelector('[data-agent-overlay-explanation]') as HTMLElement
    const parentListener = vi.fn()
    container.addEventListener('mousedown', parentListener)
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(parentListener).not.toHaveBeenCalled()
    container.removeEventListener('mousedown', parentListener)
  })

  // --- hide / destroy ---

  it('hide() removes DOM element', () => {
    const popup = new ExplanationPopup(container)
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    popup.hide()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('destroy() cleans up and removes element', () => {
    const popup = new ExplanationPopup(container)
    const onClose = vi.fn()
    popup.onClose = onClose
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    popup.destroy()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
    // After destroy, onClose should be nulled out — further hides do NOT fire
    expect(onClose).not.toHaveBeenCalled()
  })

  it('hide() does not throw when called without show()', () => {
    const popup = new ExplanationPopup(container)
    expect(() => popup.hide()).not.toThrow()
  })

  // --- Position support ---

  it('applies position when provided', () => {
    const popup = new ExplanationPopup(container)
    popup.show({
      entry: makeEntry(),
      currentIndex: 0,
      totalCount: 1,
      position: { left: 42, top: 10 },
    })
    const el = container.querySelector('[data-agent-overlay-explanation]') as HTMLElement
    expect(el.style.left).toBe('42px')
  })
})
