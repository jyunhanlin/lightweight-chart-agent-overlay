// src/core/ui/prompt-input.ts
type Theme = 'light' | 'dark'

const THEME_STYLES: Record<
  Theme,
  { bg: string; border: string; text: string; placeholder: string }
> = {
  dark: { bg: '#1e1e2e', border: '#444', text: '#e0e0e0', placeholder: '#888' },
  light: { bg: '#ffffff', border: '#ccc', text: '#1a1a1a', placeholder: '#999' },
}

export class PromptInput {
  private readonly container: HTMLElement
  private readonly theme: Theme
  private wrapper: HTMLElement | null = null
  onSubmit: ((prompt: string) => void) | null = null
  onCancel: (() => void) | null = null

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    this.container = container
    this.theme = theme
  }

  show(position: { x: number; y: number }): void {
    this.hide()
    const s = THEME_STYLES[this.theme]
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-prompt', '')
    wrapper.style.cssText = `position:absolute;left:${position.x}px;top:${position.y}px;z-index:1000;display:flex;align-items:center;gap:4px;background:${s.bg};border:1px solid ${s.border};border-radius:6px;padding:4px 8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);`
    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Ask about this range...'
    input.style.cssText = `background:transparent;border:none;outline:none;color:${s.text};font-size:13px;width:260px;font-family:inherit;`
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const value = input.value.trim()
        if (value) this.onSubmit?.(value)
      } else if (e.key === 'Escape') {
        this.hide()
        this.onCancel?.()
      }
    })
    wrapper.appendChild(input)
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    input.focus()
  }

  hide(): void {
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    }
  }

  setLoading(loading: boolean): void {
    if (!this.wrapper) return
    const input = this.wrapper.querySelector('input')
    if (input) {
      input.disabled = loading
      input.placeholder = loading ? 'Analyzing...' : 'Ask about this range...'
    }
  }

  destroy(): void {
    this.hide()
    this.onSubmit = null
    this.onCancel = null
  }
}
