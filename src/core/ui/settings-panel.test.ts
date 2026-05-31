// src/core/ui/settings-panel.test.ts
import { SettingsPanel } from './settings-panel'
import { createSettingsStore } from '../settings-store'
import { DEFAULT_PERSONA } from '../../providers/default-system-prompt'

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
    const saveBtn = container.querySelector(
      '[data-agent-overlay-settings-save]',
    ) as HTMLButtonElement
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
    const saveBtn = container.querySelector(
      '[data-agent-overlay-settings-save]',
    ) as HTMLButtonElement
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
    const saveBtn = container.querySelector(
      '[data-agent-overlay-settings-save]',
    ) as HTMLButtonElement
    saveBtn.click()
    expect(onSave).toHaveBeenCalled()
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
    const removeBtn = container.querySelector(
      '[data-agent-overlay-settings-remove]',
    ) as HTMLButtonElement
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
    const closeBtn = container.querySelector(
      '[data-agent-overlay-settings] [data-agent-overlay-close]',
    ) as HTMLButtonElement
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

describe('SettingsPanel — settings fields', () => {
  let container: HTMLElement
  const SETTINGS_KEY = 'test-settings'

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    localStorage.clear()
  })
  afterEach(() => {
    container.remove()
    localStorage.clear()
  })

  function open(requiresApiKey?: boolean) {
    const store = createSettingsStore(SETTINGS_KEY)
    const panel = new SettingsPanel(container, {
      storageKey: 'test-api-key',
      settingsStore: store,
      requiresApiKey,
    })
    panel.open()
    return { panel, store }
  }

  it('renders system prompt, temperature, and max tokens fields', () => {
    const { panel } = open(true)
    expect(container.querySelector('[data-agent-overlay-settings-system-prompt]')).not.toBeNull()
    expect(container.querySelector('[data-agent-overlay-settings-temperature]')).not.toBeNull()
    expect(container.querySelector('[data-agent-overlay-settings-max-tokens]')).not.toBeNull()
    panel.destroy()
  })

  it('system prompt textarea placeholder is DEFAULT_PERSONA', () => {
    const { panel } = open(true)
    const ta = container.querySelector(
      '[data-agent-overlay-settings-system-prompt]',
    ) as HTMLTextAreaElement
    expect(ta.placeholder).toBe(DEFAULT_PERSONA)
    panel.destroy()
  })

  it('hides API key field when requiresApiKey is false', () => {
    const { panel } = open(false)
    expect(container.querySelector('input[type="password"]')).toBeNull()
    expect(container.querySelector('[data-agent-overlay-settings-system-prompt]')).not.toBeNull()
    panel.destroy()
  })

  it('Save persists settings fields to the store', () => {
    const { panel, store } = open(true)
    ;(
      container.querySelector('[data-agent-overlay-settings-system-prompt]') as HTMLTextAreaElement
    ).value = 'My persona'
    ;(
      container.querySelector('[data-agent-overlay-settings-temperature]') as HTMLInputElement
    ).value = '0.4'
    ;(
      container.querySelector('[data-agent-overlay-settings-max-tokens]') as HTMLInputElement
    ).value = '1234'
    ;(container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement).click()
    expect(store.get()).toEqual({ systemPrompt: 'My persona', temperature: 0.4, maxTokens: 1234 })
    panel.destroy()
  })

  it('emptying a field and saving clears it from the store', () => {
    const store = createSettingsStore(SETTINGS_KEY)
    store.set({ temperature: 0.7 })
    const panel = new SettingsPanel(container, {
      storageKey: 'test-api-key',
      settingsStore: store,
      requiresApiKey: true,
    })
    panel.open()
    const temp = container.querySelector(
      '[data-agent-overlay-settings-temperature]',
    ) as HTMLInputElement
    expect(temp.value).toBe('0.7')
    temp.value = ''
    ;(container.querySelector('[data-agent-overlay-settings-save]') as HTMLButtonElement).click()
    expect(store.get().temperature).toBeUndefined()
    panel.destroy()
  })

  it('Reset clears a single field and its input', () => {
    const store = createSettingsStore(SETTINGS_KEY)
    store.set({ temperature: 0.9 })
    const panel = new SettingsPanel(container, {
      storageKey: 'test-api-key',
      settingsStore: store,
      requiresApiKey: true,
    })
    panel.open()
    ;(
      container.querySelector(
        '[data-agent-overlay-settings-reset="temperature"]',
      ) as HTMLButtonElement
    ).click()
    expect(store.get().temperature).toBeUndefined()
    expect(
      (container.querySelector('[data-agent-overlay-settings-temperature]') as HTMLInputElement)
        .value,
    ).toBe('')
    panel.destroy()
  })

  it('Save is enabled even when the API key input is empty', () => {
    const { panel } = open(true)
    const saveBtn = container.querySelector(
      '[data-agent-overlay-settings-save]',
    ) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
    panel.destroy()
  })

  it('positions the panel against its anchor, flipping upward near the viewport bottom', () => {
    const anchor = document.createElement('button')
    container.appendChild(anchor)
    // Anchor sits at the bottom of the viewport → no room below → open upward.
    anchor.getBoundingClientRect = () =>
      ({
        top: 760,
        bottom: 780,
        left: 40,
        right: 60,
        width: 20,
        height: 20,
        x: 40,
        y: 760,
      }) as DOMRect
    container.getBoundingClientRect = () =>
      ({
        top: 400,
        bottom: 790,
        left: 0,
        right: 460,
        width: 460,
        height: 390,
        x: 0,
        y: 400,
      }) as DOMRect
    const panel = new SettingsPanel(container, {
      settingsStore: createSettingsStore(SETTINGS_KEY),
      requiresApiKey: false,
      anchorEl: anchor,
    })
    panel.open()
    const el = container.querySelector('[data-agent-overlay-settings]') as HTMLElement
    expect(el.style.bottom).not.toBe('') // upward → bottom anchored at the gear's top
    expect(el.style.top).toBe('') // downward offset cleared
    expect(el.style.left).toBe('40px') // anchor left, relative to container
    panel.destroy()
  })
})
