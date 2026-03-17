# Lightweight Chart Agent Overlay — Design Spec

## Overview

An npm package that lets developers add AI-powered analysis to TradingView Lightweight Charts. Users toggle selection mode, drag-select a range of candlesticks on the chart, type a prompt, and the AI responds by overlaying price lines and markers directly onto the chart.

No complete open-source implementation of this "chart-as-an-agent" pattern exists today.

## Target Users

Frontend developers who already use Lightweight Charts and want to add AI analysis capabilities to their charting applications via `npm install`.

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vanilla JS core + React hook wrapper | Lightweight Charts is framework-agnostic; binding to React excludes Vue/Svelte/vanilla users |
| LLM Integration | Provider abstraction layer | Built-in frontend provider for quick prototyping; injectable backend provider for production security |
| Interaction Model | Plugin architecture (not headless) | Minimal API surface; internal UI management |
| Selection Mode | Explicit toggle via `setSelectionEnabled()` | Avoids conflict with chart's native pan/scroll; developers choose their own trigger (button, hotkey, etc.) |
| Overlay Types (MVP) | Price Lines + Markers only | `series.createPriceLine()` + v5 markers plugin (`createSeriesMarkers()`); no custom primitives for overlays |
| Selection Highlight | Series Primitive with `useMediaCoordinateSpace()` | Follows chart zoom/pan automatically via `updateAllViews()` lifecycle; uses v5 `renderer()` method pattern |
| Prompt Input | DOM overlay, right-center positioned | UI element, not chart drawing; `stopPropagation` on mousedown to prevent dismiss |
| Data Source | Read from chart series by default | Zero-config via `series.data()`; optional `dataAccessor` override for richer data |

## Phased Roadmap

**Phase 1 (MVP):** Selection + Prompt + Overlay
- Developer enables selection mode via `setSelectionEnabled(true)`
- User drags to select a time range on the chart (chart pan/zoom disabled while in selection mode)
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
  setSelectionEnabled(enabled: boolean): void
  on(event: 'analyze-start', handler: () => void): () => void
  on(event: 'analyze-complete', handler: (result: AnalysisResult) => void): () => void
  on(event: 'selection-mode-change', handler: (enabled: boolean) => void): () => void
  on(event: 'error', handler: (error: Error) => void): () => void
}
```

`on()` returns an unsubscribe function. Calling `destroy()` removes all listeners.

### Selection Mode

`setSelectionEnabled(enabled)` is the **only** way to toggle selection mode. Internal operations (select, dismiss, cancel) never change the mode — it is purely controlled by the developer.

When `enabled = true`:
- Chart pan/zoom is disabled (`handleScroll: false, handleScale: false`)
- Dragging creates a selection range
- Starting a new drag automatically dismisses the previous selection and UI

When `enabled = false`:
- Chart pan/zoom works normally
- Clicking on the chart dismisses any existing selection highlight and UI

### React Hook

```ts
// lightweight-chart-agent-overlay/react
function useAgentOverlay(
  chart: IChartApi | null,
  series: ISeriesApi<SeriesType> | null,
  options: AgentOverlayOptions
): {
  clearOverlays: () => void
  setSelectionEnabled: (enabled: boolean) => void
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

**Validation:** `validateResult()` filters out malformed entries — price lines without a numeric `price`, and markers missing `time`, `position`, or `shape` are silently dropped.

## Interaction Flow

```
User                        Package                         LLM
────                        ───────                         ───
1. Developer calls
   setSelectionEnabled(true)
   → chart pan/zoom disabled
   → 'selection-mode-change'
     event emitted

2. mousedown on chart
   → mousemove (drag)       3. Draw selection highlight
   → mouseup                   (Series Primitive via
                                useMediaCoordinateSpace)

                            4. coordinateToTime() to get
                               time range boundaries
                               (tracks last valid time
                                for edge-of-chart fallback)

                            5. series.data() → filter by
                               time range → OHLCData[]

                            6. Show prompt input
                               (right-center, DOM overlay)

7. Type prompt, press Enter

                            8. Show loading indicator
                               in prompt area

                            9. Build ChartContext
                               { timeRange, data }
                               Call provider.analyze(
                                 context, prompt, signal
                               )                        →   10. Analyze data

                                                        ←   11. Return AnalysisResult

                            12. Validate result
                                (filter invalid entries)

                            13. Render overlays:
                                - series.createPriceLine()
                                  for each priceLine
                                  (store IPriceLine refs
                                   for later cleanup)
                                - createSeriesMarkers()
                                  plugin for markers

                            14. Show explanation popup
                                (dismissible via Esc
                                 or close button,
                                 scrollable if long)

                            15. Hide prompt input
```

**Dismiss behavior:**
- Selection mode ON + new drag → previous selection/UI auto-dismissed, new selection starts
- Selection mode ON + Esc in prompt → prompt and selection cleared, can immediately drag again
- Selection mode OFF + click → selection highlight and all UI dismissed

**Cancellation:** If the user starts a new drag selection while a request is in-flight, the package aborts the pending request via `AbortSignal` and starts a fresh flow.

## Key Technical Details

### Coordinate Conversion (Official API)

| Need | API |
|------|-----|
| pixel → time | `chart.timeScale().coordinateToTime(x)` |
| pixel → price | `series.coordinateToPrice(y)` |
| time → pixel | `chart.timeScale().timeToCoordinate(time)` |
| price → pixel | `series.priceToCoordinate(price)` |

**Edge-of-chart handling:** When dragging past the latest data point, `coordinateToTime()` returns `null`. The range-selector tracks the last valid `toTime` during mousemove and uses it as a fallback on mouseup.

### Selection Highlight via Series Primitive

The selection highlight is implemented as an `ISeriesPrimitive` attached to the series via `attachPrimitive()`. This ensures the highlight automatically follows chart zoom and pan through the `updateAllViews()` lifecycle hook.

The primitive's `paneViews()` returns views where `renderer()` is a **method** (not a property) that returns the renderer object — this is the Lightweight Charts v5 API contract. The renderer uses `target.useMediaCoordinateSpace()` to access the canvas context and media dimensions for drawing.

### Data Extraction

Use `series.data()` to get all data items, then filter by the selected time range boundaries to extract the OHLCV subset for the `ChartContext`. If a `dataAccessor` is provided in options, it is called instead of `series.data()`.

### Overlay Rendering & Cleanup

**Price Lines:** `series.createPriceLine()` returns an `IPriceLine` reference. `overlay-renderer.ts` stores all created references using immutable spread assignment. `clearOverlays()` iterates this array and calls `series.removePriceLine(ref)` for each.

**Markers (v5 Plugin API):** In Lightweight Charts v5, markers use a plugin-based API via `createSeriesMarkers(series)` which returns an `ISeriesMarkersPluginApi`. Call `setMarkers(data)` on the plugin instance to set markers, and `detach()` to remove them. The plugin instance is created once and reused; `clearOverlays()` calls `detach()` and nulls the reference.

### System Prompt (Built-in Provider)

The built-in providers include a system prompt that instructs the LLM to return valid JSON matching the `AnalysisResult` schema. Advanced users can override via `systemPrompt` option on the provider factory (e.g., `createAnthropicProvider({ systemPrompt: '...' })`).

Response validation: `JSON.parse()` first, then fallback regex extraction for JSON embedded in prose (non-greedy, iterates candidates from last to first). Invalid price line/marker entries are filtered out silently. On complete validation failure, emit an `'error'` event with a descriptive message.

### Explanation Popup

After a successful analysis, if `AnalysisResult.explanation` is present, a small popup is shown:
- **Dismiss:** Press Esc or click close button
- **Overflow:** Max height with scroll for long explanations
- **Styling:** Respects the `theme` option (light/dark)

### Prompt Input

- **Position:** Right-center of chart, offset from price scale (`right: 60px`)
- **Interaction:** `mousedown` event has `stopPropagation` to prevent triggering selection dismiss
- **Loading state:** Input disabled with "Analyzing..." placeholder during LLM call

## Package Structure

```
lightweight-chart-agent-overlay/
├── src/
│   ├── core/
│   │   ├── agent-overlay.ts          # createAgentOverlay() main entry
│   │   ├── event-emitter.ts          # typed event emitter (internal)
│   │   ├── types.ts                  # all public interfaces
│   │   ├── selection/
│   │   │   ├── range-selector.ts     # mouse events → drag selection + mode toggle
│   │   │   ├── selection-primitive.ts # Series Primitive highlight
│   │   │   └── context-builder.ts    # selection → ChartContext
│   │   ├── overlay/
│   │   │   └── overlay-renderer.ts   # AnalysisResult → price lines + markers
│   │   └── ui/
│   │       ├── prompt-input.ts       # floating prompt input (DOM)
│   │       └── explanation-popup.ts  # AI explanation display
│   ├── providers/
│   │   ├── parse-response.ts         # shared JSON extraction from LLM text
│   │   ├── anthropic.ts
│   │   └── openai.ts
│   ├── react/
│   │   ├── index.ts                  # react entry point
│   │   └── use-agent-overlay.ts      # useAgentOverlay hook
│   └── index.ts                      # core entry
├── examples/
│   └── vanilla/                      # vanilla JS demo (Vite)
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
| tsdown | Bundler — ESM (.mjs) + CJS (.cjs) dual output with .d.mts/.d.cts |
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
      "import": { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./react": {
      "import": { "types": "./dist/react/index.d.mts", "default": "./dist/react/index.mjs" },
      "require": { "types": "./dist/react/index.d.cts", "default": "./dist/react/index.cjs" }
    },
    "./providers/anthropic": {
      "import": { "types": "./dist/providers/anthropic.d.mts", "default": "./dist/providers/anthropic.mjs" },
      "require": { "types": "./dist/providers/anthropic.d.cts", "default": "./dist/providers/anthropic.cjs" }
    },
    "./providers/openai": {
      "import": { "types": "./dist/providers/openai.d.mts", "default": "./dist/providers/openai.mjs" },
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

## Developer Experience

### Vanilla JS

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

// Developer controls when selection mode is active
agent.setSelectionEnabled(true)

// Listen for mode changes
agent.on('selection-mode-change', (enabled) => {
  console.log(`Selection: ${enabled ? 'ON' : 'OFF'}`)
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

  const { clearOverlays, setSelectionEnabled, isAnalyzing, error, lastResult } =
    useAgentOverlay(chart, series, { provider })

  return (
    <>
      <button onClick={() => setSelectionEnabled(true)}>Select</button>
      <div ref={containerRef} />
    </>
  )
}
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM returns malformed JSON | Overlay rendering fails | Validate response schema with entry-level filtering; emit 'error' event |
| API key exposed in frontend | Security vulnerability | Document the risk clearly; recommend backend provider for production |
| Lightweight Charts API changes | Breaking changes | Pin to `^5.0.0`; use only stable documented APIs |
| Large data range selection | Slow LLM response / token cost | Limit or downsample data points sent to LLM; warn user for large selections |
| In-flight request during new selection | Stale overlay from old request | AbortSignal cancellation; abort pending request before starting new one |
| Drag past chart edge | coordinateToTime returns null | Track last valid toTime during mousemove as fallback |

## Out of Scope (MVP)

- Chat panel (Phase 2)
- Custom Series Primitives for overlays (trend lines, fibonacci, area highlights)
- Streaming LLM responses
- Undo/redo for overlays
- Multiple series support
- Persistence of overlays
