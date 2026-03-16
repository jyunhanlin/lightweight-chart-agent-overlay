# Lightweight Chart Agent Overlay — Design Spec

## Overview

An npm package that lets developers add AI-powered analysis to TradingView Lightweight Charts. Users select a range of candlesticks on the chart, type a prompt, and the AI responds by overlaying price lines and markers directly onto the chart.

No complete open-source implementation of this "chart-as-an-agent" pattern exists today.

## Target Users

Frontend developers who already use Lightweight Charts and want to add AI analysis capabilities to their charting applications via `npm install`.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vanilla JS core + React hook wrapper | Lightweight Charts is framework-agnostic; binding to React excludes Vue/Svelte/vanilla users |
| LLM Integration | Provider abstraction layer | Built-in frontend provider for quick prototyping; injectable backend provider for production security |
| Interaction Model | Plugin architecture (not headless) | Minimal API surface; 3 lines to get running; internal UI management |
| Overlay Types (MVP) | Price Lines + Markers only | `series.createPriceLine()` + v5 markers plugin (`createSeriesMarkers()`); no custom primitives for overlays |
| Selection Highlight | Series Primitive | Follows chart zoom/pan automatically via `updateAllViews()` lifecycle |
| Prompt Input | DOM overlay | UI element, not chart drawing; positioned above chart container |
| Data Source | Read from chart series by default | Zero-config via `series.data()`; optional `dataAccessor` override for richer data |

## Phased Roadmap

**Phase 1 (MVP):** Selection + Prompt + Overlay
- User drags to select a time range on the chart
- Prompt input appears; user types a question
- AI analyzes the selected OHLCV data and returns structured overlay instructions
- Package renders price lines and markers on the chart
- Overlay types limited to `series.createPriceLine()` + v5 markers plugin

**Phase 2:** Chat Panel
- Side panel for multi-turn conversation
- Each turn can add/modify/remove overlays on the chart
- Architecture from Phase 1 must support this extension without breaking changes

## Core API

### Main Entry

```ts
function createAgentOverlay(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  options: AgentOverlayOptions
): AgentOverlay
```

### Options

```ts
interface AgentOverlayOptions {
  provider: LLMProvider
  dataAccessor?: DataAccessor
  ui?: {
    promptPlacement?: 'top' | 'bottom'
    theme?: 'light' | 'dark'
  }
}

// Override default data extraction from series.data()
// Return richer data (e.g. with volume, indicators) for the selected range
type DataAccessor = (timeRange: {
  from: TimeValue
  to: TimeValue
}) => Array<OHLCData>
```

### Return Value

```ts
interface AgentOverlay {
  destroy(): void
  clearOverlays(): void
  on(event: 'analyze-start', handler: () => void): () => void
  on(event: 'analyze-complete', handler: (result: AnalysisResult) => void): () => void
  on(event: 'error', handler: (error: Error) => void): () => void
}
```

`on()` returns an unsubscribe function. Calling `destroy()` removes all listeners.

### React Hook

```ts
// lightweight-chart-agent-overlay/react
function useAgentOverlay(
  chart: IChartApi | null,
  series: ISeriesApi<SeriesType> | null,
  options: AgentOverlayOptions
): {
  clearOverlays: () => void
  isAnalyzing: boolean
  error: Error | null
  lastResult: AnalysisResult | null
}
```

### LLM Provider Interface

```ts
interface LLMProvider {
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal
  ): Promise<AnalysisResult>
}
```

`signal` enables cancellation when the user starts a new selection while a request is in-flight. The package passes an `AbortSignal` automatically; provider implementations should forward it to their HTTP client.

### Built-in Provider Usage

```ts
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const provider = createAnthropicProvider({
  apiKey: 'sk-ant-...',
  model: 'claude-sonnet-4-20250514', // optional, has default
  systemPrompt: '...',               // optional, override default system prompt
})
```

### Custom Backend Provider

```ts
const myProvider: LLMProvider = {
  async analyze(context, prompt, signal) {
    const res = await fetch('/api/chart-analyze', {
      method: 'POST',
      body: JSON.stringify({ context, prompt }),
      signal,
    })
    return res.json()
  },
}
```

## Data Structures

### TimeValue

```ts
// Matches Lightweight Charts HorzScaleItem — supports both formats
type TimeValue = number | string // Unix timestamp or 'YYYY-MM-DD'
```

### OHLCData

```ts
interface OHLCData {
  time: TimeValue
  open: number
  high: number
  low: number
  close: number
  volume?: number
}
```

### ChartContext (sent to LLM)

```ts
interface ChartContext {
  timeRange: { from: TimeValue; to: TimeValue }
  data: Array<OHLCData>
}
```

Note: `prompt` is passed as a separate argument to `LLMProvider.analyze()`, not embedded in `ChartContext`. This keeps the context as pure chart data, which is cleaner for Phase 2 multi-turn conversations where the same context may be reused with different prompts.

### AnalysisResult (returned by LLM)

```ts
interface AnalysisResult {
  explanation?: string
  priceLines?: Array<{
    price: number
    color?: string
    lineWidth?: number
    lineStyle?: 'solid' | 'dashed' | 'dotted'
    title?: string
  }>
  markers?: Array<{
    time: TimeValue
    position: 'aboveBar' | 'belowBar'
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
    color?: string
    text?: string
  }>
}
```

**Mapping notes:**
- `lineStyle` strings must be mapped to Lightweight Charts `LineStyle` enum values in `overlay-renderer.ts` (`'solid'` → `LineStyle.Solid`, `'dashed'` → `LineStyle.Dashed`, `'dotted'` → `LineStyle.Dotted`)
- `position` and `shape` values match Lightweight Charts' `SeriesMarkerPosition` and `SeriesMarkerShape` types directly

## Interaction Flow

```
User                        Package                         LLM
────                        ───────                         ───
1. mousedown on chart
   → mousemove (drag)       2. Draw selection highlight
   → mouseup                   (Series Primitive)

                            3. coordinateToTime() to get
                               time range boundaries

                            4. series.data() → filter by
                               time range → OHLCData[]

                            5. Show prompt input (DOM overlay)

6. Type prompt, press Enter

                            7. Show loading indicator
                               in prompt area

                            8. Build ChartContext
                               { timeRange, data }
                               Call provider.analyze(
                                 context, prompt, signal
                               )                        →   9. Analyze data

                                                        ←   10. Return AnalysisResult

                            11. Parse & validate result

                            12. Render overlays:
                                - series.createPriceLine()
                                  for each priceLine
                                  (store IPriceLine refs
                                   for later cleanup)
                                - createSeriesMarkers()
                                  plugin for markers

                            13. Show explanation popup
                                (positioned near selection,
                                 dismissible via click/Esc,
                                 scrollable if content is long)

                            14. Hide prompt input
```

**Cancellation:** If the user starts a new drag selection while a request is in-flight, the package aborts the pending request via `AbortSignal` and starts a fresh flow from step 2.

## Key Technical Details

### Coordinate Conversion (Official API)

| Need | API |
|------|-----|
| pixel → time | `chart.timeScale().coordinateToTime(x)` |
| pixel → price | `series.coordinateToPrice(y)` |
| time → pixel | `chart.timeScale().timeToCoordinate(time)` |
| price → pixel | `series.priceToCoordinate(price)` |

### Selection Highlight via Series Primitive

The selection highlight is implemented as an `ISeriesPrimitive` attached to the series via `attachPrimitive()`. This ensures the highlight automatically follows chart zoom and pan through the `updateAllViews()` lifecycle hook. The primitive draws a semi-transparent rectangle on the canvas between the selected time range.

### Data Extraction

Use `series.data()` to get all data items, then filter by the selected time range boundaries to extract the OHLCV subset for the `ChartContext`. If a `dataAccessor` is provided in options, it is called instead of `series.data()`.

### Overlay Rendering & Cleanup

**Price Lines:** `series.createPriceLine()` returns an `IPriceLine` reference. `overlay-renderer.ts` must store all created references in an array. `clearOverlays()` iterates this array and calls `series.removePriceLine(ref)` for each.

**Markers (v5 Plugin API):** In Lightweight Charts v5, markers use a plugin-based API via `createSeriesMarkers(series)` which returns an `ISeriesMarkersPluginApi`. Call `setMarkers(data)` on the plugin instance to set markers, and `detach()` to remove them. The plugin instance is created once and reused; `clearOverlays()` calls `detach()` and nulls the reference.

### System Prompt (Built-in Provider)

The built-in providers include a system prompt that instructs the LLM to return valid JSON matching the `AnalysisResult` schema. Advanced users can override via `systemPrompt` option on the provider factory (e.g., `createAnthropicProvider({ systemPrompt: '...' })`).

Response validation: `JSON.parse()` + schema check + fallback error handling to prevent malformed LLM responses from breaking the flow. On validation failure, emit an `'error'` event with a descriptive message.

### Explanation Popup

After a successful analysis, if `AnalysisResult.explanation` is present, a small popup is shown:
- **Position:** Near the selection area, offset to avoid overlapping the prompt input
- **Dismiss:** Click outside, press Esc, or click a close button
- **Overflow:** Max height with scroll for long explanations
- **Styling:** Respects the `theme` option (light/dark)

## Package Structure

```
lightweight-chart-agent-overlay/
├── src/
│   ├── core/
│   │   ├── agent-overlay.ts          # createAgentOverlay() main entry
│   │   ├── types.ts                  # all public interfaces
│   │   ├── selection/
│   │   │   ├── range-selector.ts     # mouse events → drag selection
│   │   │   ├── selection-primitive.ts # Series Primitive highlight
│   │   │   └── context-builder.ts    # selection → ChartContext
│   │   ├── overlay/
│   │   │   └── overlay-renderer.ts   # AnalysisResult → price lines + markers
│   │   └── ui/
│   │       ├── prompt-input.ts       # floating prompt input (DOM)
│   │       └── explanation-popup.ts  # AI explanation display
│   ├── providers/
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── react/
│   │   ├── index.ts                  # react entry point
│   │   └── use-agent-overlay.ts      # useAgentOverlay hook
│   └── index.ts                      # core entry
├── examples/
│   ├── vanilla/                      # vanilla JS demo (Vite)
│   └── react/                        # React demo
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── .oxlintrc.json
├── .oxfmtrc.json
└── .changeset/
    └── config.json
```

## Build & Tooling

| Tool | Purpose |
|------|---------|
| tsdown | Bundler — ESM + CJS dual output with .d.ts |
| oxlint | Linter (Rust-based) |
| oxfmt | Formatter (Rust-based) — no semi, single quotes, 100 width |
| vitest | Testing — jsdom, V8 coverage, 80% threshold |
| simple-git-hooks | Pre-push: lint + format check + typecheck |
| @changesets/cli | Semver versioning and changelog |
| vite | Dev server for examples |

### Package Exports

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./react": {
      "import": { "types": "./dist/react/index.d.ts", "default": "./dist/react/index.js" },
      "require": { "types": "./dist/react/index.d.cts", "default": "./dist/react/index.cjs" }
    },
    "./providers/anthropic": {
      "import": { "types": "./dist/providers/anthropic.d.ts", "default": "./dist/providers/anthropic.js" },
      "require": { "types": "./dist/providers/anthropic.d.cts", "default": "./dist/providers/anthropic.cjs" }
    },
    "./providers/openai": {
      "import": { "types": "./dist/providers/openai.d.ts", "default": "./dist/providers/openai.js" },
      "require": { "types": "./dist/providers/openai.d.cts", "default": "./dist/providers/openai.cjs" }
    }
  },
  "peerDependencies": {
    "lightweight-charts": "^5.0.0",
    "react": "^18.0.0 || ^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

### tsdown Config

```ts
{
  entry: [
    'src/index.ts',
    'src/react/index.ts',
    'src/providers/anthropic.ts',
    'src/providers/openai.ts',
  ],
  format: ['esm', 'cjs'],
  outDir: 'dist',
  dts: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
}
```

## Developer Experience

### Vanilla JS (3 lines to start)

```ts
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { createAgentOverlay } from 'lightweight-chart-agent-overlay'
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const chart = createChart(container)
const series = chart.addSeries(CandlestickSeries)
series.setData(data)

const agent = createAgentOverlay(chart, series, {
  provider: createAnthropicProvider({ apiKey: '...' }),
})
```

### React

```tsx
import { useRef, useState, useEffect } from 'react'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { useAgentOverlay } from 'lightweight-chart-agent-overlay/react'
import { createAnthropicProvider } from 'lightweight-chart-agent-overlay/providers/anthropic'

const provider = createAnthropicProvider({ apiKey: '...' })

function MyChart() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [chart, setChart] = useState<IChartApi | null>(null)
  const [series, setSeries] = useState<ISeriesApi | null>(null)

  useEffect(() => {
    const c = createChart(containerRef.current!)
    const s = c.addSeries(CandlestickSeries)
    s.setData(data)
    setChart(c)
    setSeries(s)
    return () => c.remove()
  }, [])

  const { clearOverlays, isAnalyzing, error, lastResult } = useAgentOverlay(chart, series, {
    provider,
  })

  return <div ref={containerRef} />
}
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM returns malformed JSON | Overlay rendering fails | Validate response schema; show user-friendly error; emit 'error' event |
| API key exposed in frontend | Security vulnerability | Document the risk clearly; recommend backend provider for production |
| Lightweight Charts API changes | Breaking changes | Pin to `^5.0.0`; use only stable documented APIs |
| Large data range selection | Slow LLM response / token cost | Limit or downsample data points sent to LLM; warn user for large selections |
| In-flight request during new selection | Stale overlay from old request | AbortSignal cancellation; abort pending request before starting new one |

## Out of Scope (MVP)

- Chat panel (Phase 2)
- Custom Series Primitives for overlays (trend lines, fibonacci, area highlights)
- Streaming LLM responses
- Undo/redo for overlays
- Multiple series support
- Persistence of overlays
