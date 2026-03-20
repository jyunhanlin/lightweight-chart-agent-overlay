// src/core/ui/explanation-popup.ts
import type { HistoryEntry } from '../types'
import {
  ESTIMATED_UI_HEIGHT,
  UI_PADDING,
  clampToViewport,
  type UIPosition,
} from './calculate-position'
import { makeDraggable } from './make-draggable'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Configure marked for compact output
marked.setOptions({ breaks: true, gfm: true })

export interface ExplanationShowOptions {
  readonly entry: HistoryEntry
  readonly currentIndex: number
  readonly totalCount: number
  readonly position?: UIPosition
}

export interface StreamingContext {
  readonly prompt: string
  readonly isQuickRun: boolean
  readonly model?: string
  readonly presets: readonly { readonly label: string }[]
  readonly position?: UIPosition
}

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

function buildNavBar(
  currentIndex: number,
  totalCount: number,
  onPrev: () => void,
  onNext: () => void,
  onClose: () => void,
  onToggleCollapse?: () => void,
): HTMLElement {
  const nav = document.createElement('div')
  nav.setAttribute('data-agent-overlay-nav', '')
  nav.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 4px 8px; border-bottom: 1px solid var(--ao-divider); gap: 4px;
  `

  const navLeft = document.createElement('div')
  const hideNav = totalCount <= 1
  navLeft.style.cssText = `display: flex; align-items: center; gap: 4px;${hideNav ? ' visibility: hidden;' : ''}`

  const prevBtn = document.createElement('button')
  prevBtn.setAttribute('data-agent-overlay-nav-prev', '')
  prevBtn.textContent = '\u2190'
  prevBtn.disabled = currentIndex === 0
  prevBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex === 0 ? 'default' : 'pointer'};
    color: ${currentIndex === 0 ? 'var(--ao-close)' : 'var(--ao-text)'}; font-size: 14px; padding: 0 4px;
  `
  prevBtn.addEventListener('click', onPrev)

  const counter = document.createElement('span')
  counter.style.cssText = 'color: var(--ao-text); font-size: 12px;'
  counter.textContent = `${currentIndex + 1} / ${totalCount}`

  const nextBtn = document.createElement('button')
  nextBtn.setAttribute('data-agent-overlay-nav-next', '')
  nextBtn.textContent = '\u2192'
  nextBtn.disabled = currentIndex >= totalCount - 1
  nextBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex >= totalCount - 1 ? 'default' : 'pointer'};
    color: ${currentIndex >= totalCount - 1 ? 'var(--ao-close)' : 'var(--ao-text)'}; font-size: 14px; padding: 0 4px;
  `
  nextBtn.addEventListener('click', onNext)

  navLeft.appendChild(prevBtn)
  navLeft.appendChild(counter)
  navLeft.appendChild(nextBtn)

  const btnStyle = `
    background: none; border: none; color: var(--ao-close); cursor: pointer;
    font-size: 13px; line-height: 1; padding: 2px 4px; width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
  `

  const navRight = document.createElement('div')
  navRight.style.cssText = 'display: flex; align-items: center; gap: 0; margin-left: auto;'

  if (onToggleCollapse) {
    const collapseBtn = document.createElement('button')
    collapseBtn.setAttribute('data-agent-overlay-collapse', '')
    collapseBtn.textContent = '\u2013' // –
    collapseBtn.style.cssText = btnStyle
    collapseBtn.addEventListener('click', onToggleCollapse)
    navRight.appendChild(collapseBtn)
  }

  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('data-agent-overlay-close', '')
  closeBtn.textContent = '\u00d7'
  closeBtn.style.cssText = btnStyle
  closeBtn.addEventListener('click', onClose)
  navRight.appendChild(closeBtn)

  nav.appendChild(navLeft)
  nav.appendChild(navRight)

  return nav
}

function buildPromptBubble(prompt: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    display: flex; justify-content: flex-end;
    padding: 8px 12px 4px;
  `

  const bubble = document.createElement('div')
  bubble.setAttribute('data-agent-overlay-prompt-bubble', '')
  bubble.textContent = prompt
  bubble.style.cssText = `
    background: var(--ao-bubble-bg); color: var(--ao-bubble-text);
    border-radius: 8px 8px 2px 8px;
    padding: 6px 10px; font-size: 12px; line-height: 1.4;
    max-width: 90%; word-break: break-word;
  `

  wrapper.appendChild(bubble)
  return wrapper
}

function buildQuickIndicator(entry: HistoryEntry): HTMLElement {
  const bar = document.createElement('div')
  bar.setAttribute('data-agent-overlay-quick-indicator', '')

  const parts: string[] = ['> Quick']
  if (entry.model) parts.push(entry.model)
  for (const preset of entry.presets) {
    parts.push(preset.label)
  }

  bar.textContent = parts.join(' . ')
  bar.style.cssText = `
    background: var(--ao-quick-bg); border: 1px solid var(--ao-quick-border);
    padding: 5px 12px; font-size: 11px; color: var(--ao-quick-text);
    margin: 6px 12px 2px; border-radius: 4px;
  `

  return bar
}

function buildTagsRow(entry: HistoryEntry): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-agent-overlay-tags', '')
  row.style.cssText = `
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 6px 12px; border-bottom: 1px solid var(--ao-divider);
  `

  if (entry.model !== undefined) {
    const modelTag = document.createElement('span')
    modelTag.setAttribute('data-agent-overlay-model-tag', '')
    modelTag.textContent = entry.model
    modelTag.style.cssText = `
      background: var(--ao-tag-bg); color: var(--ao-text); font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid var(--ao-border);
    `
    row.appendChild(modelTag)
  }

  for (const preset of entry.presets) {
    const tag = document.createElement('span')
    tag.setAttribute('data-agent-overlay-preset-tag', '')
    tag.textContent = preset.label
    tag.style.cssText = `
      background: var(--ao-tag-bg); color: var(--ao-text); font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid var(--ao-border);
    `
    row.appendChild(tag)
  }

  return row
}

function buildMarkdownContent(entry: HistoryEntry): HTMLElement {
  const container = document.createElement('div')
  container.setAttribute('data-agent-overlay-markdown', '')

  const sections = entry.result.explanation?.sections ?? []
  const fullText = sections.map((s) => s.content).join('\n\n')
  container.innerHTML = renderMarkdown(fullText)

  return container
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
    [data-agent-overlay-stream-cursor] {
      animation: ao-blink 1s step-end infinite;
    }
  `
  document.head.appendChild(style)
}

function buildWrapperBase(position?: UIPosition): HTMLElement {
  const posLeft = position?.left ?? 0
  const posTop = position ? position.top + ESTIMATED_UI_HEIGHT : 0

  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-agent-overlay-explanation', '')
  wrapper.style.cssText = `
    position: absolute; z-index: 1000; background: var(--ao-bg); border: 1px solid var(--ao-border);
    border-radius: 6px; width: 420px; max-height: min(400px, calc(100vh - ${UI_PADDING * 2}px));
    overflow-y: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    color: var(--ao-text); font-size: 13px; cursor: grab;
  `
  wrapper.style.left = `${posLeft}px`
  wrapper.style.top = `${posTop}px`
  return wrapper
}

export class ExplanationPopup {
  private readonly container: HTMLElement
  private wrapper: HTMLElement | null = null
  private cleanupDrag: (() => void) | null = null
  private readonly handleEscape: (e: KeyboardEvent) => void

  // Streaming state
  private isStreaming = false
  private streamTextEl: HTMLElement | null = null
  private pendingStreamText: string | null = null
  private streamRafId: number | null = null

  // Collapse state
  private contentEl: HTMLElement | null = null
  private collapsed = false

  onClose: (() => void) | null = null
  onNavigate: ((direction: -1 | 1) => void) | null = null
  onAbort: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.container = container
    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (this.isStreaming) {
          this.onAbort?.()
        } else {
          this.hide()
        }
      }
    }
  }

  private removeWrapperDirectly(): void {
    this.cleanupDrag?.()
    this.cleanupDrag = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }
  }

  private toggleCollapse(): void {
    if (!this.contentEl || !this.wrapper) return
    this.collapsed = !this.collapsed
    this.contentEl.style.display = this.collapsed ? 'none' : ''
    // Update collapse button icon
    const btn = this.wrapper.querySelector('[data-agent-overlay-collapse]')
    if (btn) btn.textContent = this.collapsed ? '\u25fb' : '\u2013' // ◻ or –
    // Remove max-height and overflow when collapsed so wrapper shrinks to header
    if (this.collapsed) {
      this.wrapper.style.maxHeight = 'none'
      this.wrapper.style.overflowY = 'visible'
    } else {
      this.wrapper.style.maxHeight = `min(400px, calc(100vh - ${UI_PADDING * 2}px))`
      this.wrapper.style.overflowY = 'auto'
    }
  }

  private showInternal(options: ExplanationShowOptions): void {
    const { entry, currentIndex, totalCount, position } = options

    const wrapper = buildWrapperBase(position)
    this.collapsed = false

    const handleClose = () => this.hide()
    const handlePrev = () => this.onNavigate?.(-1)
    const handleNext = () => this.onNavigate?.(1)
    const handleCollapse = () => this.toggleCollapse()

    // ── Sticky header: nav + prompt context + tags ──────────────────────
    const stickyHeader = document.createElement('div')
    stickyHeader.style.cssText = `
      position: sticky; top: 0; z-index: 1; background: var(--ao-bg);
      border-radius: 6px 6px 0 0;
    `

    stickyHeader.appendChild(
      buildNavBar(currentIndex, totalCount, handlePrev, handleNext, handleClose, handleCollapse),
    )

    if (entry.isQuickRun) {
      stickyHeader.appendChild(buildQuickIndicator(entry))
    } else {
      stickyHeader.appendChild(buildPromptBubble(entry.prompt))
    }

    stickyHeader.appendChild(buildTagsRow(entry))

    wrapper.appendChild(stickyHeader)

    // ── Scrollable content (rendered markdown) ────────────────────────
    injectMarkdownStyles()
    const content = buildMarkdownContent(entry)
    wrapper.appendChild(content)
    this.contentEl = content

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    // Clamp to viewport
    clampToViewport(wrapper)

    // Make draggable (exclude buttons from triggering drag)
    this.cleanupDrag = makeDraggable(wrapper, { exclude: 'button' })
  }

  show(options: ExplanationShowOptions): void {
    this.hide()
    this.showInternal(options)
  }

  showStreaming(ctx: StreamingContext): void {
    // Remove existing popup directly — do NOT call hide() to avoid triggering onClose
    this.removeWrapperDirectly()
    this.cleanupStreamState()

    this.isStreaming = true

    const wrapper = buildWrapperBase(ctx.position)

    const handleAbort = () => this.onAbort?.()
    const handleCollapse = () => this.toggleCollapse()
    this.collapsed = false

    // ── Sticky header: nav + prompt/quick + tags (same as structured view) ──
    const stickyHeader = document.createElement('div')
    stickyHeader.style.cssText = `
      position: sticky; top: 0; z-index: 1; background: var(--ao-bg);
      border-radius: 6px 6px 0 0;
    `

    // Nav bar with totalCount=1 so history nav is hidden
    stickyHeader.appendChild(
      buildNavBar(
        0,
        1,
        () => {},
        () => {},
        handleAbort,
        handleCollapse,
      ),
    )

    // Build a partial entry for the header builders
    const headerEntry = {
      prompt: ctx.prompt,
      isQuickRun: ctx.isQuickRun,
      model: ctx.model,
      presets: ctx.presets.map((p) => ({ label: p.label, systemPrompt: '', quickPrompt: '' })),
      result: {},
      range: { from: 0, to: 0 },
    } as HistoryEntry

    if (ctx.isQuickRun) {
      stickyHeader.appendChild(buildQuickIndicator(headerEntry))
    } else if (ctx.prompt) {
      stickyHeader.appendChild(buildPromptBubble(ctx.prompt))
    }

    stickyHeader.appendChild(buildTagsRow(headerEntry))
    wrapper.appendChild(stickyHeader)

    // ── Stream content container (collapsible) ──
    const content = document.createElement('div')
    this.contentEl = content

    injectMarkdownStyles()
    const streamText = document.createElement('div')
    streamText.setAttribute('data-agent-overlay-stream-text', '')
    streamText.setAttribute('data-agent-overlay-markdown', '')
    this.streamTextEl = streamText

    // Blinking cursor
    const cursor = document.createElement('span')
    cursor.setAttribute('data-agent-overlay-stream-cursor', '')
    cursor.textContent = '▌'

    content.appendChild(streamText)
    content.appendChild(cursor)
    wrapper.appendChild(content)

    injectBlinkAnimation()

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    clampToViewport(wrapper, true) // Use max-height for clamp (popup will grow during streaming)
    this.cleanupDrag = makeDraggable(wrapper, { exclude: 'button' })
  }

  setStreamText(text: string): void {
    if (!this.isStreaming || !this.streamTextEl) return
    this.pendingStreamText = text
    if (this.streamRafId === null) {
      this.streamRafId = requestAnimationFrame(() => {
        this.streamRafId = null
        if (!this.streamTextEl || this.pendingStreamText === null) return
        this.streamTextEl.innerHTML = renderMarkdown(this.pendingStreamText)
        this.pendingStreamText = null
        if (this.wrapper) {
          this.wrapper.scrollTop = this.wrapper.scrollHeight
        }
      })
    }
  }

  finalizeStream(options: ExplanationShowOptions): void {
    this.cleanupStreamState()

    // Remove streaming popup directly — do NOT trigger onClose
    this.removeWrapperDirectly()

    // Show structured view
    this.showInternal(options)
  }

  private cleanupStreamState(): void {
    this.isStreaming = false
    this.streamTextEl = null
    this.pendingStreamText = null
    if (this.streamRafId !== null) {
      cancelAnimationFrame(this.streamRafId)
      this.streamRafId = null
    }
  }

  hide(): void {
    this.cleanupStreamState()
    this.contentEl = null
    this.collapsed = false

    this.cleanupDrag?.()
    this.cleanupDrag = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
      this.onClose?.()
    }
  }

  destroy(): void {
    this.onClose = null
    this.onNavigate = null
    this.onAbort = null
    this.hide()
  }
}
