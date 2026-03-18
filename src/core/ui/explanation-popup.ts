// src/core/ui/explanation-popup.ts
import type { HistoryEntry } from '../types'
import { ESTIMATED_UI_HEIGHT, type UIPosition } from './calculate-position'
import { makeDraggable } from './make-draggable'

type Theme = 'light' | 'dark'

export interface ExplanationShowOptions {
  readonly entry: HistoryEntry
  readonly currentIndex: number
  readonly totalCount: number
  readonly position?: UIPosition
}

const THEME_COLORS: Record<
  Theme,
  { bg: string; border: string; text: string; closeColor: string; divider: string; tagBg: string }
> = {
  dark: {
    bg: '#1e1e2e',
    border: '#444',
    text: '#e0e0e0',
    closeColor: '#888',
    divider: '#333',
    tagBg: '#2a2a3e',
  },
  light: {
    bg: '#ffffff',
    border: '#ccc',
    text: '#1a1a1a',
    closeColor: '#666',
    divider: '#e0e0e0',
    tagBg: '#f0f0f0',
  },
}

const SECTION_LABEL_COLORS = ['#7eb8f7', '#f7a87e', '#7ef7b8', '#f77eb8', '#b87ef7']

function getLabelColor(index: number): string {
  return SECTION_LABEL_COLORS[index % SECTION_LABEL_COLORS.length]
}

function buildNavBar(
  s: (typeof THEME_COLORS)[Theme],
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
    padding: 4px 8px; border-bottom: 1px solid ${s.divider}; gap: 4px;
  `

  // Left side: prev + counter + next
  const navLeft = document.createElement('div')
  navLeft.style.cssText = 'display: flex; align-items: center; gap: 4px;'

  const prevBtn = document.createElement('button')
  prevBtn.setAttribute('data-agent-overlay-nav-prev', '')
  prevBtn.textContent = '\u2190'
  prevBtn.disabled = currentIndex === 0
  prevBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex === 0 ? 'default' : 'pointer'};
    color: ${currentIndex === 0 ? s.closeColor : s.text}; font-size: 14px; padding: 0 4px;
  `
  prevBtn.addEventListener('click', onPrev)

  const counter = document.createElement('span')
  counter.style.cssText = `color: ${s.text}; font-size: 12px;`
  counter.textContent = `${currentIndex + 1} / ${totalCount}`

  const nextBtn = document.createElement('button')
  nextBtn.setAttribute('data-agent-overlay-nav-next', '')
  nextBtn.textContent = '\u2192'
  nextBtn.disabled = currentIndex >= totalCount - 1
  nextBtn.style.cssText = `
    background: none; border: none; cursor: ${currentIndex >= totalCount - 1 ? 'default' : 'pointer'};
    color: ${currentIndex >= totalCount - 1 ? s.closeColor : s.text}; font-size: 14px; padding: 0 4px;
  `
  nextBtn.addEventListener('click', onNext)

  navLeft.appendChild(prevBtn)
  navLeft.appendChild(counter)
  navLeft.appendChild(nextBtn)

  // Right side: close button
  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('data-agent-overlay-close', '')
  closeBtn.textContent = '\u00d7'
  closeBtn.style.cssText = `
    background: none; border: none; color: ${s.closeColor}; cursor: pointer;
    font-size: 16px; padding: 0 4px; margin-left: auto;
  `
  closeBtn.addEventListener('click', onClose)

  nav.appendChild(navLeft)
  nav.appendChild(closeBtn)

  return nav
}

function buildCloseButtonOnly(s: (typeof THEME_COLORS)[Theme], onClose: () => void): HTMLElement {
  const row = document.createElement('div')
  row.style.cssText = `
    display: flex; justify-content: flex-end;
    padding: 4px 8px 0;
  `

  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('data-agent-overlay-close', '')
  closeBtn.textContent = '\u00d7'
  closeBtn.style.cssText = `
    background: none; border: none; color: ${s.closeColor}; cursor: pointer;
    font-size: 16px; padding: 0 4px;
  `
  closeBtn.addEventListener('click', onClose)

  row.appendChild(closeBtn)
  return row
}

function buildPromptBubble(prompt: string, _s: (typeof THEME_COLORS)[Theme]): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = `
    display: flex; justify-content: flex-end;
    padding: 8px 12px 4px;
  `

  const bubble = document.createElement('div')
  bubble.setAttribute('data-agent-overlay-prompt-bubble', '')
  bubble.textContent = prompt
  bubble.style.cssText = `
    background: #2a3a5a; color: #8bb8e8;
    border-radius: 8px 8px 2px 8px;
    padding: 6px 10px; font-size: 12px; line-height: 1.4;
    max-width: 90%; word-break: break-word;
  `

  wrapper.appendChild(bubble)
  return wrapper
}

function buildQuickIndicator(entry: HistoryEntry, _s: (typeof THEME_COLORS)[Theme]): HTMLElement {
  const bar = document.createElement('div')
  bar.setAttribute('data-agent-overlay-quick-indicator', '')

  const parts: string[] = ['> Quick']
  if (entry.model) parts.push(entry.model)
  for (const preset of entry.presets) {
    parts.push(preset.label)
  }

  bar.textContent = parts.join(' . ')
  bar.style.cssText = `
    background: #1a1a2a; border: 1px solid #333;
    padding: 5px 12px; font-size: 11px; color: #aaa;
    margin: 6px 12px 2px; border-radius: 4px;
  `

  return bar
}

function buildTagsRow(entry: HistoryEntry, s: (typeof THEME_COLORS)[Theme]): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-agent-overlay-tags', '')
  row.style.cssText = `
    display: flex; flex-wrap: wrap; gap: 4px;
    padding: 6px 12px; border-bottom: 1px solid ${s.divider};
  `

  if (entry.model !== undefined) {
    const modelTag = document.createElement('span')
    modelTag.setAttribute('data-agent-overlay-model-tag', '')
    modelTag.textContent = entry.model
    modelTag.style.cssText = `
      background: ${s.tagBg}; color: ${s.text}; font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid ${s.border};
    `
    row.appendChild(modelTag)
  }

  for (const preset of entry.presets) {
    const tag = document.createElement('span')
    tag.setAttribute('data-agent-overlay-preset-tag', '')
    tag.textContent = preset.label
    tag.style.cssText = `
      background: ${s.tagBg}; color: ${s.text}; font-size: 10px;
      padding: 2px 6px; border-radius: 3px; border: 1px solid ${s.border};
    `
    row.appendChild(tag)
  }

  return row
}

function buildSections(entry: HistoryEntry, s: (typeof THEME_COLORS)[Theme]): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText = 'padding: 0 0 4px;'

  const sections = entry.result.explanation?.sections ?? []

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const sectionEl = document.createElement('div')
    sectionEl.style.cssText = `
      padding: 8px 12px;
      ${i > 0 ? `border-top: 1px solid ${s.divider};` : ''}
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
    content.style.cssText = `font-size: 13px; color: ${s.text}; line-height: 1.5;`

    sectionEl.appendChild(label)
    sectionEl.appendChild(content)
    container.appendChild(sectionEl)
  }

  return container
}

export class ExplanationPopup {
  private readonly container: HTMLElement
  private readonly theme: Theme
  private wrapper: HTMLElement | null = null
  private cleanupDrag: (() => void) | null = null
  private readonly handleEscape: (e: KeyboardEvent) => void

  onClose: (() => void) | null = null
  onNavigate: ((direction: -1 | 1) => void) | null = null

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    this.container = container
    this.theme = theme
    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide()
    }
  }

  show(options: ExplanationShowOptions): void {
    this.hide()

    const { entry, currentIndex, totalCount, position } = options
    const s = THEME_COLORS[this.theme]

    const posLeft = position?.left ?? 0
    const posTop = position ? position.top + ESTIMATED_UI_HEIGHT : 0

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-explanation', '')
    wrapper.style.cssText = `
      position: absolute; z-index: 1000; background: ${s.bg}; border: 1px solid ${s.border};
      border-radius: 6px; max-width: 320px; max-height: 400px;
      overflow-y: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: ${s.text}; font-size: 13px; cursor: grab;
    `
    wrapper.style.left = `${posLeft}px`
    wrapper.style.top = `${posTop}px`

    const handleClose = () => this.hide()
    const handlePrev = () => this.onNavigate?.(-1)
    const handleNext = () => this.onNavigate?.(1)

    // Nav bar (only when totalCount > 1)
    if (totalCount > 1) {
      wrapper.appendChild(
        buildNavBar(s, currentIndex, totalCount, handlePrev, handleNext, handleClose),
      )
    } else {
      wrapper.appendChild(buildCloseButtonOnly(s, handleClose))
    }

    // Context area: prompt bubble or quick-run indicator
    if (entry.isQuickRun) {
      wrapper.appendChild(buildQuickIndicator(entry, s))
    } else {
      wrapper.appendChild(buildPromptBubble(entry.prompt, s))
      wrapper.appendChild(buildTagsRow(entry, s))
    }

    // Tags row shown only for non-quick-run (already appended above for non-quick)
    // For quick-run we still show tags
    if (entry.isQuickRun) {
      wrapper.appendChild(buildTagsRow(entry, s))
    }

    // Sections
    wrapper.appendChild(buildSections(entry, s))

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    // Make draggable (exclude buttons from triggering drag)
    this.cleanupDrag = makeDraggable(wrapper, { exclude: 'button' })
  }

  hide(): void {
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
    this.hide()
  }
}
