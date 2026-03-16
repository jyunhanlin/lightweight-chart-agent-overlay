// src/core/ui/explanation-popup.ts
type Theme = 'light' | 'dark'

const EXPLANATION_THEME: Record<
  Theme,
  { bg: string; border: string; text: string; closeColor: string }
> = {
  dark: { bg: '#1e1e2e', border: '#444', text: '#e0e0e0', closeColor: '#888' },
  light: { bg: '#ffffff', border: '#ccc', text: '#1a1a1a', closeColor: '#666' },
}

export class ExplanationPopup {
  private readonly container: HTMLElement
  private readonly theme: Theme
  private wrapper: HTMLElement | null = null
  private readonly handleEscape: (e: KeyboardEvent) => void

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    this.container = container
    this.theme = theme
    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide()
    }
  }

  show(text: string, position: { x: number; y: number }): void {
    this.hide()
    const s = EXPLANATION_THEME[this.theme]
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-explanation', '')
    wrapper.style.cssText = `position:absolute;left:${position.x}px;top:${position.y}px;z-index:1000;background:${s.bg};border:1px solid ${s.border};border-radius:6px;padding:8px 12px;max-width:320px;max-height:200px;overflow-y:auto;box-shadow:0 2px 8px rgba(0,0,0,0.3);color:${s.text};font-size:13px;line-height:1.5;`
    const closeBtn = document.createElement('button')
    closeBtn.setAttribute('data-agent-overlay-close', '')
    closeBtn.textContent = '\u00d7'
    closeBtn.style.cssText = `position:absolute;top:4px;right:4px;background:none;border:none;color:${s.closeColor};cursor:pointer;font-size:16px;padding:0 4px;`
    closeBtn.addEventListener('click', () => this.hide())
    const content = document.createElement('div')
    content.style.paddingRight = '16px'
    content.textContent = text
    wrapper.appendChild(closeBtn)
    wrapper.appendChild(content)
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)
  }

  hide(): void {
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }
  }

  destroy(): void {
    this.hide()
  }
}
