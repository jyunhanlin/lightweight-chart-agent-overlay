// src/core/ui/history-button.ts

export class HistoryButton {
  private readonly el: HTMLButtonElement
  private readonly badge: HTMLSpanElement
  onClick: (() => void) | null = null

  constructor(container: HTMLElement) {
    const el = document.createElement('button')
    el.setAttribute('data-agent-overlay-history', '')
    el.style.cssText = `
      position: absolute; top: 8px; right: 8px; z-index: 999;
      background: var(--ao-history-bg); border: 1px solid var(--ao-border);
      border-radius: 6px; padding: 4px 10px;
      color: var(--ao-history-text); font-size: 11px;
      cursor: pointer; font-family: inherit; display: none;
    `

    const label = document.createElement('span')
    label.textContent = 'History'

    const badge = document.createElement('span')
    badge.style.cssText = `
      font-size: 10px; color: var(--ao-badge-text);
      background: var(--ao-badge-bg); padding: 0 5px;
      border-radius: 8px; margin-left: 4px;
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
