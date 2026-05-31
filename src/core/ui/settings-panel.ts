// src/core/ui/settings-panel.ts

import { stopPointerPropagation } from './pointer-events'
import type { SettingsStore } from '../settings-store'
import { DEFAULT_PERSONA } from '../../providers/default-system-prompt'

const DEFAULT_STORAGE_KEY = 'agent-overlay-api-key'

interface SettingsPanelOptions {
  readonly storageKey?: string
  readonly settingsStore?: SettingsStore
  readonly requiresApiKey?: boolean
  readonly manager?: { closeAllExcept(keep: SettingsPanel): void }
}

export class SettingsPanel {
  private readonly container: HTMLElement
  private readonly storageKey: string
  private readonly settingsStore: SettingsStore | undefined
  private readonly showApiKey: boolean
  private readonly manager: SettingsPanelOptions['manager']
  private panelEl: HTMLElement | null = null

  onSave: (() => void) | null = null

  constructor(container: HTMLElement, options?: SettingsPanelOptions) {
    this.container = container
    this.storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY
    this.settingsStore = options?.settingsStore
    this.showApiKey = options?.requiresApiKey !== false
    this.manager = options?.manager
  }

  open(): void {
    this.close()
    this.manager?.closeAllExcept(this)

    const panel = document.createElement('div')
    panel.setAttribute('data-agent-overlay-settings', '')
    panel.style.cssText = `
      position: absolute; z-index: 1001;
      background: var(--ao-bg); border: 1px solid var(--ao-border);
      border-radius: 6px; padding: 12px; min-width: 280px;
      max-height: 70vh; overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    `
    stopPointerPropagation(panel)

    // Title row
    const titleRow = document.createElement('div')
    titleRow.style.cssText =
      'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;'
    const title = document.createElement('span')
    title.textContent = 'Settings'
    title.style.cssText = 'color: var(--ao-text); font-size: 14px; font-weight: 600;'
    titleRow.appendChild(title)
    const closeBtn = document.createElement('button')
    closeBtn.setAttribute('data-agent-overlay-close', '')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = `
      background: transparent; border: none; color: var(--ao-hint);
      font-size: 18px; cursor: pointer; padding: 0; line-height: 1;
    `
    closeBtn.addEventListener('click', () => this.close())
    titleRow.appendChild(closeBtn)
    panel.appendChild(titleRow)

    // Message area
    const messageEl = document.createElement('div')
    messageEl.setAttribute('data-agent-overlay-settings-message', '')
    messageEl.style.cssText = 'display: none; font-size: 12px; color: #f44336; margin-bottom: 8px;'
    panel.appendChild(messageEl)

    // ── API Key field (BYOK only) ───────────────────────────────────────────
    let apiKeyInput: HTMLInputElement | null = null
    let removeBtn: HTMLButtonElement | null = null
    if (this.showApiKey) {
      const existingKey = localStorage.getItem(this.storageKey)

      const label = document.createElement('label')
      label.textContent = 'API Key'
      label.style.cssText =
        'display: block; color: var(--ao-hint); font-size: 12px; margin-bottom: 4px;'
      panel.appendChild(label)

      const input = document.createElement('input')
      input.type = 'password'
      input.value = existingKey ?? ''
      input.placeholder = 'sk-...'
      input.style.cssText = `
        display: block; width: 100%; box-sizing: border-box;
        background: var(--ao-toolbar); border: 1px solid var(--ao-border);
        border-radius: 4px; padding: 6px 8px; color: var(--ao-text);
        font-size: 13px; font-family: inherit; outline: none; margin-bottom: 10px;
      `
      panel.appendChild(input)
      apiKeyInput = input

      const rm = document.createElement('button')
      rm.setAttribute('data-agent-overlay-settings-remove', '')
      rm.textContent = 'Remove'
      rm.style.cssText = `
        background: transparent; border: 1px solid var(--ao-border);
        border-radius: 4px; padding: 4px 12px; color: #f44336;
        font-size: 13px; cursor: pointer; font-family: inherit;
      `
      rm.style.display = existingKey ? 'inline-block' : 'none'
      rm.addEventListener('click', () => {
        localStorage.removeItem(this.storageKey)
        input.value = ''
        rm.style.display = 'none'
      })
      removeBtn = rm
    }

    // ── Settings fields ──────────────────────────────────────────────────────
    let personaInput: HTMLTextAreaElement | null = null
    let tempInput: HTMLInputElement | null = null
    let maxTokInput: HTMLInputElement | null = null
    if (this.settingsStore) {
      const settings = this.settingsStore.get()

      // Reset is eager: it deletes the stored field immediately (not deferred to Save).
      personaInput = document.createElement('textarea')
      personaInput.setAttribute('data-agent-overlay-settings-system-prompt', '')
      personaInput.rows = 4
      personaInput.placeholder = DEFAULT_PERSONA
      personaInput.value = settings.systemPrompt ?? ''
      personaInput.style.cssText = this.fieldControlCss('resize: vertical; min-height: 60px;')
      this.appendField(panel, 'System Prompt', 'systemPrompt', personaInput, () => {
        this.settingsStore?.reset('systemPrompt')
        if (personaInput) personaInput.value = ''
      })

      tempInput = document.createElement('input')
      tempInput.setAttribute('data-agent-overlay-settings-temperature', '')
      tempInput.type = 'number'
      tempInput.min = '0'
      tempInput.max = '1'
      tempInput.step = '0.1'
      tempInput.placeholder = 'Use default'
      tempInput.value = settings.temperature !== undefined ? String(settings.temperature) : ''
      tempInput.style.cssText = this.fieldControlCss()
      this.appendField(panel, 'Temperature (0–1)', 'temperature', tempInput, () => {
        this.settingsStore?.reset('temperature')
        if (tempInput) tempInput.value = ''
      })

      maxTokInput = document.createElement('input')
      maxTokInput.setAttribute('data-agent-overlay-settings-max-tokens', '')
      maxTokInput.type = 'number'
      maxTokInput.min = '1'
      maxTokInput.step = '1'
      maxTokInput.placeholder = 'Use default'
      maxTokInput.value = settings.maxTokens !== undefined ? String(settings.maxTokens) : ''
      maxTokInput.style.cssText = this.fieldControlCss()
      this.appendField(panel, 'Max Tokens', 'maxTokens', maxTokInput, () => {
        this.settingsStore?.reset('maxTokens')
        if (maxTokInput) maxTokInput.value = ''
      })
    }

    // ── Button row ─────────────────────────────────────────────────────────
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px;'
    if (removeBtn) btnRow.appendChild(removeBtn)

    const saveBtn = document.createElement('button')
    saveBtn.setAttribute('data-agent-overlay-settings-save', '')
    saveBtn.textContent = 'Save'
    saveBtn.style.cssText = `
      background: #2196f3; border: none; border-radius: 4px;
      padding: 4px 12px; color: #fff; font-size: 13px;
      cursor: pointer; font-family: inherit;
    `
    saveBtn.addEventListener('click', () => {
      if (apiKeyInput) {
        const value = apiKeyInput.value.trim()
        if (value) localStorage.setItem(this.storageKey, value)
      }
      if (this.settingsStore) {
        const persona = personaInput?.value.trim() ?? ''
        const temp = tempInput?.value.trim() ?? ''
        const maxTok = maxTokInput?.value.trim() ?? ''
        this.settingsStore.set({
          systemPrompt: persona === '' ? undefined : persona,
          temperature: temp === '' ? undefined : Number(temp),
          maxTokens: maxTok === '' ? undefined : Number(maxTok),
        })
      }
      this.close()
      this.onSave?.()
    })
    btnRow.appendChild(saveBtn)
    panel.appendChild(btnRow)

    this.container.appendChild(panel)
    this.panelEl = panel
    apiKeyInput?.focus()
  }

  private fieldControlCss(extra = ''): string {
    return `
      display: block; width: 100%; box-sizing: border-box;
      background: var(--ao-toolbar); border: 1px solid var(--ao-border);
      border-radius: 4px; padding: 6px 8px; color: var(--ao-text);
      font-size: 13px; font-family: inherit; outline: none; margin-bottom: 10px;
      ${extra}
    `
  }

  private appendField(
    parent: HTMLElement,
    labelText: string,
    fieldKey: string,
    control: HTMLInputElement | HTMLTextAreaElement,
    onReset: () => void,
  ): void {
    const labelRow = document.createElement('div')
    labelRow.style.cssText =
      'display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;'

    const label = document.createElement('label')
    label.textContent = labelText
    label.style.cssText = 'color: var(--ao-hint); font-size: 12px;'

    const resetBtn = document.createElement('button')
    resetBtn.setAttribute('data-agent-overlay-settings-reset', fieldKey)
    resetBtn.textContent = 'Reset'
    resetBtn.style.cssText = `
      background: transparent; border: none; color: var(--ao-hint);
      font-size: 11px; cursor: pointer; padding: 0; font-family: inherit;
    `
    resetBtn.addEventListener('click', onReset)

    labelRow.appendChild(label)
    labelRow.appendChild(resetBtn)
    parent.appendChild(labelRow)
    parent.appendChild(control)
  }

  showMessage(text: string): void {
    if (!this.panelEl) return
    const msg = this.panelEl.querySelector(
      '[data-agent-overlay-settings-message]',
    ) as HTMLElement | null
    if (!msg) return
    msg.textContent = text
    msg.style.display = 'block'
  }

  getApiKey(): string | null {
    return localStorage.getItem(this.storageKey)
  }

  close(): void {
    if (!this.panelEl) return
    this.panelEl.remove()
    this.panelEl = null
  }

  destroy(): void {
    this.close()
    this.onSave = null
  }
}
