// src/core/ui/settings-panel.test.ts
import { SettingsPanel } from './settings-panel'

const STORAGE_KEY = 'test-api-key'

describe('SettingsPanel', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
  })

  afterEach(() => {
    container.remove()
    localStorage.clear()
  })

  // --- Rendering ---

  it('open() renders panel with data attribute', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    expect(container.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
    panel.destroy()
  })

  it('renders password input for API key', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(input).not.toBeNull()
    panel.destroy()
  })

  it('renders Save button', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const saveBtn = container.querySelector('[data-agent-overlay-settings-save]')
    expect(saveBtn).not.toBeNull()
    panel.destroy()
  })

  // --- Save ---

  it('Save button stores key in localStorage', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    input.value = 'sk-test-123'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const saveBtn = container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement
    saveBtn.click()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('sk-test-123')
    panel.destroy()
  })

  it('Save button closes panel', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    input.value = 'sk-test-123'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const saveBtn = container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement
    saveBtn.click()
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
    panel.destroy()
  })

  it('Save button fires onSave callback', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    const onSave = vi.fn()
    panel.onSave = onSave
    panel.open()
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    input.value = 'sk-test-123'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const saveBtn = container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement
    saveBtn.click()
    expect(onSave).toHaveBeenCalled()
    panel.destroy()
  })

  it('Save button is disabled when input is empty', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const saveBtn = container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
    panel.destroy()
  })

  // --- Load existing key ---

  it('pre-fills input when key exists in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-existing')
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const input = container.querySelector('input[type="password"]') as HTMLInputElement
    expect(input.value).toBe('sk-existing')
    panel.destroy()
  })

  // --- Remove ---

  it('Remove button clears localStorage entry', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-existing')
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const removeBtn = container.querySelector('[data-agent-overlay-settings-remove]') as HTMLButtonElement
    removeBtn.click()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    panel.destroy()
  })

  it('Remove button is hidden when no key stored', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const removeBtn = container.querySelector('[data-agent-overlay-settings-remove]') as HTMLElement
    expect(removeBtn.style.display).toBe('none')
    panel.destroy()
  })

  it('Remove button is visible when key is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-existing')
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const removeBtn = container.querySelector('[data-agent-overlay-settings-remove]') as HTMLElement
    expect(removeBtn.style.display).not.toBe('none')
    panel.destroy()
  })

  // --- Close ---

  it('close() removes panel from DOM', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    panel.close()
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
  })

  it('× button closes panel', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    const closeBtn = container.querySelector('[data-agent-overlay-settings] [data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
    panel.destroy()
  })

  it('close() does not throw when not open', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    expect(() => panel.close()).not.toThrow()
    panel.destroy()
  })

  // --- DropdownManager integration ---

  it('notifies manager on open via closeAllExcept', () => {
    const manager = { closeAllExcept: vi.fn() }
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY, manager })
    panel.open()
    expect(manager.closeAllExcept).toHaveBeenCalledWith(panel)
    panel.destroy()
  })

  // --- Error message ---

  it('showMessage() displays text in panel', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.open()
    panel.showMessage('Please enter your API key')
    const msg = container.querySelector('[data-agent-overlay-settings-message]') as HTMLElement
    expect(msg.textContent).toContain('Please enter your API key')
    panel.destroy()
  })

  // --- getApiKey helper ---

  it('getApiKey() returns stored key', () => {
    localStorage.setItem(STORAGE_KEY, 'sk-stored')
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    expect(panel.getApiKey()).toBe('sk-stored')
    panel.destroy()
  })

  it('getApiKey() returns null when no key stored', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    expect(panel.getApiKey()).toBeNull()
    panel.destroy()
  })

  // --- destroy ---

  it('destroy() removes panel and nulls callbacks', () => {
    const panel = new SettingsPanel(container, { storageKey: STORAGE_KEY })
    panel.onSave = vi.fn()
    panel.open()
    panel.destroy()
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
    expect(panel.onSave).toBeNull()
  })
})
