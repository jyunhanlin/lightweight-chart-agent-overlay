# Configurable Overlay Settings Design

## Problem

The settings panel today manages exactly one thing: the BYOK API key. Everything else that shapes an LLM call — the system prompt, sampling temperature, response length — is locked at construction time inside the provider, invisible and unchangeable to the end-user running the app.

Two gaps follow:

1. **Developers** can already set `systemPrompt`/`maxTokens` on the provider, but there is no `temperature`, and these defaults are scattered with no shared "settings" concept.
2. **End-users** cannot tune anything at runtime. A user who wants more conservative analysis, a longer response, or a different analyst persona has no way to express that.

This design makes **system prompt (persona)**, **temperature**, and **max tokens** configurable through a single precedence chain — construction-time defaults that the end-user can override at runtime via the settings panel.

## Goals

1. **Two audiences, one chain.** Developers set defaults at construction; end-users override at runtime. Precedence: `runtime override ?? build-time default ?? built-in default`.
2. **Editable persona without breaking overlays.** Users can rewrite the analyst persona, but the ` ```json ` overlay contract is library-owned and auto-injected, so overlays never silently break.
3. **Runtime-tunable sampling.** `temperature` and `maxTokens` configurable per the same chain.
4. **Backward compatible at the type level.** All new `AnalyzeOptions` fields are additive and optional.

## Non-Goals (YAGNI)

- Custom presets CRUD (add/edit/delete user presets)
- Output-language setting
- Editing API endpoint / `baseURL` from the panel
- Per-selection or per-turn settings (settings are global, like the API key)
- A programmatic `overlay.setSettings()` API or settings-change events

## Design

### 1. Precedence model

Three fields, one chain each. "Unset" at any layer falls through to the next.

| Field | Build-time default | Runtime override | Built-in fallback |
|---|---|---|---|
| **system prompt (persona)** | provider `systemPrompt` option | settings panel → localStorage | `DEFAULT_PERSONA` |
| **temperature** | provider `temperature` option (NEW) | settings panel → localStorage | omitted (API default) |
| **max tokens** | provider `maxTokens` option (exists) | settings panel → localStorage | `8192` |

The presets' `additionalSystemPrompt` is **orthogonal** to the persona override. Persona *replaces* the base; presets *append*. They stack: `persona + presetAdditional + contract`.

### 2. Data model & persistence

New file `src/core/settings-store.ts`, parallel in spirit to `history-store.ts`:

```ts
export interface OverlaySettings {
  readonly systemPrompt?: string
  readonly temperature?: number
  readonly maxTokens?: number
}

export class SettingsStore {
  constructor(storageKey?: string) // default 'agent-overlay-settings'
  get(): OverlaySettings           // parse blob from localStorage; {} if absent/corrupt
  set(partial: Partial<OverlaySettings>): void // merge + validate, then persist
  reset(field: keyof OverlaySettings): void     // delete one field, re-persist
  clear(): void                    // remove the whole blob
}
```

- Stored as a single JSON blob in localStorage under `settingsStorageKey` (default `agent-overlay-settings`), **separate** from the API-key entry.
- `set` validates: `temperature` clamped to `[0, 1]`; `maxTokens` coerced to a positive integer (ignored if not). An empty-string `systemPrompt` is treated as "unset" (deletes the field).
- A corrupt/unparseable blob is treated as empty (defensive `try/catch` around `JSON.parse`).

### 3. System prompt split (contract auto-injection)

`src/providers/default-system-prompt.ts` splits the single constant into a persona part (editable) and a contract part (library-owned):

```ts
export const DEFAULT_PERSONA = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

Write your analysis in **Markdown**. Use headings, bold, lists, and short paragraphs for readability. Keep it concise and actionable.`

export const OVERLAY_CONTRACT = `After your analysis, end with a \`\`\`json code block containing chart overlay data:

\`\`\`json
{
  "priceLines": [{ "price": number, "title": "string", "color": "#hex", "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": unix_timestamp, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": "string", "color": "#hex" }]
}
\`\`\`

Use empty arrays if no overlays are needed. Never put text after the JSON block.`

// Retained for reference / backward-compat; equals the old DEFAULT_SYSTEM_PROMPT.
export const DEFAULT_SYSTEM_PROMPT = `${DEFAULT_PERSONA}\n\n${OVERLAY_CONTRACT}`
```

Provider composition becomes:

```ts
const persona = analyzeOptions?.systemPrompt ?? constructionSystemPrompt ?? DEFAULT_PERSONA
const finalSystemPrompt = [
  persona,
  analyzeOptions?.additionalSystemPrompt,
  injectOverlayContract ? OVERLAY_CONTRACT : undefined,
].filter(Boolean).join('\n\n')
```

The contract is placed **last** — the output-format instruction is the final thing the model reads, maximizing adherence. However the user edits the persona, the contract survives, so overlays keep rendering.

### 4. Public API changes

#### `AnalyzeOptions` (additive, all optional → backward compatible)

```ts
interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly chatMessages?: readonly ChatMessage[]
  readonly systemPrompt?: string   // NEW — persona override (replaces base, not appends)
  readonly temperature?: number    // NEW — runtime override
  readonly maxTokens?: number       // NEW — runtime override
}
```

#### Provider options (`createAnthropicProvider`, `createOpenAIProvider`)

```ts
interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string             // now means: persona (defaults to DEFAULT_PERSONA)
  readonly maxTokens?: number
  readonly temperature?: number              // NEW
  readonly injectOverlayContract?: boolean   // NEW, default true
  readonly availableModels: readonly ModelOption[]
}
// OpenAIProviderOptions: identical additions; keeps its existing baseURL.
```

#### `AgentOverlayOptions`

```ts
interface AgentOverlayOptions {
  // ...existing...
  readonly settingsStorageKey?: string  // NEW — default 'agent-overlay-settings'
}
```

**Backward-compat note (minor breaking).** `systemPrompt` now means the *persona*, and the contract is auto-appended by default. A developer who previously passed a full prompt that already included their own JSON contract will get the contract appended a second time. The escape hatch is `injectOverlayContract: false`. The library is pre-1.0 (v0.3.x); this ships behind a Changeset documenting the migration.

### 5. Settings panel UI

Extend `src/core/ui/settings-panel.ts` with three fields below the existing API Key field:

```
┌───────────────────────────────┐
│ Settings                    × │
├───────────────────────────────┤
│ API Key            (BYOK only)│
│ ┌───────────────────────────┐ │
│ │ ••••••••••••••••          │ │
│ └───────────────────────────┘ │
│                               │
│ System Prompt        [Reset]  │
│ ┌───────────────────────────┐ │
│ │ (placeholder = persona)   │ │
│ │                           │ │
│ └───────────────────────────┘ │
│                               │
│ Temperature (0–1)    [Reset]  │
│ ┌─────────┐                   │
│ │         │  placeholder=def  │
│ └─────────┘                   │
│                               │
│ Max Tokens           [Reset]  │
│ ┌─────────┐                   │
│ │         │  placeholder=def  │
│ └─────────┘                   │
│            [Remove] [Save]    │
└───────────────────────────────┘
```

- **Persona** field is a `textarea`; its placeholder is `DEFAULT_PERSONA` (exported, so the panel can show it). Empty = use default.
- **Temperature** is a number input constrained to `0–1`; empty = use default.
- **Max Tokens** is a number input (positive integer); empty = use default.
- Each runtime-overridable field has a **Reset** affordance that clears that field from the store (falls back to the build-time/built-in default). Placeholders communicate "leave blank to use default."
- **Save** writes non-empty fields via `SettingsStore.set(...)` and clears emptied ones; then calls the existing `onSave` callback.
- The **Remove** button continues to govern the API key only (unchanged).

The panel does not have access to the provider's build-time defaults for `temperature`/`maxTokens` (those live inside the provider closure), so their placeholders read a generic "Use default" rather than the concrete value. The persona placeholder shows the concrete `DEFAULT_PERSONA`.

### 6. Gear availability (decouple from BYOK)

Today the gear and the entire `SettingsPanel` are created only inside `if (this.requiresApiKey)` in `src/core/ui/chat-input.ts`. Since system-prompt/temperature/max-tokens are useful regardless of who supplies the key, the gear becomes **always visible** and the `SettingsPanel` is always constructed.

- Gear renders unconditionally; clicking opens the panel.
- The existing BYOK auto-open behavior (open settings if `requiresApiKey` and no key) is preserved.
- The API Key field inside the panel is shown only when `requiresApiKey === true`; the three settings fields always show.
- No `showSettings` opt-out flag for now (YAGNI). Can be added later if a consumer needs to hide the panel entirely.

### 7. Provider request wiring (Anthropic + OpenAI, symmetric)

- `temperature`: resolved as `analyzeOptions?.temperature ?? constructionTemperature`. Included in the request body **only when defined** (so an unset temperature lets the API apply its own default rather than forcing a value).
- `maxTokens`: resolved as `analyzeOptions?.maxTokens ?? constructionMaxTokens ?? 8192`.
- `systemPrompt`: composed per §3.
- OpenAI keeps `baseURL`; Anthropic keeps its existing headers (`anthropic-dangerous-direct-browser-access`, etc.).

### 8. agent-overlay wiring

In `runAnalysis` (`src/core/agent-overlay.ts`), at the same point it already reads the API key from localStorage, also read the settings:

```ts
const settings = settingsStore.get()
const analyzeOptions: AnalyzeOptions = {
  model: selectedModel,
  additionalSystemPrompt: additionalSystemPrompt || undefined, // presets, unchanged
  apiKey: storedApiKey,
  headers: resolvedHeaders,
  chatMessages,
  systemPrompt: settings.systemPrompt,   // persona override (undefined = provider default)
  temperature: settings.temperature,
  maxTokens: settings.maxTokens,
}
```

- A single `SettingsStore` instance is created in `createAgentOverlay` (using `options.settingsStorageKey`) and passed into the `ChatPanel` → `ChatInput` → `SettingsPanel` chain so the panel reads/writes the same store.
- The React hook (`src/react/use-agent-overlay.ts`) needs **no changes** — settings flow internally through the panel and localStorage.

## Files Affected

- `src/core/types.ts` — `AnalyzeOptions` (+`systemPrompt`/`temperature`/`maxTokens`), `AgentOverlayOptions` (+`settingsStorageKey`)
- `src/providers/default-system-prompt.ts` — split into `DEFAULT_PERSONA` + `OVERLAY_CONTRACT`, keep `DEFAULT_SYSTEM_PROMPT`
- `src/providers/anthropic.ts` — `temperature` + `injectOverlayContract` options; new composition; temperature/maxTokens precedence in body
- `src/providers/openai.ts` — same as anthropic (keeps `baseURL`)
- `src/core/settings-store.ts` — NEW: `SettingsStore` + `OverlaySettings`
- `src/core/ui/settings-panel.ts` — three new fields, Reset affordances; takes a `SettingsStore` and a `requiresApiKey` flag (gates the API Key field)
- `src/core/ui/chat-input.ts` — gear always rendered; settings panel always constructed; pass `SettingsStore`
- `src/core/ui/chat-panel.ts` — thread `SettingsStore` through to `ChatInput`
- `src/core/agent-overlay.ts` — create `SettingsStore`, fold settings into `AnalyzeOptions`
- `src/index.ts` — export `DEFAULT_PERSONA`, `OVERLAY_CONTRACT`, `OverlaySettings` type
- Colocated `*.test.ts` for every modified/new file
- `README.md` — document new provider options, settings panel fields, precedence, and the `injectOverlayContract` migration note

## Test Scenarios

**SettingsStore**
- `get` returns `{}` when nothing stored; returns parsed blob when present; returns `{}` on corrupt JSON
- `set` merges and persists; clamps `temperature` to `[0,1]`; coerces `maxTokens` to positive integer and ignores invalid; treats empty-string `systemPrompt` as unset
- `reset(field)` removes one field; `clear()` removes the blob

**Providers (Anthropic + OpenAI)**
- Persona precedence: `analyzeOptions.systemPrompt` > construction `systemPrompt` > `DEFAULT_PERSONA`
- Contract auto-injected by default; omitted when `injectOverlayContract: false`
- Presets `additionalSystemPrompt` still appears between persona and contract
- `temperature` present in body only when set (analyze or construction); absent otherwise
- `maxTokens` precedence: `analyzeOptions.maxTokens` > construction > `8192`

**Settings panel**
- Three fields render; persona placeholder equals `DEFAULT_PERSONA`
- Save writes only non-empty fields; emptying a field + Save clears it from the store
- Reset clears a single field
- API Key field hidden when `requiresApiKey` is false; settings fields still shown

**agent-overlay / chat-input**
- Gear renders even when `requiresApiKey` is false
- Stored settings are folded into `AnalyzeOptions` on each `runAnalysis`
- BYOK auto-open behavior preserved when `requiresApiKey` and no key
