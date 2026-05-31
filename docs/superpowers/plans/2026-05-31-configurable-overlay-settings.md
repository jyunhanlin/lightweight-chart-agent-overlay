# Configurable Overlay Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make system prompt (persona), temperature, and max tokens configurable through a single precedence chain — construction-time provider defaults that the end-user can override at runtime via the settings panel.

**Architecture:** Split the system prompt into an editable persona (`DEFAULT_PERSONA`) and a library-owned overlay contract (`OVERLAY_CONTRACT`) that providers always auto-inject. Add a `SettingsStore` (localStorage, parallel to the API-key entry). `agent-overlay` folds stored settings into `AnalyzeOptions` at the same point it already reads the API key. The settings panel grows three fields and the gear becomes always-visible (decoupled from BYOK).

**Tech Stack:** TypeScript, vitest (jsdom, `globals: true`), oxlint/oxfmt, tsdown, pnpm. Tests are colocated (`foo.ts` ↔ `foo.test.ts`).

**Spec:** `docs/superpowers/specs/2026-05-31-configurable-overlay-settings-design.md`

---

## Conventions for this plan

- Single-file test run: `pnpm vitest run <path>`. Single test by name: `pnpm vitest run <path> -t "<name>"`.
- Final gate before any push: `pnpm check` (lint + format:check + typecheck) and `pnpm test`.
- **GPG note (this sandbox only):** the gpg-agent is unreachable here. If `git commit` fails with a gpg signing error, run the same commit with `git -c commit.gpgsign=false commit -m "…"`. On a normal machine, plain `git commit` is fine.
- Commit messages follow Conventional Commits (the repo's existing style: `feat:`, `test:`, `refactor:`, `docs:`).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/providers/default-system-prompt.ts` | Persona + overlay-contract constants | Modify (split) |
| `src/providers/default-system-prompt.test.ts` | Constant-split invariants | Create |
| `src/core/types.ts` | `AnalyzeOptions` + `AgentOverlayOptions` additions | Modify |
| `src/core/settings-store.ts` | localStorage-backed `OverlaySettings` store | Create |
| `src/core/settings-store.test.ts` | Store behavior | Create |
| `src/providers/anthropic.ts` | temperature, contract injection, persona override, runtime overrides | Modify |
| `src/providers/anthropic.test.ts` | New composition/sampling tests | Modify |
| `src/providers/openai.ts` | Same as anthropic (keeps `baseURL`) | Modify |
| `src/providers/openai.test.ts` | New composition/sampling tests | Modify |
| `src/core/ui/settings-panel.ts` | Three new fields, Reset, API-key gating, save-all | Modify (rewrite) |
| `src/core/ui/settings-panel.test.ts` | New field tests + updated save test | Modify |
| `src/core/ui/chat-input.ts` | Always-render gear, thread `SettingsStore`, guard auto-open | Modify |
| `src/core/ui/chat-input.test.ts` | Update gating-based tests | Modify |
| `src/core/ui/chat-panel.ts` | Thread `SettingsStore` to `ChatInput` | Modify |
| `src/core/agent-overlay.ts` | Create `SettingsStore`, fold settings into `AnalyzeOptions` | Modify |
| `src/core/agent-overlay.test.ts` | Settings-folding test | Modify |
| `src/index.ts` | Export `DEFAULT_PERSONA`, `OVERLAY_CONTRACT`, `OverlaySettings` | Modify |
| `README.md` | Document new options/fields/precedence + migration note | Modify |
| `.changeset/configurable-overlay-settings.md` | Release note (minor) | Create |

---

## Task 1: Split the system-prompt constant

**Files:**
- Modify: `src/providers/default-system-prompt.ts`
- Test: `src/providers/default-system-prompt.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/providers/default-system-prompt.test.ts`:

```ts
// src/providers/default-system-prompt.test.ts
import { DEFAULT_PERSONA, OVERLAY_CONTRACT, DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'

describe('default-system-prompt constants', () => {
  it('persona describes the analyst and contains no JSON fence', () => {
    expect(DEFAULT_PERSONA).toContain('financial chart analyst')
    expect(DEFAULT_PERSONA).not.toContain('```json')
  })

  it('overlay contract owns the JSON fence and overlay keys', () => {
    expect(OVERLAY_CONTRACT).toContain('```json')
    expect(OVERLAY_CONTRACT).toContain('priceLines')
    expect(OVERLAY_CONTRACT).toContain('markers')
    expect(OVERLAY_CONTRACT).toContain('Never put text after the JSON block.')
  })

  it('DEFAULT_SYSTEM_PROMPT equals persona + contract joined by a blank line', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBe(`${DEFAULT_PERSONA}\n\n${OVERLAY_CONTRACT}`)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/providers/default-system-prompt.test.ts`
Expected: FAIL — `DEFAULT_PERSONA`/`OVERLAY_CONTRACT` are not exported yet.

- [ ] **Step 3: Rewrite the constant file**

Replace the entire contents of `src/providers/default-system-prompt.ts` with:

```ts
// src/providers/default-system-prompt.ts

/** The analyst persona. End-users may override this; it carries no output contract. */
export const DEFAULT_PERSONA = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

Write your analysis in **Markdown**. Use headings, bold, lists, and short paragraphs for readability. Keep it concise and actionable.`

/** Library-owned output contract. Auto-injected by providers so overlays never break. */
export const OVERLAY_CONTRACT = `After your analysis, end with a \`\`\`json code block containing chart overlay data:

\`\`\`json
{
  "priceLines": [{ "price": number, "title": "string", "color": "#hex", "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": unix_timestamp, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": "string", "color": "#hex" }]
}
\`\`\`

Use empty arrays if no overlays are needed. Never put text after the JSON block.`

/** Persona + contract. Retained for reference/backward-compat (equals the pre-split prompt). */
export const DEFAULT_SYSTEM_PROMPT = `${DEFAULT_PERSONA}\n\n${OVERLAY_CONTRACT}`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/providers/default-system-prompt.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/providers/default-system-prompt.ts src/providers/default-system-prompt.test.ts
git commit -m "refactor: split system prompt into persona + overlay contract"
```

---

## Task 2: Extend public types

**Files:**
- Modify: `src/core/types.ts:74-80` (`AnalyzeOptions`), `src/core/types.ts:157-164` (`AgentOverlayOptions`)

> This task is pure additive type surface (no runtime behavior), so it is verified by `pnpm typecheck` rather than a red/green test. The fields are exercised by tests in Tasks 4, 5, and 8.

- [ ] **Step 1: Add fields to `AnalyzeOptions`**

In `src/core/types.ts`, replace the `AnalyzeOptions` interface with:

```ts
export interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly chatMessages?: readonly ChatMessage[]
  readonly systemPrompt?: string // persona override (replaces the base persona, does not append)
  readonly temperature?: number // runtime sampling override
  readonly maxTokens?: number // runtime response-length override
}
```

- [ ] **Step 2: Add `settingsStorageKey` to `AgentOverlayOptions`**

In `src/core/types.ts`, replace the `AgentOverlayOptions` interface with:

```ts
export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly theme?: 'light' | 'dark'
  readonly dataAccessor?: DataAccessor
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly apiKeyStorageKey?: string
  readonly settingsStorageKey?: string // localStorage key for OverlaySettings (default 'agent-overlay-settings')
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add systemPrompt/temperature/maxTokens to AnalyzeOptions and settingsStorageKey"
```

---

## Task 3: SettingsStore

**Files:**
- Create: `src/core/settings-store.ts`
- Test: `src/core/settings-store.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/core/settings-store.test.ts`:

```ts
// src/core/settings-store.test.ts
import { createSettingsStore } from './settings-store'

const KEY = 'test-settings'

describe('createSettingsStore', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('get() returns {} when nothing is stored', () => {
    expect(createSettingsStore(KEY).get()).toEqual({})
  })

  it('get() returns {} on corrupt JSON', () => {
    localStorage.setItem(KEY, 'not-json{')
    expect(createSettingsStore(KEY).get()).toEqual({})
  })

  it('set() persists and get() returns the value', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'hello', temperature: 0.5, maxTokens: 1000 })
    expect(createSettingsStore(KEY).get()).toEqual({
      systemPrompt: 'hello',
      temperature: 0.5,
      maxTokens: 1000,
    })
  })

  it('set() merges with existing values', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 0.5 })
    store.set({ maxTokens: 2000 })
    expect(store.get()).toEqual({ temperature: 0.5, maxTokens: 2000 })
  })

  it('set() clamps temperature to [0, 1]', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 5 })
    expect(store.get().temperature).toBe(1)
    store.set({ temperature: -3 })
    expect(store.get().temperature).toBe(0)
  })

  it('set() coerces maxTokens to a positive integer and ignores invalid', () => {
    const store = createSettingsStore(KEY)
    store.set({ maxTokens: 100.7 })
    expect(store.get().maxTokens).toBe(100)
    store.set({ maxTokens: -5 })
    expect(store.get().maxTokens).toBeUndefined()
  })

  it('set() treats empty-string systemPrompt as unset', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'x' })
    store.set({ systemPrompt: '   ' })
    expect(store.get().systemPrompt).toBeUndefined()
  })

  it('set() with undefined deletes a field', () => {
    const store = createSettingsStore(KEY)
    store.set({ temperature: 0.5 })
    store.set({ temperature: undefined })
    expect(store.get().temperature).toBeUndefined()
  })

  it('reset() removes a single field, leaving others', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'p', temperature: 0.5 })
    store.reset('temperature')
    expect(store.get()).toEqual({ systemPrompt: 'p' })
  })

  it('clear() removes the whole blob', () => {
    const store = createSettingsStore(KEY)
    store.set({ systemPrompt: 'p' })
    store.clear()
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(store.get()).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/settings-store.test.ts`
Expected: FAIL — `createSettingsStore` does not exist.

- [ ] **Step 3: Implement the store**

Create `src/core/settings-store.ts`:

```ts
// src/core/settings-store.ts

export interface OverlaySettings {
  readonly systemPrompt?: string
  readonly temperature?: number
  readonly maxTokens?: number
}

export interface SettingsStore {
  get(): OverlaySettings
  set(partial: Partial<OverlaySettings>): void
  reset(field: keyof OverlaySettings): void
  clear(): void
}

const DEFAULT_STORAGE_KEY = 'agent-overlay-settings'

export function createSettingsStore(storageKey = DEFAULT_STORAGE_KEY): SettingsStore {
  function read(): Record<string, unknown> {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch {
      return {}
    }
  }

  function persist(next: OverlaySettings): void {
    if (Object.keys(next).length === 0) {
      localStorage.removeItem(storageKey)
    } else {
      localStorage.setItem(storageKey, JSON.stringify(next))
    }
  }

  const store: SettingsStore = {
    get(): OverlaySettings {
      const raw = read()
      const out: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {}
      if (typeof raw.systemPrompt === 'string') out.systemPrompt = raw.systemPrompt
      if (typeof raw.temperature === 'number') out.temperature = raw.temperature
      if (typeof raw.maxTokens === 'number') out.maxTokens = raw.maxTokens
      return out
    },

    set(partial: Partial<OverlaySettings>): void {
      const next: { systemPrompt?: string; temperature?: number; maxTokens?: number } = {
        ...store.get(),
      }

      if ('systemPrompt' in partial) {
        const v = partial.systemPrompt
        const s = typeof v === 'string' ? v.trim() : ''
        if (s === '') delete next.systemPrompt
        else next.systemPrompt = s
      }

      if ('temperature' in partial) {
        const n = Number(partial.temperature)
        if (partial.temperature === undefined || !Number.isFinite(n)) delete next.temperature
        else next.temperature = Math.min(1, Math.max(0, n))
      }

      if ('maxTokens' in partial) {
        const n = Math.floor(Number(partial.maxTokens))
        if (partial.maxTokens === undefined || !Number.isFinite(n) || n <= 0) delete next.maxTokens
        else next.maxTokens = n
      }

      persist(next)
    },

    reset(field: keyof OverlaySettings): void {
      const next = { ...store.get() }
      delete next[field]
      persist(next)
    },

    clear(): void {
      localStorage.removeItem(storageKey)
    },
  }

  return store
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/settings-store.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/settings-store.ts src/core/settings-store.test.ts
git commit -m "feat: add SettingsStore for persisted overlay settings"
```

---

## Task 4: Anthropic provider — persona/contract composition + sampling overrides

**Files:**
- Modify: `src/providers/anthropic.ts`
- Test: `src/providers/anthropic.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe('createAnthropicProvider', …)` block in `src/providers/anthropic.test.ts`. (The file already defines `MOCK_CONTEXT` and `MODELS`.)

```ts
  // ── Settings: persona / contract / sampling ──
  function mockOnce() {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ content: [{ text: 'x' }] }) })
  }
  function lastBody() {
    return JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
  }

  it('composes persona + overlay contract by default', async () => {
    mockOnce()
    const provider = createAnthropicProvider({ apiKey: 'k', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'q')
    expect(lastBody().system).toContain('financial chart analyst')
    expect(lastBody().system).toContain('```json')
  })

  it('omits the overlay contract when injectOverlayContract is false', async () => {
    mockOnce()
    const provider = createAnthropicProvider({
      apiKey: 'k',
      availableModels: MODELS,
      injectOverlayContract: false,
    })
    await provider.analyze(MOCK_CONTEXT, 'q')
    expect(lastBody().system).not.toContain('```json')
  })

  it('uses analyzeOptions.systemPrompt as a persona override but keeps the contract', async () => {
    mockOnce()
    const provider = createAnthropicProvider({ apiKey: 'k', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'q', undefined, { systemPrompt: 'CUSTOM PERSONA' })
    const sys = lastBody().system
    expect(sys).toContain('CUSTOM PERSONA')
    expect(sys).not.toContain('financial chart analyst')
    expect(sys).toContain('```json')
  })

  it('appends additionalSystemPrompt between persona and contract', async () => {
    mockOnce()
    const provider = createAnthropicProvider({ apiKey: 'k', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'q', undefined, { additionalSystemPrompt: 'EXTRA RULE' })
    const sys: string = lastBody().system
    expect(sys.indexOf('EXTRA RULE')).toBeGreaterThan(sys.indexOf('financial chart analyst'))
    expect(sys.indexOf('EXTRA RULE')).toBeLessThan(sys.indexOf('```json'))
  })

  it('includes temperature only when set (construction or analyzeOptions)', async () => {
    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS }).analyze(MOCK_CONTEXT, 'q')
    expect(lastBody().temperature).toBeUndefined()

    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS, temperature: 0.3 }).analyze(
      MOCK_CONTEXT,
      'q',
    )
    expect(lastBody().temperature).toBe(0.3)

    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS, temperature: 0.3 }).analyze(
      MOCK_CONTEXT,
      'q',
      undefined,
      { temperature: 0.9 },
    )
    expect(lastBody().temperature).toBe(0.9)
  })

  it('maxTokens precedence: analyzeOptions > construction > 8192', async () => {
    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS }).analyze(MOCK_CONTEXT, 'q')
    expect(lastBody().max_tokens).toBe(8192)

    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS, maxTokens: 1000 }).analyze(
      MOCK_CONTEXT,
      'q',
    )
    expect(lastBody().max_tokens).toBe(1000)

    mockOnce()
    await createAnthropicProvider({ apiKey: 'k', availableModels: MODELS, maxTokens: 1000 }).analyze(
      MOCK_CONTEXT,
      'q',
      undefined,
      { maxTokens: 500 },
    )
    expect(lastBody().max_tokens).toBe(500)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/providers/anthropic.test.ts`
Expected: FAIL — contract not separated, no temperature in body, persona override unsupported.

- [ ] **Step 3a: Update the import**

In `src/providers/anthropic.ts`, change line 12 from:

```ts
import { DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'
```

to:

```ts
import { DEFAULT_PERSONA, OVERLAY_CONTRACT } from './default-system-prompt'
```

- [ ] **Step 3b: Extend the options interface**

Replace the `AnthropicProviderOptions` interface with:

```ts
interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string // persona (defaults to DEFAULT_PERSONA); contract is auto-injected
  readonly maxTokens?: number
  readonly temperature?: number
  readonly injectOverlayContract?: boolean // default true
  readonly availableModels: readonly ModelOption[]
}
```

- [ ] **Step 3c: Replace the closure constants and add a compose helper**

Replace these lines near the top of `createAnthropicProvider`:

```ts
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const maxTokens = options.maxTokens ?? 8192
```

with:

```ts
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const persona = options.systemPrompt ?? DEFAULT_PERSONA
  const maxTokens = options.maxTokens ?? 8192
  const temperature = options.temperature
  const injectOverlayContract = options.injectOverlayContract ?? true

  function composeSystemPrompt(analyzeOptions?: AnalyzeOptions): string {
    return [
      analyzeOptions?.systemPrompt ?? persona,
      analyzeOptions?.additionalSystemPrompt,
      injectOverlayContract ? OVERLAY_CONTRACT : undefined,
    ]
      .filter(Boolean)
      .join('\n\n')
  }
```

- [ ] **Step 3d: Update the `analyze` body**

In `analyze`, replace:

```ts
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
        ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
        : systemPrompt
```

with:

```ts
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = composeSystemPrompt(analyzeOptions)
      const requestMaxTokens = analyzeOptions?.maxTokens ?? maxTokens
      const requestTemperature = analyzeOptions?.temperature ?? temperature
```

Then replace the `body: JSON.stringify({...})` in `analyze` with:

```ts
        body: JSON.stringify({
          model: requestModel,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
          system: finalSystemPrompt,
          messages,
        }),
```

- [ ] **Step 3e: Update the `analyzeStream` body**

In `analyzeStream`, replace the identical `finalSystemPrompt` block with:

```ts
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = composeSystemPrompt(analyzeOptions)
      const requestMaxTokens = analyzeOptions?.maxTokens ?? maxTokens
      const requestTemperature = analyzeOptions?.temperature ?? temperature
```

Then replace the streaming `body: JSON.stringify({...})` with:

```ts
        body: JSON.stringify({
          model: requestModel,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
          system: finalSystemPrompt,
          messages,
          stream: true,
        }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/providers/anthropic.test.ts`
Expected: PASS (all existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic.ts src/providers/anthropic.test.ts
git commit -m "feat: anthropic provider supports persona override, contract injection, temperature"
```

---

## Task 5: OpenAI provider — symmetric changes

**Files:**
- Modify: `src/providers/openai.ts`
- Test: `src/providers/openai.test.ts`

> OpenAI puts the system prompt in `messages[0].content` (not a top-level `system` field). Assertions target `body.messages[0].content`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe` block in `src/providers/openai.test.ts`. (Mirror the helpers below; OpenAI's mock returns a `choices` shape.)

```ts
  // ── Settings: persona / contract / sampling ──
  function mockOnceOAI() {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'x' } }] }),
    })
  }
  function lastBodyOAI() {
    return JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
  }
  function systemContent() {
    return lastBodyOAI().messages[0].content as string
  }

  it('composes persona + overlay contract by default', async () => {
    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS }).analyze(MOCK_CONTEXT, 'q')
    expect(systemContent()).toContain('financial chart analyst')
    expect(systemContent()).toContain('```json')
  })

  it('omits the overlay contract when injectOverlayContract is false', async () => {
    mockOnceOAI()
    await createOpenAIProvider({
      apiKey: 'k',
      availableModels: MODELS,
      injectOverlayContract: false,
    }).analyze(MOCK_CONTEXT, 'q')
    expect(systemContent()).not.toContain('```json')
  })

  it('uses analyzeOptions.systemPrompt as a persona override but keeps the contract', async () => {
    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS }).analyze(
      MOCK_CONTEXT,
      'q',
      undefined,
      { systemPrompt: 'CUSTOM PERSONA' },
    )
    expect(systemContent()).toContain('CUSTOM PERSONA')
    expect(systemContent()).not.toContain('financial chart analyst')
    expect(systemContent()).toContain('```json')
  })

  it('includes temperature only when set', async () => {
    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS }).analyze(MOCK_CONTEXT, 'q')
    expect(lastBodyOAI().temperature).toBeUndefined()

    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS, temperature: 0.2 }).analyze(
      MOCK_CONTEXT,
      'q',
    )
    expect(lastBodyOAI().temperature).toBe(0.2)
  })

  it('maxTokens precedence: analyzeOptions > construction > 8192', async () => {
    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS }).analyze(MOCK_CONTEXT, 'q')
    expect(lastBodyOAI().max_tokens).toBe(8192)

    mockOnceOAI()
    await createOpenAIProvider({ apiKey: 'k', availableModels: MODELS, maxTokens: 700 }).analyze(
      MOCK_CONTEXT,
      'q',
      undefined,
      { maxTokens: 250 },
    )
    expect(lastBodyOAI().max_tokens).toBe(250)
  })
```

> If `MOCK_CONTEXT` / `MODELS` are named differently in `openai.test.ts`, reuse that file's existing fixtures instead of redefining them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/providers/openai.test.ts`
Expected: FAIL.

- [ ] **Step 3a: Update the import**

Change line 12 of `src/providers/openai.ts` from `import { DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'` to:

```ts
import { DEFAULT_PERSONA, OVERLAY_CONTRACT } from './default-system-prompt'
```

- [ ] **Step 3b: Extend the options interface**

Replace `OpenAIProviderOptions` with:

```ts
interface OpenAIProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string // persona (defaults to DEFAULT_PERSONA); contract is auto-injected
  readonly baseURL?: string
  readonly maxTokens?: number
  readonly temperature?: number
  readonly injectOverlayContract?: boolean // default true
  readonly availableModels: readonly ModelOption[]
}
```

- [ ] **Step 3c: Replace the closure constants and add a compose helper**

Replace:

```ts
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL
  const maxTokens = options.maxTokens ?? 8192
```

with:

```ts
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const persona = options.systemPrompt ?? DEFAULT_PERSONA
  const baseURL = options.baseURL ?? API_URL
  const maxTokens = options.maxTokens ?? 8192
  const temperature = options.temperature
  const injectOverlayContract = options.injectOverlayContract ?? true

  function composeSystemPrompt(analyzeOptions?: AnalyzeOptions): string {
    return [
      analyzeOptions?.systemPrompt ?? persona,
      analyzeOptions?.additionalSystemPrompt,
      injectOverlayContract ? OVERLAY_CONTRACT : undefined,
    ]
      .filter(Boolean)
      .join('\n\n')
  }
```

- [ ] **Step 3d: Update both `analyze` and `analyzeStream`**

In **each** method, replace:

```ts
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
        ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
        : systemPrompt
```

with:

```ts
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = composeSystemPrompt(analyzeOptions)
      const requestMaxTokens = analyzeOptions?.maxTokens ?? maxTokens
      const requestTemperature = analyzeOptions?.temperature ?? temperature
```

In `analyze`, replace the body with:

```ts
        body: JSON.stringify({
          model: requestModel,
          messages,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
        }),
```

In `analyzeStream`, replace the body with:

```ts
        body: JSON.stringify({
          model: requestModel,
          messages,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
          stream: true,
        }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/providers/openai.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai.ts src/providers/openai.test.ts
git commit -m "feat: openai provider supports persona override, contract injection, temperature"
```

---

## Task 6: Settings panel — three fields, Reset, API-key gating, save-all

**Files:**
- Modify (rewrite): `src/core/ui/settings-panel.ts`
- Test: `src/core/ui/settings-panel.test.ts`

> **Design note on gating:** the API Key field renders unless `requiresApiKey === false`. Standalone unit tests pass `undefined` (→ rendered); `chat-input` always passes a strict boolean. The Save button is always enabled and persists both the API key (only if non-empty) and the settings fields.

- [ ] **Step 1: Write the failing tests**

Add these tests to `src/core/ui/settings-panel.test.ts`. Add this import at the top:

```ts
import { createSettingsStore } from '../settings-store'
import { DEFAULT_PERSONA } from '../../providers/default-system-prompt'
```

Add a new describe block (keep the existing one):

```ts
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
    ;(container.querySelector('[data-agent-overlay-settings-temperature]') as HTMLInputElement).value =
      '0.4'
    ;(container.querySelector('[data-agent-overlay-settings-max-tokens]') as HTMLInputElement).value =
      '1234'
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
      container.querySelector('[data-agent-overlay-settings-reset="temperature"]') as HTMLButtonElement
    ).click()
    expect(store.get().temperature).toBeUndefined()
    expect(
      (container.querySelector('[data-agent-overlay-settings-temperature]') as HTMLInputElement).value,
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
})
```

Then **delete** the now-obsolete test from the original describe block:

```ts
  it('Save button is disabled when input is empty', () => { … })
```

(Save is always enabled now; the new "Save is enabled even when the API key input is empty" test replaces it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/settings-panel.test.ts`
Expected: FAIL — new fields/attrs do not exist.

- [ ] **Step 3: Rewrite the settings panel**

Replace the entire contents of `src/core/ui/settings-panel.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/settings-panel.test.ts`
Expected: PASS (existing API-key tests + new field tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/settings-panel.ts src/core/ui/settings-panel.test.ts
git commit -m "feat: settings panel exposes system prompt, temperature, max tokens"
```

---

## Task 7: chat-input + chat-panel — always-render gear, thread SettingsStore

**Files:**
- Modify: `src/core/ui/chat-input.ts`, `src/core/ui/chat-panel.ts`
- Test: `src/core/ui/chat-input.test.ts`

- [ ] **Step 1: Update / add the failing tests**

In `src/core/ui/chat-input.test.ts`:

1. Add the import:

```ts
import { createSettingsStore } from '../settings-store'
```

2. **Replace** the existing test `openSettings() is a no-op when requiresApiKey is false` (around line 176) with:

```ts
  it('renders the settings gear even when requiresApiKey is false', () => {
    const input = new ChatInput(container, { settingsStore: createSettingsStore('t-settings') })
    expect(container.querySelector('[data-agent-overlay-settings-trigger]')).not.toBeNull()
    input.destroy()
    localStorage.clear()
  })

  it('openSettings() opens the panel when requiresApiKey is false but a settingsStore exists', () => {
    const input = new ChatInput(container, { settingsStore: createSettingsStore('t-settings') })
    input.openSettings()
    expect(container.querySelector('[data-agent-overlay-settings]')).not.toBeNull()
    input.destroy()
    localStorage.clear()
  })
```

3. Add a guard test:

```ts
  it('does not auto-open settings when requiresApiKey is false and no key', () => {
    const input = new ChatInput(container, { settingsStore: createSettingsStore('t-settings') })
    expect(container.querySelector('[data-agent-overlay-settings]')).toBeNull()
    input.destroy()
    localStorage.clear()
  })
```

> Review the rest of `chat-input.test.ts` for any other assertion that depends on the gear being absent when `requiresApiKey` is false, and update it to match the always-render behavior.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/chat-input.test.ts`
Expected: FAIL — `settingsStore` option unknown; gear still gated.

- [ ] **Step 3a: Extend `ChatInputOptions` and store the field**

In `src/core/ui/chat-input.ts`, update the import block and options:

```ts
import type { ModelOption, AnalysisPreset } from '../types'
import type { SettingsStore } from '../settings-store'
import { Dropdown } from './dropdown'
import { DropdownManager } from './dropdown-manager'
import { SettingsPanel } from './settings-panel'
```

```ts
export interface ChatInputOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
  readonly settingsStore?: SettingsStore
}
```

Add a private field and assign it in the constructor (next to the other `this.x = options?.x` lines):

```ts
  private readonly settingsStore: SettingsStore | undefined
```

```ts
    this.settingsStore = options?.settingsStore
```

- [ ] **Step 3b: Always build the gear + panel**

In `buildToolbar()`, replace the entire `if (this.requiresApiKey) { … }` block (lines ~160-181) with:

```ts
    // Settings gear (far left) — always available
    {
      const gearBtn = document.createElement('button')
      gearBtn.setAttribute('data-agent-overlay-settings-trigger', '')
      gearBtn.textContent = '⚙'
      gearBtn.style.cssText = `
        background: transparent; border: none; color: var(--ao-hint);
        font-size: 16px; cursor: pointer; padding: 0;
        font-family: inherit; flex-shrink: 0;
      `

      this.settingsPanel = new SettingsPanel(this.containerEl, {
        storageKey: this.apiKeyStorageKey,
        settingsStore: this.settingsStore,
        requiresApiKey: this.requiresApiKey,
        manager: this.dropdownManager,
      })
      this.dropdownManager.register(this.settingsPanel)

      gearBtn.addEventListener('click', () => {
        this.settingsPanel?.open()
      })
      toolbar.appendChild(gearBtn)
    }
```

- [ ] **Step 3c: Guard the auto-open to BYOK only**

In the constructor, replace the auto-open block (lines ~108-112):

```ts
    // Auto-open settings if BYOK key is missing
    if (this.settingsPanel && !this.settingsPanel.getApiKey()) {
      this.settingsPanel.open()
      this.settingsPanel.showMessage('Please set your API key to get started.')
    }
```

with:

```ts
    // Auto-open settings only for BYOK when the key is missing
    if (this.requiresApiKey && this.settingsPanel && !this.settingsPanel.getApiKey()) {
      this.settingsPanel.open()
      this.settingsPanel.showMessage('Please set your API key to get started.')
    }
```

- [ ] **Step 3d: Thread `settingsStore` through `ChatPanel`**

In `src/core/ui/chat-panel.ts`:

Add the import:

```ts
import type { SettingsStore } from '../settings-store'
```

Extend `ChatPanelOptions`:

```ts
export interface ChatPanelOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
  readonly settingsStore?: SettingsStore
}
```

In the `new ChatInput(...)` call (around line 508), add the option:

```ts
    const chatInput = new ChatInput(chatInputContainer, {
      availableModels: this.options.availableModels,
      presets: this.options.presets,
      requiresApiKey: this.options.requiresApiKey,
      apiKeyStorageKey: this.options.apiKeyStorageKey,
      settingsStore: this.options.settingsStore,
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/chat-input.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/chat-input.ts src/core/ui/chat-input.test.ts src/core/ui/chat-panel.ts
git commit -m "feat: settings gear always available, thread SettingsStore through panel"
```

---

## Task 8: agent-overlay — create SettingsStore and fold settings into AnalyzeOptions

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Test: `src/core/agent-overlay.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the `describe('Provider auth — apiKey and headers', …)` block (or a new `describe('Settings', …)`) in `src/core/agent-overlay.test.ts`, mirroring the existing `mock.calls[0][3]` pattern:

```ts
    it('folds stored settings into analyzeOptions', async () => {
      localStorage.setItem(
        'agent-overlay-settings',
        JSON.stringify({ systemPrompt: 'P', temperature: 0.4, maxTokens: 500 }),
      )
      const { chart, el } = createMockChart()
      const series = createMockSeries()
      const provider: LLMProvider = {
        analyze: vi.fn().mockResolvedValue({ explanation: 'test' }),
      }
      const agent = createAgentOverlay(chart as never, series as never, { provider })
      selectAndSubmit(agent, el, 'test question')
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      const options = (provider.analyze as any).mock.calls[0][3]
      expect(options.systemPrompt).toBe('P')
      expect(options.temperature).toBe(0.4)
      expect(options.maxTokens).toBe(500)
      agent.destroy()
      localStorage.clear()
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/agent-overlay.test.ts -t "folds stored settings"`
Expected: FAIL — `options.systemPrompt`/`temperature`/`maxTokens` are `undefined`.

- [ ] **Step 3a: Import and create the store**

In `src/core/agent-overlay.ts`, add the import near the other core imports:

```ts
import { createSettingsStore } from './settings-store'
```

In `createAgentOverlay`, create the store next to `historyStore` (around line 77):

```ts
  const settingsStore = createSettingsStore(options.settingsStorageKey)
```

- [ ] **Step 3b: Pass the store to ChatPanel**

In the `new ChatPanel(chartEl, { … })` call (around line 81), add:

```ts
  const chatPanel = new ChatPanel(chartEl, {
    availableModels: options.provider.availableModels,
    presets,
    requiresApiKey: options.provider.requiresApiKey,
    apiKeyStorageKey: options.apiKeyStorageKey,
    settingsStore,
  })
```

- [ ] **Step 3c: Fold settings into `AnalyzeOptions`**

In `runAnalysis`, locate the `const analyzeOptions: AnalyzeOptions = { … }` block (around line 188) and update it to read the store:

```ts
      const settings = settingsStore.get()
      const analyzeOptions: AnalyzeOptions = {
        model: selectedModel,
        additionalSystemPrompt: additionalSystemPrompt || undefined,
        apiKey: storedApiKey,
        headers: resolvedHeaders,
        chatMessages,
        systemPrompt: settings.systemPrompt,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/core/agent-overlay.test.ts -t "folds stored settings"`
Expected: PASS.

- [ ] **Step 5: Run the full agent-overlay suite (regression)**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: PASS (all existing tests + new one).

- [ ] **Step 6: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: fold persisted settings into AnalyzeOptions on each analysis"
```

---

## Task 9: Public exports, README, changeset

**Files:**
- Modify: `src/index.ts`, `README.md`
- Create: `.changeset/configurable-overlay-settings.md`

- [ ] **Step 1: Export the new public surface**

In `src/index.ts`, add after the existing `export` lines (before the `export type {…}` block):

```ts
export {
  DEFAULT_PERSONA,
  OVERLAY_CONTRACT,
  DEFAULT_SYSTEM_PROMPT,
} from './providers/default-system-prompt'
```

And add `OverlaySettings` to a type export. Append a new type re-export line:

```ts
export type { OverlaySettings } from './core/settings-store'
```

- [ ] **Step 2: Verify the build and types**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm build`
Expected: succeeds; `dist/` contains the new exports.

- [ ] **Step 3: Update README**

In `README.md`, make these documentation edits (match the file's existing section structure):

1. In the built-in provider options docs, add `temperature?: number` and `injectOverlayContract?: boolean` to the Anthropic/OpenAI option tables, and clarify that `systemPrompt` is now the **persona** (the JSON overlay contract is auto-injected).
2. Add a **Settings** subsection describing the three runtime-configurable fields (System Prompt / Temperature / Max Tokens), the precedence chain (`runtime override → build-time default → built-in default`), the `settingsStorageKey` option, and that the gear is always available.
3. Add a **Migration note**: `systemPrompt` is now the persona and the contract is appended automatically; developers who previously embedded their own JSON contract in `systemPrompt` should pass `injectOverlayContract: false` to avoid a duplicated contract.

- [ ] **Step 4: Create the changeset**

Create `.changeset/configurable-overlay-settings.md`:

```md
---
"lightweight-chart-agent-overlay": minor
---

Add configurable overlay settings: end-users can now override the analyst **system prompt (persona)**, **temperature**, and **max tokens** at runtime via the settings panel (persisted to localStorage), while developers set defaults through provider options (`systemPrompt`, `temperature`, `maxTokens`). The settings gear is now always available, not just in BYOK mode.

The system prompt is split into an editable persona and a library-owned overlay contract that providers auto-inject (`injectOverlayContract`, default `true`), so editing the persona never breaks overlay rendering.

**Migration (minor breaking):** the provider `systemPrompt` option now means the *persona* and the JSON overlay contract is appended automatically. If you previously passed a full prompt that already included your own JSON contract, set `injectOverlayContract: false` to avoid a duplicated contract.
```

- [ ] **Step 5: Final full verification**

Run: `pnpm check`
Expected: lint + format:check + typecheck all pass. (If `format:check` flags files, run `pnpm format` and re-stage.)

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts README.md .changeset/configurable-overlay-settings.md
git commit -m "docs: export settings API, document configurable settings, add changeset"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- §1 precedence model → Tasks 4/5 (provider `?? construction ?? builtin`) + Task 8 (runtime fold). ✅
- §2 data model & persistence → Task 3 (`SettingsStore`, validation, corrupt-JSON guard). ✅
- §3 system prompt split + composition order (persona → additional → contract) → Task 1 + Tasks 4/5 (`composeSystemPrompt`, tested for ordering). ✅
- §4 public API changes (`AnalyzeOptions`, provider options, `injectOverlayContract`, `settingsStorageKey`) → Task 2 + 4 + 5 + 9. ✅
- §5 settings panel UI (three fields, Reset, placeholders, save semantics, API-key gating) → Task 6. ✅
- §6 gear decoupled from BYOK, BYOK auto-open preserved → Task 7. ✅
- §7 provider request wiring (temperature only when defined, maxTokens precedence) → Tasks 4/5 tests. ✅
- §8 agent-overlay wiring, React hook unchanged → Task 8 (hook untouched). ✅
- Exports + README migration note → Task 9. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✅

**3. Type consistency:** `createSettingsStore`/`SettingsStore`/`OverlaySettings` consistent across Tasks 3, 6, 7, 8, 9. `composeSystemPrompt` named identically in Tasks 4 and 5. `injectOverlayContract`, `settingsStorageKey`, and the three `AnalyzeOptions` fields match across types (Task 2), providers (4/5), and fold (8). Data attributes (`data-agent-overlay-settings-system-prompt|temperature|max-tokens`, `data-agent-overlay-settings-reset="<key>"`) match between Task 6 implementation and its tests. ✅
