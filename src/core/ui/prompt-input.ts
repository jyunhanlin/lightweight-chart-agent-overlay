// src/core/ui/prompt-input.ts
type Theme = 'light' | 'dark'

const THEME_STYLES: Record<
  Theme,
  { bg: string; border: string; text: string; hint: string; progressBar: string }
> = {
  dark: {
    bg: '#1e1e2e',
    border: '#444',
    text: '#e0e0e0',
    hint: '#555',
    progressBar: '#2196f3',
  },
  light: {
    bg: '#ffffff',
    border: '#ccc',
    text: '#1a1a1a',
    hint: '#aaa',
    progressBar: '#1976d2',
  },
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

  show(): void {
    this.hide()
    const s = THEME_STYLES[this.theme]

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-prompt', '')
    wrapper.style.cssText = `
      position: absolute; right: 60px; top: 50%; transform: translateY(-50%);
      z-index: 1000; background: ${s.bg}; border: 1px solid ${s.border};
      border-radius: 8px; padding: 6px 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); overflow: hidden;
    `

    // Input row
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;align-items:center;gap:8px;'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Ask about this range...'
    input.style.cssText = `
      background: transparent; border: none; outline: none;
      color: ${s.text}; font-size: 14px; width: 280px; font-family: inherit;
    `

    // Enter hint
    const hint = document.createElement('span')
    hint.setAttribute('data-agent-overlay-hint', '')
    hint.textContent = 'Enter \u21b5'
    hint.style.cssText = `
      font-size: 11px; color: ${s.hint}; white-space: nowrap;
      opacity: 0; transition: opacity 0.15s;
    `

    // Show hint only when input has text
    input.addEventListener('input', () => {
      hint.style.opacity = input.value.trim() ? '1' : '0'
    })

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const value = input.value.trim()
        if (value) this.onSubmit?.(value)
      } else if (e.key === 'Escape') {
        this.hide()
        this.onCancel?.()
      }
    })

    // Progress bar (hidden until loading)
    const progressBar = document.createElement('div')
    progressBar.setAttribute('data-agent-overlay-progress', '')
    progressBar.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
      background: ${s.border}; overflow: hidden; display: none;
    `
    const progressFill = document.createElement('div')
    progressFill.style.cssText = `
      width: 40%; height: 100%; background: ${s.progressBar};
      border-radius: 1px; animation: progress-slide 1.2s ease-in-out infinite;
    `
    progressBar.appendChild(progressFill)

    // Inject keyframes
    if (!document.getElementById('agent-overlay-keyframes')) {
      const style = document.createElement('style')
      style.id = 'agent-overlay-keyframes'
      style.textContent = `
        @keyframes progress-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `
      document.head.appendChild(style)
    }

    row.appendChild(input)
    row.appendChild(hint)
    wrapper.appendChild(row)
    wrapper.appendChild(progressBar)

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
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
    const hint = this.wrapper.querySelector('[data-agent-overlay-hint]') as HTMLElement | null
    const progress = this.wrapper.querySelector(
      '[data-agent-overlay-progress]',
    ) as HTMLElement | null

    if (input) {
      input.disabled = loading
    }
    if (hint) {
      hint.style.display = loading ? 'none' : ''
    }
    if (progress) {
      progress.style.display = loading ? 'block' : 'none'
    }
  }

  destroy(): void {
    this.hide()
    this.onSubmit = null
    this.onCancel = null
  }
}
