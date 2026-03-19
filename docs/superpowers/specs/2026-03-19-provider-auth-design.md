# Provider Auth Design

## Problem

The built-in Anthropic and OpenAI providers pass API keys directly in browser-side `fetch` calls. This is fine for local development but exposes keys in production. The library needs a production-ready auth story that stays frontend-only.

## Goals

1. **BYOK (Bring Your Own Key)** — end-users input their own API key via a settings UI, stored in localStorage. App developers never expose their own keys.
2. **Custom provider auth** — custom providers can declare auth headers (static or async) that the overlay resolves and passes at each `analyze()` call.

## Non-Goals

- No server-side code or backend SDK
- No new provider exports (no `createProxyProvider`)
- No token refresh/rotation logic — async `headers` function is the escape hatch

## Design

### 1. Interface Changes

#### `AnalyzeOptions`

```ts
interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string                    // NEW — BYOK key from settings UI
  readonly headers?: Record<string, string>   // NEW — resolved auth headers from provider
}
```

#### `LLMProvider`

```ts
interface LLMProvider {
  readonly availableModels?: readonly ModelOption[]
  readonly requiresApiKey?: boolean  // NEW — true when provider needs BYOK key
  readonly headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
}
```

**Why `headers` lives on the provider and is resolved by the overlay:**
The provider declares _what_ auth it needs; the overlay handles _when_ to resolve it (including async). This separates auth declaration from request logic — the provider's `analyze()` just uses `options.headers` without worrying about async resolution. The overlay acts as middleware, not a circular dependency.

#### Built-in Providers

`apiKey` becomes optional in `createAnthropicProvider` and `createOpenAIProvider`.

When `apiKey` is omitted, the returned provider sets `requiresApiKey: true` so the overlay knows to show the settings UI.

Priority: constructor `apiKey` > `options.apiKey` > error.

```ts
// Dev mode — hardcoded key
createAnthropicProvider({ apiKey: 'sk-ant-...', availableModels: [...] })

// BYOK mode — key comes from settings UI via options.apiKey
createAnthropicProvider({ availableModels: [...] })
// → returned provider has requiresApiKey: true
```

### 2. Settings UI (BYOK only)

The settings UI is **conditional** — it only appears when `provider.requiresApiKey === true`. Custom providers that handle their own auth via `headers` do not show the settings UI.

A gear icon (⚙️) at the **right end of the prompt input bottom toolbar** (after the Enter hint, same row as model/preset dropdowns) opens a settings panel.

```
┌─────────────────────────────┐
│ Settings                  × │
├─────────────────────────────┤
│ API Key                     │
│ ┌─────────────────────┐     │
│ │ ••••••••••••••••••  │     │
│ └─────────────────────┘     │
│        [Remove] [Save]      │
└─────────────────────────────┘
```

- Gear icon only visible when `provider.requiresApiKey === true`
- Settings panel registers with the existing `DropdownManager` so it is mutually exclusive with model/preset dropdowns (opening one closes the others)
- Settings panel implements a `close()` method compatible with `DropdownManager.closeAllExcept()`
- Input type is `password` (masked)
- Save button enabled only when input has a value
- Remove button visible only when a key is stored; clears localStorage entry
- Key stored in localStorage under a configurable key (default: `agent-overlay-api-key`)
- Configurable via `AgentOverlayOptions.apiKeyStorageKey`

**Security note:** localStorage is accessible to any JavaScript on the same origin. An XSS vulnerability could leak stored keys. README should recommend Content Security Policy (CSP) headers in production. For stricter security, app developers can use a custom provider with backend proxy instead of BYOK.

### 3. Overlay Wiring

Before each `analyze()` call, the overlay:

1. Reads API key from localStorage
2. Resolves `provider.headers` (call if function, await if async)
3. Passes both via `AnalyzeOptions`:
   ```ts
   provider.analyze(context, prompt, signal, {
     model,
     additionalSystemPrompt,
     apiKey: localStorageKey,
     headers: resolvedHeaders,
   })
   ```

**Missing key handling:**
- If `provider.requiresApiKey` is true and no key is available (constructor didn't provide one + localStorage is empty), the overlay auto-opens the settings panel with a prompt message instead of calling `analyze()`.

**Auth error handling:**
- If `analyze()` throws and the error message indicates auth failure (401/403 status), the overlay auto-opens the settings panel with a message like "Invalid API key. Please check your key in Settings."

### 4. Custom Provider Usage

**Precedence guidance:** Use `options.apiKey` for BYOK scenarios (end-user provides their own key). Use `options.headers` for app-level auth (session cookies, JWT, API gateway tokens). Avoid using both `apiKey` and `headers` for the `Authorization` header simultaneously — `options.headers` will overwrite any `Authorization` set via `apiKey` if both are spread.

Custom providers use `options.headers` for auth:

```ts
const provider: LLMProvider = {
  headers: async () => ({
    Authorization: `Bearer ${await refreshToken()}`,
  }),
  async analyze(context, prompt, signal, options) {
    const res = await fetch('/api/analyze', {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: JSON.stringify({ context, prompt }),
      signal,
    })
    return res.json()
  },
}
```

Custom providers can also use `options.apiKey` if they want BYOK:

```ts
const provider: LLMProvider = {
  requiresApiKey: true,
  async analyze(context, prompt, signal, options) {
    const res = await fetch('https://my-api.com/v1/chat', {
      headers: {
        Authorization: `Bearer ${options?.apiKey}`,
      },
      body: JSON.stringify({ context, prompt }),
      signal,
    })
    return res.json()
  },
}
```

### 5. AgentOverlayOptions Changes

```ts
interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly theme?: 'dark' | 'light'
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly dataAccessor?: DataAccessor
  readonly apiKeyStorageKey?: string  // NEW — localStorage key name (default: 'agent-overlay-api-key')
}
```

## Files Affected

- `src/core/types.ts` — `AnalyzeOptions`, `LLMProvider`, `AgentOverlayOptions`
- `src/providers/anthropic.ts` — `apiKey` optional, `requiresApiKey` flag, use `options.apiKey` fallback
- `src/providers/openai.ts` — same as anthropic
- `src/core/ui/prompt-input.ts` — add gear icon to toolbar
- `src/core/ui/settings-panel.ts` — NEW: settings panel component
- `src/core/agent-overlay.ts` — resolve headers, read localStorage, pass to analyze, handle auth errors
- Tests for all modified/new files
- `README.md`:
  - Update Security section: BYOK usage, settings UI description, localStorage XSS caveat with CSP recommendation
  - Update Providers section: show `apiKey` as optional in built-in provider examples
  - Update Custom Provider section: `options.apiKey` and `options.headers` usage examples
  - Update API Reference: new `apiKeyStorageKey` option, `requiresApiKey` on LLMProvider, `AnalyzeOptions` changes

## Test Scenarios

- Settings gear icon visible when `provider.requiresApiKey === true`, hidden otherwise
- Settings panel renders, saves key to localStorage, loads existing key
- Remove button clears localStorage entry
- Overlay reads key from localStorage and passes to provider via `options.apiKey`
- Provider priority chain: constructor `apiKey` > `options.apiKey` > error
- Overlay auto-opens settings panel when `requiresApiKey` is true and no key available
- Overlay auto-opens settings panel on 401/403 auth errors
- Overlay does NOT show settings UI for custom providers without `requiresApiKey`
- Async `headers` resolution: success, rejection, and provider without headers
- Built-in providers set `requiresApiKey: true` when `apiKey` is omitted
- `anthropic-dangerous-direct-browser-access` header still present in BYOK mode (expected — user explicitly opts in)
