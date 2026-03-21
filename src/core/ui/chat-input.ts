// src/core/ui/chat-input.ts
import type { ModelOption, AnalysisPreset } from '../types'
import { Dropdown } from './dropdown'
import { DropdownManager } from './dropdown-manager'
import { SettingsPanel } from './settings-panel'

const ERROR_DISMISS_MS = 5000
const MIN_HEIGHT = 40
const MAX_HEIGHT = 140
const SUBMIT_ACTIVE_BG = '#2196f3'
const SUBMIT_INACTIVE_BG = '#555'

export interface ChatInputOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
}

export class ChatInput {
  private readonly containerEl: HTMLElement
  private readonly availableModels: readonly ModelOption[]
  private readonly presets: readonly AnalysisPreset[]
  private readonly requiresApiKey: boolean
  private readonly apiKeyStorageKey: string | undefined

  private readonly textarea: HTMLTextAreaElement
  private readonly errorDiv: HTMLElement
  private modelDropdown: Dropdown | null = null
  private presetDropdown: Dropdown | null = null
  private readonly dropdownManager: DropdownManager
  private settingsPanel: SettingsPanel | null = null
  private submitBtn: HTMLButtonElement | null = null
  private updateSubmitState: (() => void) | null = null
  private errorTimer: ReturnType<typeof setTimeout> | null = null

  onSubmit: ((text: string) => void) | null = null

  constructor(container: HTMLElement, options?: ChatInputOptions) {
    this.containerEl = container
    this.availableModels = options?.availableModels ?? []
    this.presets = options?.presets ?? []
    this.requiresApiKey = options?.requiresApiKey ?? false
    this.apiKeyStorageKey = options?.apiKeyStorageKey
    this.dropdownManager = new DropdownManager()

    this.textarea = this.buildTextarea()
    this.errorDiv = this.buildErrorDiv()

    const toolbar = this.buildToolbar()

    // ── Input row (textarea + submit button fixed at bottom-right) ──────────
    const inputRow = document.createElement('div')
    inputRow.style.cssText = `
      position: relative;
      padding: 8px 10px 6px;
    `
    inputRow.appendChild(this.textarea)

    // Submit button + hint fixed at bottom-right of input row
    const submitArea = document.createElement('div')
    submitArea.style.cssText = `
      position: absolute; bottom: 10px; right: 14px;
      display: flex; align-items: center; gap: 4px;
    `

    const modKey = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? '\u2318' : 'Ctrl'
    const hint = document.createElement('span')
    hint.textContent = `${modKey}\u21b5`
    hint.style.cssText = 'color: var(--ao-hint); font-size: 11px;'

    const submitBtn = document.createElement('button')
    submitBtn.setAttribute('data-agent-overlay-submit', '')
    submitBtn.textContent = '\u2191' // ↑
    submitBtn.style.cssText = `
      width: 28px; height: 28px; border-radius: 50%; border: none;
      background: ${SUBMIT_INACTIVE_BG}; color: #fff;
      font-size: 14px; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      font-family: inherit; flex-shrink: 0;
    `
    this.submitBtn = submitBtn

    const updateSubmitState = () => {
      const hasText = this.textarea.value.trim().length > 0
      const hasPresets = this.presetDropdown ? this.presetDropdown.getSelected().length > 0 : false
      submitBtn.style.background = hasText || hasPresets ? SUBMIT_ACTIVE_BG : SUBMIT_INACTIVE_BG
    }
    this.textarea.addEventListener('input', updateSubmitState)
    this.updateSubmitState = updateSubmitState

    submitBtn.addEventListener('click', () => {
      this.handleSubmit()
    })

    submitArea.appendChild(hint)
    submitArea.appendChild(submitBtn)
    inputRow.appendChild(submitArea)

    this.containerEl.appendChild(toolbar)
    this.containerEl.appendChild(inputRow)
    this.containerEl.appendChild(this.errorDiv)

    // Initialize submit button state (presets may be pre-selected)
    updateSubmitState()

    // Auto-open settings if BYOK key is missing
    if (this.settingsPanel && !this.settingsPanel.getApiKey()) {
      this.settingsPanel.open()
      this.settingsPanel.showMessage('Please set your API key to get started.')
    }
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private buildTextarea(): HTMLTextAreaElement {
    const ta = document.createElement('textarea')
    ta.placeholder = 'Ask about this range, or leave empty to run presets'
    ta.rows = 1
    ta.style.cssText = `
      width: 100%; box-sizing: border-box;
      background: transparent; border: none; outline: none;
      color: var(--ao-text); font-size: 14px; font-family: inherit;
      line-height: 20px; resize: none; padding: 2px 4px; cursor: text;
      overflow: hidden; min-height: ${MIN_HEIGHT}px;
    `
    ta.style.height = `${MIN_HEIGHT}px`

    const autoGrow = () => {
      ta.style.height = `${MIN_HEIGHT}px`
      const targetHeight = Math.max(ta.scrollHeight, MIN_HEIGHT)
      ta.style.height = `${Math.min(targetHeight, MAX_HEIGHT)}px`
      ta.style.overflow = targetHeight > MAX_HEIGHT ? 'auto' : 'hidden'
    }
    ta.addEventListener('input', autoGrow)

    ta.addEventListener('focus', () => {
      this.dropdownManager.closeAll()
    })

    ta.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        this.handleSubmit()
      }
    })

    return ta
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.setAttribute('data-chat-input-toolbar', '')
    toolbar.style.cssText = `
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-bottom: 1px solid var(--ao-border);
    `

    // Settings gear (far left)
    if (this.requiresApiKey) {
      const gearBtn = document.createElement('button')
      gearBtn.setAttribute('data-agent-overlay-settings-trigger', '')
      gearBtn.textContent = '\u2699'
      gearBtn.style.cssText = `
        background: transparent; border: none; color: var(--ao-hint);
        font-size: 16px; cursor: pointer; padding: 0;
        font-family: inherit; flex-shrink: 0;
      `

      this.settingsPanel = new SettingsPanel(this.containerEl, {
        storageKey: this.apiKeyStorageKey,
        manager: this.dropdownManager,
      })
      this.dropdownManager.register(this.settingsPanel)

      gearBtn.addEventListener('click', () => {
        this.settingsPanel?.open()
      })
      toolbar.appendChild(gearBtn)
    }

    // Model dropdown
    if (this.availableModels.length > 0) {
      const modelWrapper = document.createElement('span')
      modelWrapper.setAttribute('data-chat-input-model-dropdown', '')
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
      this.modelDropdown.setSelected([this.availableModels[0].id])
    }

    // Preset dropdown
    if (this.presets.length > 0) {
      const presetWrapper = document.createElement('span')
      presetWrapper.setAttribute('data-chat-input-preset-dropdown', '')
      this.presetDropdown = new Dropdown({
        items: this.presets.map((p, i) => ({ id: `preset-${i}`, label: p.label })),
        multiSelect: true,
        placeholder: 'Presets',
        manager: this.dropdownManager,
      })
      this.dropdownManager.register(this.presetDropdown)
      presetWrapper.appendChild(this.presetDropdown.element)
      toolbar.appendChild(presetWrapper)

      // Pre-select first preset
      this.presetDropdown.setSelected(['preset-0'])
    }

    // Spacer
    const spacer = document.createElement('div')
    spacer.style.cssText = 'flex: 1'
    toolbar.appendChild(spacer)

    return toolbar
  }

  private buildErrorDiv(): HTMLElement {
    const errorDiv = document.createElement('div')
    errorDiv.setAttribute('data-chat-input-error', '')
    errorDiv.style.cssText = `
      display: none; padding: 4px 12px 6px;
      font-size: 12px; color: #f44336;
    `
    return errorDiv
  }

  // ── Public API ─────────────────────────────────────────────────────────────

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

  setLoading(loading: boolean): void {
    this.textarea.disabled = loading
    this.textarea.style.pointerEvents = loading ? 'none' : 'auto'
    if (this.submitBtn) {
      this.submitBtn.disabled = loading
      this.submitBtn.style.opacity = loading ? '0.5' : '1'
    }
  }

  openSettings(message?: string): void {
    if (!this.settingsPanel) return
    this.settingsPanel.open()
    if (message) {
      this.settingsPanel.showMessage(message)
    }
  }

  closeDropdowns(): void {
    this.dropdownManager.closeAll()
  }

  showError(message: string): void {
    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }

    this.errorDiv.textContent = message
    this.errorDiv.style.display = 'block'

    this.errorTimer = setTimeout(() => {
      this.errorDiv.style.display = 'none'
      this.errorTimer = null
    }, ERROR_DISMISS_MS)
  }

  private handleSubmit(): void {
    const value = this.textarea.value.trim()
    if (value) {
      this.clearError()
      this.onSubmit?.(value)
      this.textarea.value = ''
      this.textarea.style.height = `${MIN_HEIGHT}px`
      this.updateSubmitState?.()
    } else {
      // Quick run: use selected presets' quickPrompt as the prompt
      const selectedPresets = this.getSelectedPresets()
      if (selectedPresets.length === 0) return
      const quickPrompt = selectedPresets.map((p) => p.quickPrompt).join('\n')
      this.clearError()
      this.onSubmit?.(quickPrompt)
      this.updateSubmitState?.()
    }
  }

  private clearError(): void {
    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }
    this.errorDiv.style.display = 'none'
  }

  focus(): void {
    this.textarea.focus()
  }

  destroy(): void {
    if (this.errorTimer !== null) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }
    this.dropdownManager.destroy()
    this.modelDropdown?.destroy()
    this.modelDropdown = null
    this.presetDropdown?.destroy()
    this.presetDropdown = null
    this.settingsPanel?.destroy()
    this.settingsPanel = null
    this.onSubmit = null

    // Remove all rendered children
    while (this.containerEl.firstChild) {
      this.containerEl.removeChild(this.containerEl.firstChild)
    }
  }
}
