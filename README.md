# lightweight-chart-agent-overlay

AI-powered analysis overlay for [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5. Select a range of candlesticks, ask a question, and get streaming AI analysis with overlays — then follow up in a multi-turn chat.

## Install

```bash
npm install lightweight-chart-agent-overlay lightweight-charts
```

## Quick Start

```ts
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { createAgentOverlay } from 'lightweight-chart-agent-overlay'
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const chart = createChart(container)
const series = chart.addSeries(CandlestickSeries)
series.setData(candleData)

const agent = createAgentOverlay(chart, series, {
  provider: createAnthropicProvider({
    apiKey: 'sk-ant-...',
    availableModels: [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }],
  }),
})

agent.setSelectionEnabled(true)
```

Select a range → type a question or press **Cmd+Enter** to run presets → get streaming analysis with price lines and markers → ask follow-up questions in the same chat.

## Features

- **Multi-turn chat** — follow-up questions within the same analysis context
- **Streaming responses** — real-time markdown rendering as the LLM generates
- **Per-turn overlays** — each turn has its own price lines and markers; click a turn to switch
- **Window-like panel** — draggable, resizable from all edges/corners, collapsible
- **BYOK support** — end-users enter their own API key via settings UI
- **Provider-agnostic** — built-in Anthropic/OpenAI providers, or implement your own
- **Framework-agnostic** — vanilla JS core with React hook wrapper

## Providers

### Anthropic (Claude)

```ts
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const provider = createAnthropicProvider({
  apiKey: 'sk-ant-...',               // omit for BYOK mode
  availableModels: [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
  maxTokens: 8192,                    // optional, default: 8192
})
```

### OpenAI

```ts
import { createOpenAIProvider } from 'lightweight-chart-agent-overlay/providers/openai'

const provider = createOpenAIProvider({
  apiKey: 'sk-...',                    // omit for BYOK mode
  availableModels: [{ id: 'gpt-4o-mini', label: 'GPT-4o Mini' }],
  baseURL: 'https://api.openai.com/v1/chat/completions', // customizable
  maxTokens: 8192,                     // optional, default: 8192
})
```

### Custom Provider

```ts
import type { LLMProvider } from 'lightweight-chart-agent-overlay'

const myProvider: LLMProvider = {
  availableModels: [{ id: 'my-model', label: 'My Model' }],
  async analyze(context, prompt, signal?, options?) {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: JSON.stringify({ context, prompt }),
      signal,
    })
    return res.json()
  },
  // Optional: implement for streaming support
  async *analyzeStream(context, prompt, signal?, options?) {
    // yield text chunks as they arrive
  },
}
```

**Multi-turn support:** Built-in providers automatically handle `options.chatMessages` for multi-turn conversations. Custom providers can read `options.chatMessages` (a `ChatMessage[]` array) to support follow-up questions.

**Auth headers:** Set `headers` (static or async function) on your provider. The overlay resolves headers before each call and passes them via `options.headers`.

**BYOK:** Set `requiresApiKey: true` to show a settings gear icon where users can enter their own API key.

## Security

**BYOK** — Omit `apiKey` when creating a built-in provider and a settings gear appears in the toolbar. Users enter their own key, stored in `localStorage`. Use [CSP headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP) in production.

**Backend proxy** — For maximum security, route through your own backend:

```ts
const provider: LLMProvider = {
  async analyze(context, prompt, signal, options) {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, prompt }),
      signal,
    })
    return res.json()
  },
}
```

## React

```tsx
import { useAgentOverlay } from 'lightweight-chart-agent-overlay/react'

function ChartWithAI({ chart, series }) {
  const { isAnalyzing, error, lastResult, setSelectionEnabled, clearOverlays } =
    useAgentOverlay(chart, series, { provider })

  return <button onClick={() => setSelectionEnabled(true)}>Select Range</button>
}
```

## Options & Presets

```ts
createAgentOverlay(chart, series, {
  provider: myProvider,               // required
  theme: 'dark',                      // optional: 'dark' | 'light'
  presets: DEFAULT_PRESETS,           // optional: override built-in presets
  promptBuilder: defaultPromptBuilder, // optional: custom prompt construction
  dataAccessor: (range) => data,      // optional: custom data source
  apiKeyStorageKey: 'my-app-key',    // optional: localStorage key for BYOK
})
```

### Built-in Presets

| Preset | Focus | Overlays |
|--------|-------|----------|
| Technical | Support/resistance, patterns, indicators | priceLines + markers |
| Fundamental | Macro context, news | explanation only |
| Smart Money | Volume patterns, institutional behavior | markers |
| Sentiment | Market sentiment from price action | explanation only |

## Events

```ts
agent.on('analyze-start', () => {})
agent.on('analyze-complete', (result) => {})
agent.on('selection-mode-change', (enabled) => {})
agent.on('error', (err) => {})

const unsub = agent.on('analyze-complete', handler)
unsub() // unsubscribe
```

## API Reference

### `createAgentOverlay(chart, series, options): AgentOverlay`

| Method | Description |
|--------|-------------|
| `setSelectionEnabled(enabled)` | Toggle range selection mode |
| `setTheme('light' \| 'dark')` | Switch theme dynamically |
| `clearOverlays()` | Remove all overlays and close chat |
| `on(event, handler)` | Subscribe to events (returns unsubscribe fn) |
| `destroy()` | Full cleanup |

## Architecture

```
┌──────────────────────────────────────────────┐
│ createAgentOverlay                           │
│                                              │
│  RangeSelector ──► ChatPanel ──► LLMProvider │
│       │             │  │              │      │
│  SelectionPrimitive │  │        AnalysisResult│
│  (canvas highlight) │  │              │      │
│                     │  │              ▼      │
│    ChatInput ───────┘  │       parseResponse │
│    ChatMessageList ────┘              │      │
│                              validateResult  │
│                                      │       │
│              OverlayRenderer ◄── HistoryStore │
│              (priceLines + markers)           │
└──────────────────────────────────────────────┘
```

| Module | Purpose |
|--------|---------|
| `RangeSelector` | Mouse drag → time range selection |
| `ChatPanel` | Unified chat UI (header + messages + input) |
| `ChatInput` | Toolbar (model/preset/settings) + textarea |
| `ChatMessageList` | Per-turn message rendering + streaming |
| `LLMProvider` | Sends context + prompt to any LLM API |
| `OverlayRenderer` | Renders priceLines and markers on chart |
| `HistoryStore` | In-memory conversation history (50 entries) |

## Development

```bash
pnpm install
pnpm dev          # Vite dev server (examples/vanilla)
pnpm test         # Run vitest
pnpm test:watch   # Watch mode
pnpm check        # lint + format:check + typecheck
pnpm build        # Build ESM + CJS via tsdown
```

Set `VITE_ANTHROPIC_API_KEY` in `examples/vanilla/.env.local` for real AI.

## License

MIT
