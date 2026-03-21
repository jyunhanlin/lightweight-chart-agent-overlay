// src/core/ui/settings-panel.ts

import { stopPointerPropagation } from './pointer-events'

const DEFAULT_STORAGE_KEY = 'agent-overlay-api-key'

interface SettingsPanelOptions {
  readonly storageKey?: string
  readonly manager?: { closeAllExcept(keep: SettingsPanel): void }
}

export class SettingsPanel {
  private readonly container: HTMLElement
  private readonly storageKey: string
  private readonly manager: SettingsPanelOptions['manager']
  private panelEl: HTMLElement | null = null

  onSave: (() => void) | null = null

  constructor(container: HTMLElement, options?: SettingsPanelOptions) {
    this.container = container
    this.storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY
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

    // Label
    const label = document.createElement('label')
    label.textContent = 'API Key'
    label.style.cssText =
      'display: block; color: var(--ao-hint); font-size: 12px; margin-bottom: 4px;'
    panel.appendChild(label)

    // Input
    const existingKey = localStorage.getItem(this.storageKey)
    const input = document.createElement('input')
    input.type = 'password'
    input.value = existingKey ?? ''
    input.placeholder = 'sk-...'
    input.style.cssText = `
      display: block; width: 100%; box-sizing: border-box;
      background: var(--ao-toolbar); border: 1px solid var(--ao-border);
      border-radius: 4px; padding: 6px 8px; color: var(--ao-text);
      font-size: 13px; font-family: inherit; outline: none;
    `
    panel.appendChild(input)

    // Button row
    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px;'

    // Remove button
    const removeBtn = document.createElement('button')
    removeBtn.setAttribute('data-agent-overlay-settings-remove', '')
    removeBtn.textContent = 'Remove'
    removeBtn.style.cssText = `
      background: transparent; border: 1px solid var(--ao-border);
      border-radius: 4px; padding: 4px 12px; color: #f44336;
      font-size: 13px; cursor: pointer; font-family: inherit;
    `
    removeBtn.style.display = existingKey ? 'inline-block' : 'none'
    removeBtn.addEventListener('click', () => {
      localStorage.removeItem(this.storageKey)
      input.value = ''
      removeBtn.style.display = 'none'
      saveBtn.disabled = true
    })
    btnRow.appendChild(removeBtn)

    // Save button
    const saveBtn = document.createElement('button')
    saveBtn.setAttribute('data-agent-overlay-settings-save', '')
    saveBtn.textContent = 'Save'
    saveBtn.disabled = !input.value.trim()
    saveBtn.style.cssText = `
      background: #2196f3; border: none; border-radius: 4px;
      padding: 4px 12px; color: #fff; font-size: 13px;
      cursor: pointer; font-family: inherit;
    `
    input.addEventListener('input', () => {
      saveBtn.disabled = !input.value.trim()
    })
    saveBtn.addEventListener('click', () => {
      const value = input.value.trim()
      if (!value) return
      localStorage.setItem(this.storageKey, value)
      this.close()
      this.onSave?.()
    })
    btnRow.appendChild(saveBtn)

    panel.appendChild(btnRow)
    this.container.appendChild(panel)
    this.panelEl = panel
    input.focus()
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
