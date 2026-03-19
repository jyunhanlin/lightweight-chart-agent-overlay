# lightweight-chart-agent-overlay

AI-powered analysis overlay for [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5. Select a range of candlesticks, ask a question (or run preset analysis), and get structured results rendered as price lines, markers, and explanation popups — all driven by any LLM provider.

https://github.com/user-attachments/assets/c017ce6f-0a67-43ec-9f0e-0b47c1a187c5

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
  provider: createAnthropicProvider({ apiKey: 'sk-...' }),
})

// Toggle selection mode (user drags to select a range)
agent.setSelectionEnabled(true)

// Listen to events
agent.on('analyze-complete', (result) => console.log(result))
agent.on('error', (err) => console.error(err))

// Cleanup
agent.destroy()
```

Call `setSelectionEnabled(true)` to enter selection mode, drag a range on the chart, then type a question or press **Cmd+Enter** to run the selected preset.

## Providers

### Anthropic (Claude)

```ts
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const provider = createAnthropicProvider({
  apiKey: 'sk-ant-...',
  availableModels: [                  // optional: model selector in UI (first is default)
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
})
```

### OpenAI

```ts
import { createOpenAIProvider } from 'lightweight-chart-agent-overlay/providers/openai'

const provider = createOpenAIProvider({
  apiKey: 'sk-...',
  baseURL: 'https://api.openai.com/v1/chat/completions', // customizable
})
```

### Custom Provider

Implement the `LLMProvider` interface:

```ts
import type { LLMProvider, ChartContext, AnalysisResult } from 'lightweight-chart-agent-overlay'

const myProvider: LLMProvider = {
  availableModels: [{ id: 'my-model', label: 'My Model' }], // optional
  async analyze(context, prompt, signal?, options?) {
    // context.data: OHLCData[] — the selected candles
    // context.timeRange: { from, to }
    // prompt: string — user's question or preset quickPrompt
    // signal: AbortSignal — cancel on new selection or close
    // options: { model?, additionalSystemPrompt? }
    return {
      explanation: 'Analysis text', // or { sections: [{ label, content }] }
      priceLines: [{ price: 100, title: 'Support', color: '#26a69a', lineStyle: 'dashed' }],
      markers: [{ time: 1234567890, position: 'belowBar', shape: 'arrowUp', color: '#26a69a', text: 'Signal' }],
    }
  },
}
```

## Options

```ts
createAgentOverlay(chart, series, {
  provider: myProvider,              // required: LLMProvider
  theme: 'dark',                     // optional: 'dark' | 'light'
  presets: DEFAULT_PRESETS,          // optional: override built-in presets
  promptBuilder: defaultPromptBuilder, // optional: custom prompt construction
  dataAccessor: (range) => data,     // optional: custom data source
})
```

By default, candle data is extracted from `series.data()` filtered by the selected range. Use `dataAccessor` when your data lives outside the chart (e.g., a separate store with extra fields like volume from another API).

### Built-in Presets

When no `presets` option is provided, these are used by default:

| Preset | System Prompt Focus | Overlays |
|--------|-------------------|----------|
| Technical | Support/resistance, patterns, indicators | priceLines + markers |
| Fundamental | Macro context, news, fundamentals | explanation only |
| Smart Money | Volume patterns, institutional behavior | markers |
| Sentiment | Market sentiment from price action | explanation only |

Custom presets:

```ts
import type { AnalysisPreset } from 'lightweight-chart-agent-overlay'

const myPresets: AnalysisPreset[] = [
  {
    label: 'My Analysis',
    systemPrompt: 'Instructions for the LLM on HOW to analyze',
    quickPrompt: 'The actual question sent on quick run (Cmd+Enter with no text)',
  },
]
```

## React

```tsx
import { useAgentOverlay } from 'lightweight-chart-agent-overlay/react'

function ChartWithAI({ chart, series }) {
  const { isAnalyzing, error, lastResult, setSelectionEnabled, clearOverlays } =
    useAgentOverlay(chart, series, { provider })

  return (
    <button onClick={() => setSelectionEnabled(true)}>Select Range</button>
  )
}
```

## Events

```ts
agent.on('analyze-start', () => {})
agent.on('analyze-complete', (result: NormalizedAnalysisResult) => {})
agent.on('selection-mode-change', (enabled: boolean) => {})
agent.on('error', (err: Error) => {})

// Each .on() returns an unsubscribe function
const unsub = agent.on('analyze-complete', handler)
unsub()
```

## API Reference

### `createAgentOverlay(chart, series, options): AgentOverlay`

| Method | Description |
|--------|-------------|
| `setSelectionEnabled(enabled)` | Toggle range selection mode |
| `setTheme('light' \| 'dark')` | Switch theme dynamically (updates all UI via CSS variables) |
| `clearOverlays()` | Remove all price lines, markers, and popups |
| `on(event, handler)` | Subscribe to events (returns unsubscribe fn) |
| `destroy()` | Full cleanup — removes all listeners and DOM |

### `AnalysisResult`

The LLM response structure (returned by providers, validated internally):

```ts
{
  explanation?: string | { sections: { label: string; content: string }[] }
  priceLines?: { price: number; title?: string; color?: string; lineStyle?: 'solid' | 'dashed' | 'dotted' }[]
  markers?: { time: number; position: 'aboveBar' | 'belowBar'; shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'; color?: string; text?: string }[]
}
```

### `PromptBuilder`

Override how user input + presets are combined into LLM prompts:

```ts
import type { PromptBuilder } from 'lightweight-chart-agent-overlay'

const myBuilder: PromptBuilder = {
  build({ userPrompt, selectedPresets, isQuickRun }) {
    return {
      prompt: '...',                  // user message to LLM
      additionalSystemPrompt: '...',  // appended to base system prompt
    }
  },
}
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│ createAgentOverlay                              │
│                                                 │
│  RangeSelector ──► PromptInput ──► LLMProvider  │
│       │                │               │        │
│  SelectionPrimitive    │          AnalysisResult │
│  (canvas highlight)    │               │        │
│                        ▼               ▼        │
│                  PromptBuilder   validateResult  │
│                                        │        │
│              ExplanationPopup ◄─── HistoryStore  │
│              OverlayRenderer                    │
│              (priceLines + markers)             │
└─────────────────────────────────────────────────┘
```

**Key modules:**

| Module | Purpose |
|--------|---------|
| `RangeSelector` | Mouse drag → time range selection on chart |
| `PromptInput` | Textarea + model/preset dropdowns + submit |
| `PromptBuilder` | Combines user text + preset systemPrompts |
| `LLMProvider` | Sends context + prompt to any LLM API |
| `validateResult` | Normalizes LLM JSON (handles bare objects, nested fences) |
| `OverlayRenderer` | Renders priceLines and markers on the chart |
| `ExplanationPopup` | Displays structured analysis with history navigation |
| `HistoryStore` | In-memory ring buffer (50 entries) for past analyses |

## Development

```bash
pnpm install
pnpm dev          # Vite dev server (examples/vanilla)
pnpm test         # Run vitest
pnpm test:watch   # Watch mode
pnpm check        # lint + format:check + typecheck
pnpm build        # Build ESM + CJS via tsdown
```

Set `VITE_ANTHROPIC_API_KEY` in `examples/vanilla/.env.local` to use real AI instead of the mock provider.

## License

MIT
