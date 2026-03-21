// src/core/ui/chat-message-list.ts
import type { ChatTurn, AnalysisPreset } from '../types'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text) as string)
}

function injectMarkdownStyles(): void {
  const styleId = 'ao-markdown-style'
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    [data-agent-overlay-markdown] {
      font-size: 13px; color: var(--ao-text); line-height: 1.6;
      padding: 8px 12px 4px;
    }
    [data-agent-overlay-markdown] h1,
    [data-agent-overlay-markdown] h2,
    [data-agent-overlay-markdown] h3 {
      color: var(--ao-text); margin: 12px 0 4px; font-size: 14px; font-weight: 600;
    }
    [data-agent-overlay-markdown] h1 { font-size: 15px; }
    [data-agent-overlay-markdown] h2 { font-size: 14px; }
    [data-agent-overlay-markdown] h3 { font-size: 13px; }
    [data-agent-overlay-markdown] p { margin: 4px 0; }
    [data-agent-overlay-markdown] ul,
    [data-agent-overlay-markdown] ol { margin: 4px 0; padding-left: 20px; }
    [data-agent-overlay-markdown] li { margin: 2px 0; }
    [data-agent-overlay-markdown] strong { font-weight: 600; }
    [data-agent-overlay-markdown] code {
      background: var(--ao-tag-bg); padding: 1px 4px; border-radius: 3px; font-size: 12px;
    }
    [data-agent-overlay-markdown] hr {
      border: none; border-top: 1px solid var(--ao-divider); margin: 8px 0;
    }
    [data-agent-overlay-markdown] > *:first-child { margin-top: 0; }
  `
  document.head.appendChild(style)
}

function injectBlinkAnimation(): void {
  const styleId = 'ao-blink-style'
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes ao-blink {
      0%, 100% { opacity: 1; }
      50% { opacity: 0; }
    }
    [data-chat-stream-cursor] {
      animation: ao-blink 1s step-end infinite;
    }
  `
  document.head.appendChild(style)
}

function buildUserBubble(message: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    display: flex; justify-content: flex-end;
    padding: 8px 12px 4px;
  `

  const bubble = document.createElement('div')
  bubble.setAttribute('data-chat-bubble', '')
  bubble.textContent = message
  bubble.style.cssText = `
    background: var(--ao-bubble-bg); color: var(--ao-bubble-text);
    border-radius: 8px 8px 2px 8px;
    padding: 6px 10px; font-size: 12px; line-height: 1.4;
    max-width: 90%; word-break: break-word;
  `

  wrapper.appendChild(bubble)
  return wrapper
}

function buildTagsRow(model: string | undefined, presets: readonly AnalysisPreset[]): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-tags', '')
  row.style.cssText = `
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 4px 12px;
  `

  if (model !== undefined) {
    const modelTag = document.createElement('span')
    modelTag.textContent = model
    modelTag.style.cssText = `
      background: var(--ao-tag-bg); color: var(--ao-text); font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid var(--ao-border);
    `
    row.appendChild(modelTag)
  }

  for (const preset of presets) {
    const tag = document.createElement('span')
    tag.textContent = preset.label
    tag.style.cssText = `
      background: var(--ao-tag-bg); color: var(--ao-text); font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid var(--ao-border);
    `
    row.appendChild(tag)
  }

  return row
}

function buildMarkdownContent(turn: ChatTurn): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-agent-overlay-markdown', '')

  const sections = turn.result.explanation?.sections ?? []
  const fullText = sections.map((s) => s.content).join('\n\n')
  el.innerHTML = renderMarkdown(fullText)

  return el
}

function buildTurnRow(turn: ChatTurn, index: number, onClick: (i: number) => void): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-turn-index', String(index))
  row.style.cssText = `
    border-left: 4px solid transparent;
    cursor: pointer;
  `

  row.addEventListener('click', () => onClick(index))

  row.appendChild(buildUserBubble(turn.userMessage))
  row.appendChild(buildTagsRow(turn.model, turn.presets))

  injectMarkdownStyles()
  row.appendChild(buildMarkdownContent(turn))

  return row
}

export class ChatMessageList {
  onTurnClick: ((index: number) => void) | null = null

  private readonly container: HTMLElement
  private turns: HTMLElement[] = []

  // Streaming state
  private streamingRow: HTMLElement | null = null
  private streamTextEl: HTMLElement | null = null
  private streamCursorEl: HTMLElement | null = null
  private pendingStreamText: string | null = null
  private streamRafId: number | null = null

  constructor(container: HTMLElement) {
    this.container = container
  }

  addTurn(turn: ChatTurn): void {
    const index = this.turns.length
    const row = buildTurnRow(turn, index, (i) => this.onTurnClick?.(i))
    this.turns.push(row)
    this.container.appendChild(row)
  }

  startStreaming(
    userMessage: string,
    model?: string,
    presets: readonly AnalysisPreset[] = [],
  ): void {
    this.cleanupStreamState()

    const row = document.createElement('div')
    row.setAttribute('data-turn-index', String(this.turns.length))
    row.style.cssText = `
      border-left: 4px solid transparent;
      cursor: pointer;
    `

    row.appendChild(buildUserBubble(userMessage))
    row.appendChild(buildTagsRow(model, presets))

    injectMarkdownStyles()
    injectBlinkAnimation()

    const streamText = document.createElement('div')
    streamText.setAttribute('data-chat-stream-text', '')
    streamText.setAttribute('data-agent-overlay-markdown', '')
    this.streamTextEl = streamText

    const cursor = document.createElement('span')
    cursor.setAttribute('data-chat-stream-cursor', '')
    cursor.textContent = '▌'
    this.streamCursorEl = cursor

    row.appendChild(streamText)
    row.appendChild(cursor)

    this.streamingRow = row
    this.container.appendChild(row)
  }

  setStreamText(text: string): void {
    if (!this.streamTextEl) return
    this.pendingStreamText = text
    if (this.streamRafId === null) {
      this.streamRafId = requestAnimationFrame(() => {
        this.streamRafId = null
        if (!this.streamTextEl || this.pendingStreamText === null) return
        this.streamTextEl.innerHTML = renderMarkdown(this.pendingStreamText)
        this.pendingStreamText = null
        this.scrollToBottom()
      })
    }
  }

  finalizeTurn(turn: ChatTurn): void {
    this.cleanupStreamState()

    if (!this.streamingRow) {
      // No streaming row: just add a regular turn
      this.addTurn(turn)
      return
    }

    const row = this.streamingRow
    this.streamingRow = null

    // Remove stream text and cursor from the row
    if (this.streamTextEl) {
      row.removeChild(this.streamTextEl)
      this.streamTextEl = null
    }
    if (this.streamCursorEl) {
      row.removeChild(this.streamCursorEl)
      this.streamCursorEl = null
    }

    // Append finalized markdown content
    injectMarkdownStyles()
    row.appendChild(buildMarkdownContent(turn))

    const index = this.turns.length
    row.setAttribute('data-turn-index', String(index))
    row.addEventListener('click', () => this.onTurnClick?.(index))
    this.turns.push(row)
  }

  showError(message: string): void {
    const el = document.createElement('div')
    el.setAttribute('data-chat-error', '')
    el.textContent = message
    el.style.cssText = `
      padding: 8px 12px; color: var(--ao-close); font-size: 12px;
      background: var(--ao-tag-bg); border-left: 4px solid var(--ao-close);
      margin: 4px 0;
    `
    this.container.appendChild(el)
  }

  setActiveTurn(index: number): void {
    for (const row of this.turns) {
      row.style.borderLeftColor = 'transparent'
    }
    const target = this.turns[index]
    if (target) {
      target.style.borderLeftColor = 'var(--ao-bubble-bg)'
    }
  }

  clear(): void {
    this.cleanupStreamState()
    this.streamingRow = null
    this.turns = []
    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild)
    }
  }

  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight
  }

  destroy(): void {
    this.cleanupStreamState()
    this.onTurnClick = null
  }

  private cleanupStreamState(): void {
    this.pendingStreamText = null
    if (this.streamRafId !== null) {
      cancelAnimationFrame(this.streamRafId)
      this.streamRafId = null
    }
  }
}
