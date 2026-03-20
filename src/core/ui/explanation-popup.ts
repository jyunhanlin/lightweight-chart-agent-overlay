// src/core/ui/explanation-popup.ts
import type { HistoryEntry } from '../types'
import {
  ESTIMATED_UI_HEIGHT,
  UI_PADDING,
  clampToViewport,
  type UIPosition,
} from './calculate-position'
import { makeDraggable } from './make-draggable'

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

const SECTION_LABEL_COLORS = ['#7eb8f7', '#f7a87e', '#7ef7b8', '#f77eb8', '#b87ef7']

function getLabelColor(index: number): string {
  return SECTION_LABEL_COLORS[index % SECTION_LABEL_COLORS.length]
}

function buildNavBar(
  currentIndex: number,
  totalCount: number,
  onPrev: () => void,
  onNext: () => void,
  onClose: () => void,
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

  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('data-agent-overlay-close', '')
  closeBtn.textContent = '\u00d7'
  closeBtn.style.cssText = `
    background: none; border: none; color: var(--ao-close); cursor: pointer;
    font-size: 16px; line-height: 1; padding: 0 4px; margin-left: auto;
  `
  closeBtn.addEventListener('click', onClose)

  nav.appendChild(navLeft)
  nav.appendChild(closeBtn)

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

function buildSections(entry: HistoryEntry): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'padding: 0 0 4px;'

  const sections = entry.result.explanation?.sections ?? []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const sectionEl = document.createElement('div')
    sectionEl.style.cssText = `
      padding: 8px 12px;
      ${i > 0 ? 'border-top: 1px solid var(--ao-divider);' : ''}
    `

    const label = document.createElement('div')
    label.setAttribute('data-agent-overlay-section-label', '')
    label.textContent = section.label
    label.style.cssText = `
      font-size: 11px; font-weight: bold; color: ${getLabelColor(i)};
      margin-bottom: 4px;
    `

    const content = document.createElement('div')
    content.setAttribute('data-agent-overlay-section-content', '')
    content.textContent = section.content
    content.style.cssText = 'font-size: 13px; color: var(--ao-text); line-height: 1.5;'

    sectionEl.appendChild(label)
    sectionEl.appendChild(content)
    container.appendChild(sectionEl)
  }

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
    border-radius: 6px; min-width: 420px; max-width: 520px; max-height: min(400px, calc(100vh - ${UI_PADDING * 2}px));
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
  private pendingText = ''
  private rafId: number | null = null

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

  private showInternal(options: ExplanationShowOptions): void {
    const { entry, currentIndex, totalCount, position } = options

    const wrapper = buildWrapperBase(position)

    const handleClose = () => this.hide()
    const handlePrev = () => this.onNavigate?.(-1)
    const handleNext = () => this.onNavigate?.(1)

    // ── Sticky header: nav + prompt context + tags ──────────────────────
    const stickyHeader = document.createElement('div')
    stickyHeader.style.cssText = `
      position: sticky; top: 0; z-index: 1; background: var(--ao-bg);
      border-radius: 6px 6px 0 0;
    `

    stickyHeader.appendChild(
      buildNavBar(currentIndex, totalCount, handlePrev, handleNext, handleClose),
    )

    if (entry.isQuickRun) {
      stickyHeader.appendChild(buildQuickIndicator(entry))
    } else {
      stickyHeader.appendChild(buildPromptBubble(entry.prompt))
    }

    stickyHeader.appendChild(buildTagsRow(entry))

    wrapper.appendChild(stickyHeader)

    // ── Scrollable content ────────────────────────────────────────────
    wrapper.appendChild(buildSections(entry))

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
    this.isStreaming = false
    this.streamTextEl = null
    this.pendingText = ''
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    this.isStreaming = true

    const wrapper = buildWrapperBase(ctx.position)

    const handleAbort = () => this.onAbort?.()

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

    // ── Stream text area ──
    const streamText = document.createElement('div')
    streamText.setAttribute('data-agent-overlay-stream-text', '')
    streamText.style.cssText =
      'padding: 8px 12px; font-size: 13px; color: var(--ao-text); line-height: 1.5; white-space: pre-wrap; word-break: break-word;'
    this.streamTextEl = streamText

    // Blinking cursor
    const cursor = document.createElement('span')
    cursor.setAttribute('data-agent-overlay-stream-cursor', '')
    cursor.textContent = '▌'

    wrapper.appendChild(streamText)
    wrapper.appendChild(cursor)

    injectBlinkAnimation()

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    clampToViewport(wrapper)
    this.cleanupDrag = makeDraggable(wrapper, { exclude: 'button' })
  }

  setStreamText(text: string): void {
    if (!this.isStreaming || !this.streamTextEl) return
    this.streamTextEl.textContent = text
    if (this.wrapper) {
      this.wrapper.scrollTop = this.wrapper.scrollHeight
    }
  }

  appendStreamText(chunk: string): void {
    if (!this.isStreaming || !this.streamTextEl) return

    this.pendingText += chunk

    if (this.rafId === null) {
      // Mark as scheduled with a sentinel before calling requestAnimationFrame,
      // because the stub in tests may invoke the callback synchronously (before
      // the return value is assigned).
      this.rafId = -1
      const id = requestAnimationFrame(() => {
        this.rafId = null
        if (!this.streamTextEl) return
        this.streamTextEl.textContent = (this.streamTextEl.textContent ?? '') + this.pendingText
        this.pendingText = ''
        // Auto-scroll wrapper
        if (this.wrapper) {
          this.wrapper.scrollTop = this.wrapper.scrollHeight
        }
      })
      // Only overwrite sentinel if callback hasn't already cleared it
      if (this.rafId === -1) {
        this.rafId = id
      }
    }
  }

  finalizeStream(options: ExplanationShowOptions): void {
    this.isStreaming = false
    this.streamTextEl = null
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.pendingText = ''

    // Remove streaming popup directly — do NOT trigger onClose
    this.removeWrapperDirectly()

    // Show structured view
    this.showInternal(options)
  }

  hide(): void {
    // Clean up streaming state
    this.isStreaming = false
    this.streamTextEl = null
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.pendingText = ''

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
