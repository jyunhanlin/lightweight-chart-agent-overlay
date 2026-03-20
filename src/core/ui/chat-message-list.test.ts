// src/core/ui/chat-message-list.test.ts
import type { ChatTurn } from '../types'
import { ChatMessageList } from './chat-message-list'

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

describe('ChatMessageList', () => {
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

  it('constructor creates empty container', () => {
    const list = new ChatMessageList(container)
    expect(container.children.length).toBe(0)
    list.destroy()
  })

  it('addTurn renders user bubble and AI response', () => {
    const list = new ChatMessageList(container)
    list.addTurn(makeTurn())

    const bubble = container.querySelector('[data-chat-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble!.textContent).toBe('test question')

    const markdown = container.querySelector('[data-agent-overlay-markdown]')
    expect(markdown).not.toBeNull()
    expect(markdown!.innerHTML).toContain('test response')

    list.destroy()
  })

  it('addTurn renders model and preset tags', () => {
    const list = new ChatMessageList(container)
    list.addTurn(makeTurn())

    const tags = container.querySelector('[data-chat-tags]')
    expect(tags).not.toBeNull()
    expect(tags!.textContent).toContain('claude-haiku')
    expect(tags!.textContent).toContain('Technical')

    list.destroy()
  })

  it('multiple addTurn calls render multiple turns', () => {
    const list = new ChatMessageList(container)
    list.addTurn(makeTurn({ userMessage: 'first' }))
    list.addTurn(makeTurn({ userMessage: 'second' }))
    list.addTurn(makeTurn({ userMessage: 'third' }))

    const turns = container.querySelectorAll('[data-turn-index]')
    expect(turns.length).toBe(3)
    expect((turns[0] as HTMLElement).dataset.turnIndex).toBe('0')
    expect((turns[1] as HTMLElement).dataset.turnIndex).toBe('1')
    expect((turns[2] as HTMLElement).dataset.turnIndex).toBe('2')

    list.destroy()
  })

  it('clicking a turn fires onTurnClick with correct index', () => {
    const list = new ChatMessageList(container)
    const onTurnClick = vi.fn()
    list.onTurnClick = onTurnClick

    list.addTurn(makeTurn({ userMessage: 'first' }))
    list.addTurn(makeTurn({ userMessage: 'second' }))

    const turns = container.querySelectorAll('[data-turn-index]')
    ;(turns[1] as HTMLElement).click()

    expect(onTurnClick).toHaveBeenCalledWith(1)

    list.destroy()
  })

  it('setActiveTurn highlights the active turn', () => {
    const list = new ChatMessageList(container)
    list.addTurn(makeTurn())
    list.addTurn(makeTurn())

    list.setActiveTurn(1)

    const turns = container.querySelectorAll('[data-turn-index]')
    const turn0 = turns[0] as HTMLElement
    const turn1 = turns[1] as HTMLElement

    expect(turn0.style.borderLeftColor).toBe('transparent')
    expect(turn1.style.borderLeftColor).toBe('var(--ao-bubble-bg)')

    list.destroy()
  })

  it('startStreaming adds user bubble and streaming area', () => {
    const list = new ChatMessageList(container)
    list.startStreaming('why drop?', 'claude-haiku', [
      { label: 'Technical', systemPrompt: '', quickPrompt: '' },
    ])

    const bubble = container.querySelector('[data-chat-bubble]')
    expect(bubble).not.toBeNull()
    expect(bubble!.textContent).toBe('why drop?')

    const streamText = container.querySelector('[data-chat-stream-text]')
    expect(streamText).not.toBeNull()

    const cursor = container.querySelector('[data-chat-stream-cursor]')
    expect(cursor).not.toBeNull()
    expect(cursor!.textContent).toBe('▌')

    list.destroy()
  })

  it('setStreamText renders markdown in streaming area', () => {
    const list = new ChatMessageList(container)
    list.startStreaming('why drop?')
    list.setStreamText('**bold** text')

    const streamText = container.querySelector('[data-chat-stream-text]')
    expect(streamText).not.toBeNull()
    expect(streamText!.innerHTML).toContain('<strong>bold</strong>')

    list.destroy()
  })

  it('finalizeTurn replaces streaming with static content', () => {
    const list = new ChatMessageList(container)
    list.startStreaming('why drop?', 'claude-haiku')
    list.setStreamText('streaming...')
    list.finalizeTurn(makeTurn({ userMessage: 'why drop?', rawResponse: '## Answer\nfinal text' }))

    // streaming area should be gone
    expect(container.querySelector('[data-chat-stream-text]')).toBeNull()
    expect(container.querySelector('[data-chat-stream-cursor]')).toBeNull()

    // static markdown content should be present
    const markdown = container.querySelector('[data-agent-overlay-markdown]')
    expect(markdown).not.toBeNull()
    expect(markdown!.innerHTML).toContain('test response')

    list.destroy()
  })

  it('showError displays inline error message', () => {
    const list = new ChatMessageList(container)
    list.showError('Something went wrong')

    const error = container.querySelector('[data-chat-error]')
    expect(error).not.toBeNull()
    expect(error!.textContent).toContain('Something went wrong')

    list.destroy()
  })

  it('clear removes all turns', () => {
    const list = new ChatMessageList(container)
    list.addTurn(makeTurn())
    list.addTurn(makeTurn())
    list.addTurn(makeTurn())

    list.clear()

    const turns = container.querySelectorAll('[data-turn-index]')
    expect(turns.length).toBe(0)
    expect(container.children.length).toBe(0)

    list.destroy()
  })
})
