# Provider Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BYOK (Bring Your Own Key) settings UI and custom provider auth headers so API keys are never hardcoded in production.

**Architecture:** Extend `AnalyzeOptions` with `apiKey` and `headers` fields. The overlay resolves `provider.headers` (static or async) before each `analyze()` call and reads BYOK keys from localStorage. A settings panel (gear icon in prompt input toolbar) lets end-users manage their own API key. The gear icon only appears when `provider.requiresApiKey === true`.

**Tech Stack:** TypeScript, vitest (jsdom), vanilla DOM

**Spec:** `docs/superpowers/specs/2026-03-19-provider-auth-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/types.ts` | Modify | Add `apiKey`, `headers` to `AnalyzeOptions`; `requiresApiKey`, `headers` to `LLMProvider`; `apiKeyStorageKey` to `AgentOverlayOptions` |
| `src/core/ui/settings-panel.ts` | Create | Settings panel component — API key input, Save/Remove, localStorage, `DropdownManager` integration |
| `src/core/ui/settings-panel.test.ts` | Create | Tests for settings panel |
| `src/providers/anthropic.ts` | Modify | `apiKey` optional, `requiresApiKey` flag, use `options.apiKey` fallback |
| `src/providers/anthropic.test.ts` | Modify | BYOK mode tests |
| `src/providers/openai.ts` | Modify | Same as anthropic |
| `src/providers/openai.test.ts` | Modify | BYOK mode tests |
| `src/core/ui/dropdown-manager.ts` | Modify | Extract `Closeable` interface so `SettingsPanel` can be registered alongside `Dropdown` |
| `src/core/ui/prompt-input.ts` | Modify | Add gear icon (conditional on `requiresApiKey`), wire settings panel |
| `src/core/ui/prompt-input.test.ts` | Modify | Gear icon visibility tests |
| `src/core/agent-overlay.ts` | Modify | Resolve `provider.headers`, read localStorage apiKey, pass to `analyze()`, handle auth errors |
| `src/core/agent-overlay.test.ts` | Modify | Header resolution + BYOK integration tests |
| `README.md` | Modify | BYOK usage, custom provider auth, security notes |

---

### Task 1: Interface Changes (`types.ts`)

**Files:**
- Modify: `src/core/types.ts:74-89` (AnalyzeOptions, LLMProvider)
- Modify: `src/core/types.ts:133-139` (AgentOverlayOptions)

- [ ] **Step 1: Add `apiKey` and `headers` to `AnalyzeOptions`**

In `src/core/types.ts`, change `AnalyzeOptions` (lines 74-77) to:

```ts
export interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
}
```

- [ ] **Step 2: Add `requiresApiKey` and `headers` to `LLMProvider`**

Change `LLMProvider` (lines 81-89) to:

```ts
export type ProviderHeaders =
  | Readonly<Record<string, string>>
  | (() => Record<string, string> | Promise<Record<string, string>>)

export interface LLMProvider {
  readonly availableModels?: readonly ModelOption[]
  readonly requiresApiKey?: boolean
  readonly headers?: ProviderHeaders
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
}
```

- [ ] **Step 3: Add `apiKeyStorageKey` to `AgentOverlayOptions`**

Change `AgentOverlayOptions` (lines 133-139) to:

```ts
export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly theme?: 'light' | 'dark'
  readonly dataAccessor?: DataAccessor
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly apiKeyStorageKey?: string
}
```

- [ ] **Step 4: Export new type in `src/index.ts`**

Add `ProviderHeaders` to the type exports in `src/index.ts`:

```ts
export type {
  // ... existing exports ...
  ProviderHeaders,
} from './core/types'
```

- [ ] **Step 5: Run typecheck to verify no breakage**

Run: `pnpm typecheck`
Expected: PASS (new fields are all optional, no existing code needs to change)

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/index.ts
git commit -m "feat: add apiKey, headers, requiresApiKey to provider interfaces"
```

---

### Task 2: Settings Panel Component

**Files:**
- Create: `src/core/ui/settings-panel.ts`
- Create: `src/core/ui/settings-panel.test.ts`

**Context:** The settings panel is a small popup opened by a gear icon. It must implement a `close()` method so `DropdownManager` can manage it alongside model/preset dropdowns. It reads/writes API keys to localStorage.

- [ ] **Step 1: Write failing tests for SettingsPanel**

Create `src/core/ui/settings-panel.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/ui/settings-panel.test.ts`
Expected: FAIL — `SettingsPanel` does not exist

- [ ] **Step 3: Implement SettingsPanel**

Create `src/core/ui/settings-panel.ts`:

```ts
// src/core/ui/settings-panel.ts

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
    panel.addEventListener('mousedown', (e) => e.stopPropagation())

    // Title row
    const titleRow = document.createElement('div')
    titleRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;'

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
    label.style.cssText = 'display: block; color: var(--ao-hint); font-size: 12px; margin-bottom: 4px;'
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
      display: ${existingKey ? 'inline-block' : 'none'};
    `
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
    const msg = this.panelEl.querySelector('[data-agent-overlay-settings-message]') as HTMLElement | null
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/ui/settings-panel.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ui/settings-panel.ts src/core/ui/settings-panel.test.ts
git commit -m "feat: add SettingsPanel component for BYOK API key management"
```

---

### Task 3: Built-in Providers — apiKey Optional + requiresApiKey

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/anthropic.test.ts`
- Modify: `src/providers/openai.ts`
- Modify: `src/providers/openai.test.ts`

**Context:** `apiKey` becomes optional in provider options. When omitted, the provider sets `requiresApiKey: true` and reads `options.apiKey` from `AnalyzeOptions` at runtime. Priority: constructor `apiKey` > `options.apiKey` > throw error.

- [ ] **Step 1: Write failing tests for Anthropic BYOK**

Add to `src/providers/anthropic.test.ts`:

```ts
it('allows creating provider without apiKey (BYOK mode)', () => {
  const provider = createAnthropicProvider({ availableModels: MODELS })
  expect(provider.analyze).toBeInstanceOf(Function)
})

it('sets requiresApiKey to true when apiKey is omitted', () => {
  const provider = createAnthropicProvider({ availableModels: MODELS })
  expect(provider.requiresApiKey).toBe(true)
})

it('sets requiresApiKey to false when apiKey is provided', () => {
  const provider = createAnthropicProvider({ apiKey: 'sk-test', availableModels: MODELS })
  expect(provider.requiresApiKey).toBe(false)
})

it('uses options.apiKey when constructor apiKey is omitted', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
  })
  const provider = createAnthropicProvider({ availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
  const headers = (globalThis.fetch as any).mock.calls[0][1].headers
  expect(headers['x-api-key']).toBe('sk-byok')
})

it('prefers constructor apiKey over options.apiKey', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
  })
  const provider = createAnthropicProvider({ apiKey: 'sk-constructor', availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
  const headers = (globalThis.fetch as any).mock.calls[0][1].headers
  expect(headers['x-api-key']).toBe('sk-constructor')
})

it('throws when no apiKey from constructor or options', async () => {
  const provider = createAnthropicProvider({ availableModels: MODELS })
  await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('API key is required')
})

it('includes anthropic-dangerous-direct-browser-access header in BYOK mode', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
  })
  const provider = createAnthropicProvider({ availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
  const headers = (globalThis.fetch as any).mock.calls[0][1].headers
  expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/providers/anthropic.test.ts`
Expected: FAIL — apiKey is currently required

- [ ] **Step 3: Implement Anthropic BYOK**

Modify `src/providers/anthropic.ts`:

```ts
interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string
  readonly availableModels: readonly ModelOption[]
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  if (options.availableModels.length === 0) {
    throw new Error('availableModels must contain at least one model')
  }
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const constructorApiKey = options.apiKey

  return {
    availableModels: options.availableModels,
    requiresApiKey: !constructorApiKey,
    async analyze(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
      analyzeOptions?: AnalyzeOptions,
    ): Promise<AnalysisResult> {
      const apiKey = constructorApiKey ?? analyzeOptions?.apiKey
      if (!apiKey) {
        throw new Error('API key is required. Provide it via constructor or AnalyzeOptions.')
      }

      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
        ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
        : systemPrompt

      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: requestModel,
          max_tokens: 4096,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ''

      return extractJsonFromText(text) as AnalysisResult
    },
  }
}
```

- [ ] **Step 4: Run Anthropic tests**

Run: `pnpm test -- src/providers/anthropic.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Write failing tests for OpenAI BYOK**

Add to `src/providers/openai.test.ts` (same pattern as Anthropic):

```ts
it('allows creating provider without apiKey (BYOK mode)', () => {
  const provider = createOpenAIProvider({ availableModels: MODELS })
  expect(provider.analyze).toBeInstanceOf(Function)
})

it('sets requiresApiKey to true when apiKey is omitted', () => {
  const provider = createOpenAIProvider({ availableModels: MODELS })
  expect(provider.requiresApiKey).toBe(true)
})

it('sets requiresApiKey to false when apiKey is provided', () => {
  const provider = createOpenAIProvider({ apiKey: 'sk-test', availableModels: MODELS })
  expect(provider.requiresApiKey).toBe(false)
})

it('uses options.apiKey when constructor apiKey is omitted', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: '{"explanation":"test"}' } }] }),
  })
  const provider = createOpenAIProvider({ availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
  const headers = (globalThis.fetch as any).mock.calls[0][1].headers
  expect(headers.Authorization).toBe('Bearer sk-byok')
})

it('prefers constructor apiKey over options.apiKey', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content: '{"explanation":"test"}' } }] }),
  })
  const provider = createOpenAIProvider({ apiKey: 'sk-constructor', availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
  const headers = (globalThis.fetch as any).mock.calls[0][1].headers
  expect(headers.Authorization).toBe('Bearer sk-constructor')
})

it('throws when no apiKey from constructor or options', async () => {
  const provider = createOpenAIProvider({ availableModels: MODELS })
  await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('API key is required')
})
```

- [ ] **Step 6: Implement OpenAI BYOK**

Apply the same pattern as Anthropic in `src/providers/openai.ts`:
- `apiKey` becomes optional in `OpenAIProviderOptions`
- Add `requiresApiKey: !constructorApiKey` to returned provider
- Resolve key: `const apiKey = constructorApiKey ?? analyzeOptions?.apiKey`
- Throw if no key: `if (!apiKey) throw new Error('API key is required...')`

- [ ] **Step 7: Run all provider tests**

Run: `pnpm test -- src/providers/`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/providers/anthropic.ts src/providers/anthropic.test.ts src/providers/openai.ts src/providers/openai.test.ts
git commit -m "feat: make apiKey optional in built-in providers (BYOK support)"
```

---

### Task 4: Prompt Input — Gear Icon + Settings Panel Integration

**Files:**
- Modify: `src/core/ui/prompt-input.ts`
- Modify: `src/core/ui/prompt-input.test.ts`

**Context:** Add a gear icon (⚙️) to the right end of the bottom toolbar, after the Enter hint. The icon is only visible when `requiresApiKey` option is true. Clicking it opens a `SettingsPanel`. The settings panel is registered with the existing `DropdownManager` for mutual exclusion.

- [ ] **Step 1: Write failing tests for gear icon**

Add to `src/core/ui/prompt-input.test.ts`:

```ts
// ── Settings gear icon ────────────────────────────────────────────────────

it('shows gear icon when requiresApiKey is true', () => {
  const prompt = new PromptInput(container, { requiresApiKey: true })
  prompt.show()
  const gear = container.querySelector('[data-agent-overlay-settings-trigger]')
  expect(gear).not.toBeNull()
  prompt.destroy()
})

it('hides gear icon when requiresApiKey is false', () => {
  const prompt = new PromptInput(container, { requiresApiKey: false })
  prompt.show()
  const gear = container.querySelector('[data-agent-overlay-settings-trigger]')
  expect(gear).toBeNull()
  prompt.destroy()
})

it('hides gear icon when requiresApiKey is not set', () => {
  const prompt = new PromptInput(container)
  prompt.show()
  const gear = container.querySelector('[data-agent-overlay-settings-trigger]')
  expect(gear).toBeNull()
  prompt.destroy()
})

it('gear icon opens settings panel', () => {
  const prompt = new PromptInput(container, { requiresApiKey: true })
  prompt.show()
  const gear = container.querySelector('[data-agent-overlay-settings-trigger]') as HTMLButtonElement
  gear.click()
  expect(container.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
  prompt.destroy()
})

it('gear icon closes other dropdowns via manager', () => {
  const prompt = new PromptInput(container, {
    availableModels: MODELS,
    requiresApiKey: true,
  })
  prompt.show()
  // Open model dropdown first
  const triggers = container.querySelectorAll('[data-dropdown-trigger]')
  ;(triggers[0] as HTMLButtonElement).click()
  expect(document.querySelector('[data-dropdown-panel]')).not.toBeNull()

  // Click gear — should close model dropdown
  const gear = container.querySelector('[data-agent-overlay-settings-trigger]') as HTMLButtonElement
  gear.click()
  expect(document.querySelector('[data-dropdown-panel]')).toBeNull()
  prompt.destroy()
})

// ── openSettings ──────────────────────────────────────────────────────────

it('openSettings() opens settings panel when requiresApiKey', () => {
  const prompt = new PromptInput(container, { requiresApiKey: true })
  prompt.show()
  prompt.openSettings()
  expect(container.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
  prompt.destroy()
})

it('openSettings() with message shows message in settings panel', () => {
  const prompt = new PromptInput(container, { requiresApiKey: true })
  prompt.show()
  prompt.openSettings('Enter your key')
  const msg = container.querySelector('[data-agent-overlay-settings-message]') as HTMLElement
  expect(msg.textContent).toContain('Enter your key')
  prompt.destroy()
})

it('openSettings() is a no-op when requiresApiKey is false', () => {
  const prompt = new PromptInput(container)
  prompt.show()
  prompt.openSettings()
  expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
  prompt.destroy()
})

it('openSettings() is a no-op when prompt is not shown', () => {
  const prompt = new PromptInput(container, { requiresApiKey: true })
  expect(() => prompt.openSettings()).not.toThrow()
  expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
  prompt.destroy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/ui/prompt-input.test.ts`
Expected: FAIL — `requiresApiKey` option and gear icon don't exist yet

- [ ] **Step 2b: Refactor DropdownManager to accept SettingsPanel**

In `src/core/ui/dropdown-manager.ts`, extract a `Closeable` interface so both `Dropdown` and `SettingsPanel` can be registered:

```ts
// src/core/ui/dropdown-manager.ts

export interface Closeable {
  close(): void
}

export class DropdownManager {
  private readonly dropdowns: Set<Closeable> = new Set()

  register(dropdown: Closeable): void {
    this.dropdowns.add(dropdown)
  }

  unregister(dropdown: Closeable): void {
    this.dropdowns.delete(dropdown)
  }

  closeAllExcept(keep: Closeable): void {
    for (const dd of this.dropdowns) {
      if (dd !== keep) dd.close()
    }
  }

  closeAll(): void {
    for (const dd of this.dropdowns) {
      dd.close()
    }
  }

  destroy(): void {
    this.dropdowns.clear()
  }
}
```

Update `Dropdown` to remove the concrete type import — it already satisfies `Closeable` since it has a `close()` method. Update `SettingsPanelOptions` manager type to use `Closeable`:

```ts
interface SettingsPanelOptions {
  readonly storageKey?: string
  readonly manager?: { closeAllExcept(keep: Closeable): void }
}
```

Run: `pnpm test -- src/core/ui/dropdown-manager.test.ts`
Expected: ALL PASS (no behavior change, just type widening)

- [ ] **Step 3: Add `requiresApiKey` and `apiKeyStorageKey` to `PromptInputOptions`**

In `src/core/ui/prompt-input.ts`, update the interface and constructor:

```ts
export interface PromptInputOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
}
```

Store both in the class:

```ts
private readonly requiresApiKey: boolean
private readonly apiKeyStorageKey: string | undefined

constructor(container: HTMLElement, options?: PromptInputOptions) {
  this.container = container
  this.availableModels = options?.availableModels ?? []
  this.presets = options?.presets ?? []
  this.requiresApiKey = options?.requiresApiKey ?? false
  this.apiKeyStorageKey = options?.apiKeyStorageKey
}
```

- [ ] **Step 4: Add gear icon and SettingsPanel to `show()` method**

In the `show()` method, after the `hint` element and before `toolbar.appendChild(submitBtn)`, add:

```ts
import { SettingsPanel } from './settings-panel'

// (add to class fields)
private settingsPanel: SettingsPanel | null = null

// (inside show(), after hint, before submitBtn)
if (this.requiresApiKey) {
  const gearBtn = document.createElement('button')
  gearBtn.setAttribute('data-agent-overlay-settings-trigger', '')
  gearBtn.textContent = '⚙'
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
```

Also update `hide()` to clean up:

```ts
this.settingsPanel?.destroy()
this.settingsPanel = null
```

- [ ] **Step 5: Run prompt-input tests**

Run: `pnpm test -- src/core/ui/prompt-input.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/ui/dropdown-manager.ts src/core/ui/prompt-input.ts src/core/ui/prompt-input.test.ts
git commit -m "feat: add settings gear icon to prompt input toolbar (BYOK)"
```

---

### Task 5: Agent Overlay — Resolve Headers, Pass apiKey, Handle Auth Errors

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

**Context:** Before each `analyze()` call, the overlay resolves `provider.headers` (static or async function) and reads the BYOK key from localStorage. Both are passed via `AnalyzeOptions`. If `provider.requiresApiKey` is true and no key is available, auto-open the settings panel. On 401/403 errors, auto-open the settings panel with an error message.

- [ ] **Step 1: Write failing tests for header resolution and BYOK wiring**

Add to `src/core/agent-overlay.test.ts`. The exact test structure depends on how the existing tests mock the chart/series (review the existing test file for patterns). Key tests to add:

```ts
it('passes apiKey from localStorage to provider.analyze()', async () => {
  // Set up localStorage with a key
  localStorage.setItem('agent-overlay-api-key', 'sk-stored')
  // Create overlay with provider that has requiresApiKey: true
  // Trigger analysis
  // Assert provider.analyze was called with options.apiKey === 'sk-stored'
  localStorage.clear()
})

it('resolves static provider.headers and passes to analyze()', async () => {
  // Create provider with headers: { Authorization: 'Bearer token' }
  // Trigger analysis
  // Assert provider.analyze was called with options.headers containing Authorization
})

it('resolves async provider.headers and passes to analyze()', async () => {
  // Create provider with headers: async () => ({ 'X-Custom': 'value' })
  // Trigger analysis
  // Assert provider.analyze was called with options.headers containing X-Custom
})

it('auto-opens settings panel when requiresApiKey and no key', async () => {
  // Create overlay with requiresApiKey provider, no localStorage key
  // Trigger analysis submit
  // Assert settings panel is visible
})

it('auto-opens settings panel on 401 error', async () => {
  // Create overlay with provider that throws "API error (401)"
  // Set localStorage key (so analysis attempts)
  // Trigger analysis
  // Assert settings panel opens with error message
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/agent-overlay.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement overlay wiring**

In `src/core/agent-overlay.ts`:

**3a. Add a `resolveHeaders` helper function:**

```ts
async function resolveHeaders(
  provider: LLMProvider,
): Promise<Record<string, string> | undefined> {
  if (!provider.headers) return undefined
  if (typeof provider.headers === 'function') {
    return provider.headers()
  }
  return { ...provider.headers }
}
```

**3b. Pass `apiKeyStorageKey` and `requiresApiKey` to PromptInput:**

```ts
const promptInput = new PromptInput(chartEl, {
  availableModels: options.provider.availableModels,
  presets,
  requiresApiKey: options.provider.requiresApiKey,
  apiKeyStorageKey: options.apiKeyStorageKey,
})
```

**3c. Update `runAnalysis` to resolve headers and read apiKey:**

In the `runAnalysis` function, before calling `options.provider.analyze`, add header resolution and apiKey reading:

```ts
const storageKey = options.apiKeyStorageKey ?? 'agent-overlay-api-key'
const storedApiKey = options.provider.requiresApiKey
  ? localStorage.getItem(storageKey) ?? undefined
  : undefined

// Check if key is required but missing
if (options.provider.requiresApiKey && !storedApiKey) {
  promptInput.openSettings('Please enter your API key to continue.')
  promptInput.setLoading(false)
  return
}

const resolvedHeaders = await resolveHeaders(options.provider)

// Then pass to analyze:
const rawResult = await options.provider.analyze(context, prompt, abortController.signal, {
  model: promptInput.getSelectedModel(),
  additionalSystemPrompt: additionalSystemPrompt || undefined,
  apiKey: storedApiKey,
  headers: resolvedHeaders,
})
```

**3d. Handle auth errors (401/403):**

In the catch block, add auth error detection:

```ts
catch (err) {
  if ((err as Error).name !== 'AbortError') {
    const message = err instanceof Error ? err.message : String(err)
    const isAuthError = /\b(401|403)\b/.test(message)

    if (isAuthError && options.provider.requiresApiKey) {
      promptInput.setLoading(false)
      promptInput.openSettings('Invalid API key. Please check your key in Settings.')
    } else {
      promptInput.setLoading(false)
      promptInput.showError(message)
    }
    emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
  }
}
```

**3e. Add `openSettings` method to PromptInput:**

In `src/core/ui/prompt-input.ts`, add a public method:

```ts
openSettings(message?: string): void {
  if (!this.settingsPanel) return
  this.settingsPanel.open()
  if (message) {
    this.settingsPanel.showMessage(message)
  }
}
```

- [ ] **Step 4: Run agent-overlay tests**

Run: `pnpm test -- src/core/agent-overlay.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts src/core/ui/prompt-input.ts
git commit -m "feat: wire BYOK apiKey and provider headers resolution in overlay"
```

---

### Task 6: README Update

**Files:**
- Modify: `README.md`

**Context:** Update documentation to cover BYOK, custom provider auth headers, and security recommendations.

- [ ] **Step 1: Update Providers section — show apiKey as optional**

In the Anthropic and OpenAI examples, show both modes:

```ts
// Dev mode — hardcoded key (local development only)
const provider = createAnthropicProvider({
  apiKey: 'sk-ant-...',
  availableModels: [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }],
})

// BYOK mode — end-users enter their own key via Settings UI
const provider = createAnthropicProvider({
  availableModels: [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }],
})
```

- [ ] **Step 2: Update Custom Provider section**

Show `options.apiKey` and `options.headers` usage:

```ts
// Custom provider with auth headers
const myProvider: LLMProvider = {
  headers: async () => ({
    Authorization: `Bearer ${await getSessionToken()}`,
  }),
  async analyze(context, prompt, signal?, options?) {
    return fetch('/api/analyze', {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify({ context, prompt }),
      signal,
    }).then(r => r.json())
  },
}

// Custom provider with BYOK
const byokProvider: LLMProvider = {
  requiresApiKey: true,
  async analyze(context, prompt, signal?, options?) {
    return fetch('https://my-api.com/v1/chat', {
      headers: { Authorization: `Bearer ${options?.apiKey}` },
      body: JSON.stringify({ context, prompt }),
      signal,
    }).then(r => r.json())
  },
}
```

- [ ] **Step 3: Update Security section**

Replace the existing Security section with expanded content covering:
- BYOK mode: each user enters their own key, stored in localStorage
- Settings UI: gear icon in prompt input, only for BYOK providers
- localStorage XSS risk + CSP recommendation
- Custom provider with backend proxy for maximum security (existing pattern)

- [ ] **Step 4: Update API Reference**

Add to the Options & Presets table:
- `apiKeyStorageKey` option

Add to the `AnalysisResult` / types section:
- `LLMProvider.requiresApiKey` — shows settings UI when true
- `LLMProvider.headers` — static or async auth headers
- `AnalyzeOptions.apiKey` — BYOK key from settings UI
- `AnalyzeOptions.headers` — resolved auth headers

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add BYOK and custom provider auth documentation"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full check suite**

Run: `pnpm check`
Expected: lint + format:check + typecheck ALL PASS

- [ ] **Step 2: Run tests with coverage**

Run: `pnpm test:coverage`
Expected: ALL PASS, coverage ≥ 80%

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: PASS — ESM + CJS output

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev`
- Open browser, select a range on chart
- Verify gear icon appears in toolbar (when using provider without apiKey)
- Click gear → settings panel opens
- Enter API key → Save → panel closes
- Submit analysis → should work with stored key
- Verify gear icon does NOT appear when provider has hardcoded apiKey
