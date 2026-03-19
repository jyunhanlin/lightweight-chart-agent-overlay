// src/core/ui/prompt-input.ts
import type { UIPosition } from './calculate-position'
import { clampToViewport } from './calculate-position'
import type { ModelOption, AnalysisPreset } from '../types'
import { makeDraggable } from './make-draggable'
import { Dropdown } from './dropdown'
import { DropdownManager } from './dropdown-manager'
import { SettingsPanel } from './settings-panel'

const SUBMIT_ACTIVE_BG = '#2196f3'
const SUBMIT_INACTIVE_BG = '#555'
const ERROR_DISMISS_MS = 5000

export interface PromptInputOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
}

export class PromptInput {
  private readonly container: HTMLElement
  private readonly availableModels: readonly ModelOption[]
  private readonly presets: readonly AnalysisPreset[]
  private readonly requiresApiKey: boolean
  private readonly apiKeyStorageKey: string | undefined

  private wrapper: HTMLElement | null = null
  private cleanupDrag: (() => void) | null = null
  private lastPosition: UIPosition | null = null
  private modelDropdown: Dropdown | null = null
  private presetDropdown: Dropdown | null = null
  private dropdownManager: DropdownManager | null = null
  private errorTimer: ReturnType<typeof setTimeout> | null = null
  private settingsPanel: SettingsPanel | null = null

  onSubmit: ((prompt: string) => void) | null = null
  onCancel: (() => void) | null = null
  onQuickRun: ((presets: readonly AnalysisPreset[]) => void) | null = null

  constructor(container: HTMLElement, options?: PromptInputOptions) {
    this.container = container
    this.availableModels = options?.availableModels ?? []
    this.presets = options?.presets ?? []
    this.requiresApiKey = options?.requiresApiKey ?? false
    this.apiKeyStorageKey = options?.apiKeyStorageKey
  }

  show(position?: UIPosition): void {
    this.hide()

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-prompt', '')

    const posLeft = position?.left ?? 0
    const posTop = position?.top ?? 0

    wrapper.style.cssText = `
      position: absolute; left: ${posLeft}px; top: ${posTop}px;
      z-index: 1000; background: var(--ao-bg); border: 1px solid var(--ao-border);
      border-radius: 8px; overflow: visible;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      cursor: grab; min-width: 420px; max-width: 520px;
    `

    // ── Close button (top-right) ────────────────────────────────────────────
    const closeBtn = document.createElement('button')
    closeBtn.setAttribute('data-agent-overlay-close', '')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = `
      position: absolute; top: 10px; right: 8px;
      background: transparent; border: none; color: var(--ao-hint);
      font-size: 18px; cursor: pointer; line-height: 20px; padding: 0;
      font-family: inherit;
    `
    closeBtn.addEventListener('click', () => {
      this.hide()
      this.onCancel?.()
    })

    // ── Textarea ───────────────────────────────────────────────────────────
    const textarea = document.createElement('textarea')
    textarea.placeholder = 'Ask about this range, or leave empty to run presets'
    textarea.rows = 1
    textarea.style.cssText = `
      display: block; width: 100%; box-sizing: border-box;
      background: transparent; border: none; outline: none;
      color: var(--ao-text); font-size: 14px; font-family: inherit;
      line-height: 20px;
      resize: none; padding: 10px 32px 10px 12px; cursor: text;
      overflow: hidden;
    `

    const minHeight = 40
    const maxHeight = 140
    textarea.style.height = `${minHeight}px`

    const autoGrow = () => {
      textarea.style.height = `${minHeight}px`
      const targetHeight = Math.max(textarea.scrollHeight, minHeight)
      textarea.style.height = `${Math.min(targetHeight, maxHeight)}px`
      textarea.style.overflow = targetHeight > maxHeight ? 'auto' : 'hidden'
    }
    textarea.addEventListener('input', autoGrow)

    // ── Toolbar ────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div')
    toolbar.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-top: 1px solid var(--ao-border);
      background: var(--ao-toolbar); border-radius: 0 0 8px 8px;
    `

    // Dropdown manager for mutual exclusion
    this.dropdownManager = new DropdownManager()

    // Close dropdowns when textarea gains focus
    textarea.addEventListener('focus', () => {
      this.dropdownManager?.closeAll()
    })

    // Model dropdown
    if (this.availableModels.length > 0) {
      const modelWrapper = document.createElement('span')
      modelWrapper.setAttribute('data-agent-overlay-model-dropdown', '')
      this.modelDropdown = new Dropdown({
        items: [...this.availableModels],
        multiSelect: false,
        placeholder: 'Model',
        manager: this.dropdownManager,
      })
      this.dropdownManager.register(this.modelDropdown)
      modelWrapper.appendChild(this.modelDropdown.element)
      toolbar.appendChild(modelWrapper)

      // Pre-select first model
      if (this.availableModels.length > 0) {
        this.modelDropdown.setSelected([this.availableModels[0].id])
      }
    }

    // Submit button (created early so updateSubmitState can reference it)
    const submitBtn = document.createElement('button')
    submitBtn.setAttribute('data-agent-overlay-submit', '')
    submitBtn.textContent = '\u2191'
    submitBtn.style.cssText = `
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: ${SUBMIT_INACTIVE_BG}; color: #fff;
      font-size: 14px; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      font-family: inherit; flex-shrink: 0;
    `

    const updateSubmitState = () => {
      const hasText = textarea.value.trim().length > 0
      const hasPresets = this.presetDropdown ? this.presetDropdown.getSelected().length > 0 : false
      submitBtn.style.background = hasText || hasPresets ? SUBMIT_ACTIVE_BG : SUBMIT_INACTIVE_BG
    }

    textarea.addEventListener('input', updateSubmitState)

    // Preset dropdown
    if (this.presets.length > 0) {
      const presetWrapper = document.createElement('span')
      presetWrapper.setAttribute('data-agent-overlay-preset-dropdown', '')
      this.presetDropdown = new Dropdown({
        items: this.presets.map((p, i) => ({ id: `preset-${i}`, label: p.label })),
        multiSelect: true,
        placeholder: 'Presets',
        manager: this.dropdownManager,
        onSelect: () => updateSubmitState(),
      })
      this.dropdownManager.register(this.presetDropdown)
      presetWrapper.appendChild(this.presetDropdown.element)
      toolbar.appendChild(presetWrapper)

      // Pre-select first preset
      if (this.presets.length > 0) {
        this.presetDropdown.setSelected(['preset-0'])
        updateSubmitState()
      }
    }

    // Spacer
    const spacer = document.createElement('div')
    spacer.style.cssText = 'flex: 1'
    toolbar.appendChild(spacer)

    // Keyboard hint
    const hint = document.createElement('span')
    const modKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl'
    hint.textContent = `${modKey}\u21b5`
    hint.style.cssText = `color: var(--ao-hint); font-size: 11px; flex-shrink: 0;`
    toolbar.appendChild(hint)

    if (this.requiresApiKey) {
      const gearBtn = document.createElement('button')
      gearBtn.setAttribute('data-agent-overlay-settings-trigger', '')
      gearBtn.textContent = '\u2699'
      gearBtn.style.cssText = `
        background: transparent; border: none; color: var(--ao-hint);
        font-size: 16px; cursor: pointer; padding: 0 2px;
        font-family: inherit; flex-shrink: 0;
      `

      this.settingsPanel = new SettingsPanel(wrapper, {
        storageKey: this.apiKeyStorageKey,
        manager: this.dropdownManager ?? undefined,
      })

      if (this.dropdownManager) {
        this.dropdownManager.register(this.settingsPanel)
      }

      gearBtn.addEventListener('click', () => {
        this.settingsPanel?.open()
      })
      toolbar.appendChild(gearBtn)
    }

    submitBtn.addEventListener('click', () => {
      const value = textarea.value.trim()
      if (value) {
        this.clearError()
        this.onSubmit?.(value)
      } else {
        fireQuickRun()
      }
    })

    toolbar.appendChild(submitBtn)

    // ── Error div ──────────────────────────────────────────────────────────
    const errorDiv = document.createElement('div')
    errorDiv.setAttribute('data-agent-overlay-error', '')
    errorDiv.style.cssText = `
      display: none; padding: 4px 12px 6px;
      font-size: 12px; color: #f44336;
      background: var(--ao-bg);
    `

    // ── Progress bar ────────────────────────────────────────────────────────
    const progressBar = document.createElement('div')
    progressBar.setAttribute('data-agent-overlay-progress', '')
    progressBar.style.cssText = `
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
      background: var(--ao-border); overflow: hidden; display: none;
      border-radius: 0 0 8px 8px;
    `
    const progressFill = document.createElement('div')
    progressFill.style.cssText = `
      width: 40%; height: 100%; background: var(--ao-progress);
      border-radius: 1px; animation: progress-slide 1.2s ease-in-out infinite;
    `
    progressBar.appendChild(progressFill)

    // Inject keyframes once
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

    const fireQuickRun = () => {
      const selectedPresets = this.getSelectedPresets()
      if (selectedPresets.length === 0) return
      // Show what will be sent as feedback
      textarea.value = selectedPresets.map((p) => p.quickPrompt).join('\n')
      this.clearError()
      this.onQuickRun?.(selectedPresets)
    }

    // ── Keyboard handlers ───────────────────────────────────────────────────
    textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        const value = textarea.value.trim()
        if (value) {
          this.clearError()
          this.onSubmit?.(value)
        } else {
          fireQuickRun()
        }
      } else if (e.key === 'Escape') {
        this.hide()
        this.onCancel?.()
      }
    })

    // ── Assemble ────────────────────────────────────────────────────────────
    wrapper.appendChild(closeBtn)
    wrapper.appendChild(textarea)
    wrapper.appendChild(toolbar)
    wrapper.appendChild(errorDiv)
    wrapper.appendChild(progressBar)

    wrapper.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      this.dropdownManager?.closeAll()
    })
    this.container.appendChild(wrapper)
    this.wrapper = wrapper

    // Clamp to viewport
    clampToViewport(wrapper)

    // Make draggable — exclude interactive children
    this.cleanupDrag = makeDraggable(wrapper, {
      exclude: 'textarea:not(:disabled), button, [data-dropdown-trigger]',
      onDragEnd: (pos) => {
        this.lastPosition = pos
      },
    })

    if (position) {
      this.lastPosition = position
    }

    textarea.focus()
  }

  getLastPosition(): UIPosition | null {
    return this.lastPosition
  }

  getSelectedModel(): string | undefined {
    if (!this.modelDropdown) return undefined
    const selected = this.modelDropdown.getSelected()
    return selected.length > 0 ? selected[0].id : undefined
  }

  getSelectedPresets(): readonly AnalysisPreset[] {
    if (!this.presetDropdown) return []
    return this.presetDropdown.getSelected().map((item) => {
      const idx = parseInt(item.id.replace('preset-', ''), 10)
      return this.presets[idx]
    })
  }

  openSettings(message?: string): void {
    if (!this.settingsPanel) return
    this.settingsPanel.open()
    if (message) {
      this.settingsPanel.showMessage(message)
    }
  }

  showError(message: string): void {
    if (!this.wrapper) return
    const errorDiv = this.wrapper.querySelector('[data-agent-overlay-error]') as HTMLElement | null
    if (!errorDiv) return

    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }

    errorDiv.textContent = message
    errorDiv.style.display = 'block'

    this.errorTimer = setTimeout(() => {
      errorDiv.style.display = 'none'
      this.errorTimer = null
    }, ERROR_DISMISS_MS)
  }

  private clearError(): void {
    if (!this.wrapper) return
    const errorDiv = this.wrapper.querySelector('[data-agent-overlay-error]') as HTMLElement | null
    if (!errorDiv) return

    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }
    errorDiv.style.display = 'none'
  }

  setLoading(loading: boolean): void {
    if (!this.wrapper) return

    const ta = this.wrapper.querySelector('textarea') as HTMLTextAreaElement | null
    const toolbar = this.wrapper.querySelector('div[style*="border-top"]') as HTMLElement | null
    const progress = this.wrapper.querySelector(
      '[data-agent-overlay-progress]',
    ) as HTMLElement | null

    if (ta) {
      ta.disabled = loading
      ta.style.pointerEvents = loading ? 'none' : 'auto'
    }
    if (toolbar) {
      toolbar.style.display = loading ? 'none' : 'flex'
    }
    if (progress) {
      progress.style.display = loading ? 'block' : 'none'
    }
  }

  hide(): void {
    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }
    this.cleanupDrag?.()
    this.cleanupDrag = null
    this.dropdownManager?.destroy()
    this.dropdownManager = null
    this.modelDropdown?.destroy()
    this.modelDropdown = null
    this.presetDropdown?.destroy()
    this.presetDropdown = null
    this.settingsPanel?.destroy()
    this.settingsPanel = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    }
  }

  destroy(): void {
    this.hide()
    this.onSubmit = null
    this.onCancel = null
    this.onQuickRun = null
  }
}
