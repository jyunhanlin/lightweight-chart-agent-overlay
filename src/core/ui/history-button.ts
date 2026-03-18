// src/core/ui/history-button.ts

type Theme = 'light' | 'dark'

const THEME_STYLES: Record<
  Theme,
  { bg: string; border: string; text: string; badge: string; badgeText: string }
> = {
  dark: {
    bg: '#2a2a3a',
    border: '#444',
    text: '#888',
    badge: '#333',
    badgeText: '#555',
  },
  light: {
    bg: '#f0f0f0',
    border: '#ccc',
    text: '#666',
    badge: '#ddd',
    badgeText: '#999',
  },
}

export class HistoryButton {
  private readonly el: HTMLButtonElement
  private readonly badge: HTMLSpanElement
  onClick: (() => void) | null = null

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    const s = THEME_STYLES[theme]

    const el = document.createElement('button')
    el.setAttribute('data-agent-overlay-history', '')
    el.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 999;
      background: ${s.bg};
      border: 1px solid ${s.border};
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
      background: ${s.badge};
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
    this.badge = badge
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
