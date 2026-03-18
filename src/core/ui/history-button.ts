// src/core/ui/history-button.ts

import { type Theme, THEMES } from './theme'

export class HistoryButton {
  private readonly el: HTMLButtonElement
  private readonly label: HTMLSpanElement
  private readonly badge: HTMLSpanElement
  onClick: (() => void) | null = null

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    const s = THEMES[theme].history

    const el = document.createElement('button')
    el.setAttribute('data-agent-overlay-history', '')
    el.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 999;
      background: ${s.bg};
      border: 1px solid ${THEMES[theme].base.border};
      border-radius: 6px;
      padding: 4px 10px;
      color: ${s.text};
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
      display: none;
    `

    const label = document.createElement('span')
    label.textContent = 'History'

    const badge = document.createElement('span')
    badge.style.cssText = `
      font-size: 10px;
      color: ${s.badgeText};
      background: ${s.badgeBg};
      padding: 0 5px;
      border-radius: 8px;
      margin-left: 4px;
    `

    el.appendChild(label)
    el.appendChild(badge)

    el.addEventListener('mousedown', (e) => e.stopPropagation())
    el.addEventListener('click', () => this.onClick?.())

    container.appendChild(el)

    this.el = el
    this.label = label
    this.badge = badge
  }

  setTheme(theme: Theme): void {
    const s = THEMES[theme].history
    this.el.style.background = s.bg
    this.el.style.borderColor = THEMES[theme].base.border
    this.el.style.color = s.text
    this.badge.style.color = s.badgeText
    this.badge.style.background = s.badgeBg
  }

  setCount(count: number): void {
    this.badge.textContent = String(count)
    this.el.style.display = count > 0 ? '' : 'none'
  }

  destroy(): void {
    this.el.remove()
    this.onClick = null
  }
}
