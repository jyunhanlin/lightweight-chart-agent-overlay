# Lightweight Chart Agent Overlay — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npm package that lets developers add AI-powered analysis overlays to TradingView Lightweight Charts v5 — users drag-select a range of K-lines, type a prompt, and the AI draws price lines and markers directly on the chart.

**Architecture:** Vanilla JS core (framework-agnostic) with a React hook wrapper. LLM integration via a provider abstraction layer — built-in Anthropic/OpenAI providers for quick prototyping, injectable custom providers for production backends. Selection highlight uses a Series Primitive; prompt input and explanation popup are DOM overlays.

**Tech Stack:** TypeScript, Lightweight Charts v5, tsdown, oxlint, oxfmt, vitest, simple-git-hooks, @changesets/cli, Vite (examples)

**Spec:** `docs/superpowers/specs/2026-03-16-chart-agent-overlay-design.md`

---

## File Map

| File | Responsibility |
|------|----------------|
| `src/core/types.ts` | All public interfaces and type definitions |
| `src/core/event-emitter.ts` | Typed event emitter (internal utility) |
| `src/core/selection/range-selector.ts` | Mouse event handling → drag selection coordinates |
| `src/core/selection/selection-primitive.ts` | ISeriesPrimitive for selection highlight rectangle |
| `src/core/selection/context-builder.ts` | Selected range → ChartContext data extraction |
| `src/core/overlay/overlay-renderer.ts` | AnalysisResult → createPriceLine + createSeriesMarkers |
| `src/core/ui/prompt-input.ts` | Floating prompt input DOM element |
| `src/core/ui/explanation-popup.ts` | AI explanation popup DOM element |
| `src/core/agent-overlay.ts` | `createAgentOverlay()` — main orchestrator |
| `src/providers/parse-response.ts` | Shared JSON extraction utility for providers |
| `src/providers/anthropic.ts` | Built-in Anthropic LLM provider |
| `src/providers/openai.ts` | Built-in OpenAI LLM provider |
| `src/react/use-agent-overlay.ts` | `useAgentOverlay` React hook |
| `src/react/index.ts` | React entry point (re-exports) |
| `src/index.ts` | Core entry point (re-exports) |
| `examples/vanilla/index.html` | Vanilla JS demo page |
| `examples/vanilla/main.ts` | Vanilla JS demo code |

---

## Chunk 1: Project Scaffolding

### Task 1: Initialize package.json and install dependencies

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.npmrc`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "lightweight-chart-agent-overlay",
  "version": "0.0.1",
  "description": "AI-powered analysis overlay for TradingView Lightweight Charts",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
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
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "oxlint src/",
    "format": "oxfmt --write src/",
    "format:check": "oxfmt --check src/",
    "typecheck": "tsc --noEmit",
    "check": "pnpm lint && pnpm format:check && pnpm typecheck",
    "dev": "vite examples/vanilla"
  },
  "simple-git-hooks": {
    "pre-push": "pnpm check"
  },
  "peerDependencies": {
    "lightweight-charts": "^5.0.0",
    "react": "^18.0.0 || ^19.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  },
  "devDependencies": {},
  "license": "MIT"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
coverage/
.superpowers/
*.tgz
```

- [ ] **Step 3: Create .npmrc**

```
shamefully-hoist=true
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
pnpm add -D typescript tsdown vitest @vitest/coverage-v8 jsdom oxlint oxfmt simple-git-hooks @changesets/cli vite lightweight-charts react @types/react
```

Expected: `node_modules/` created, `pnpm-lock.yaml` generated.

- [ ] **Step 5: Initialize simple-git-hooks**

Run: `pnpm simple-git-hooks`

Expected: `.git/hooks/pre-push` created.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore .npmrc
git commit -m "chore: initialize package with dependencies"
```

---

### Task 2: Configure TypeScript, tsdown, vitest, linting, formatting

**Files:**
- Create: `tsconfig.json`
- Create: `tsdown.config.ts`
- Create: `vitest.config.ts`
- Create: `.oxlintrc.json`
- Create: `.oxfmtrc.json`
- Create: `.changeset/config.json`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["vitest/globals"],
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Create tsdown.config.ts**

```ts
import { defineConfig } from 'tsdown'

export default defineConfig({
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
})
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/react/index.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
```

- [ ] **Step 4: Create .oxlintrc.json**

```json
{
  "categories": {
    "correctness": "error",
    "suspicious": "warn",
    "perf": "warn"
  },
  "overrides": {
    "files": ["**/*.test.ts"],
    "rules": {
      "unicorn/consistent-function-scoping": "off",
      "no-extraneous-class": "off"
    }
  },
  "ignorePatterns": ["dist", "coverage"]
}
```

- [ ] **Step 5: Create .oxfmtrc.json**

```json
{
  "semi": false,
  "singleQuote": true,
  "printWidth": 100,
  "trailingComma": "all"
}
```

- [ ] **Step 6: Create .changeset/config.json**

```bash
mkdir -p .changeset
```

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsdown.config.ts vitest.config.ts .oxlintrc.json .oxfmtrc.json .changeset/
git commit -m "chore: configure typescript, tsdown, vitest, linting, formatting"
```

---

### Task 3: Create type definitions

**Files:**
- Create: `src/core/types.ts`
- Test: `src/core/types.test.ts`

All public interfaces from the spec. This is the foundation everything else depends on.

- [ ] **Step 1: Write the type definitions**

```ts
// src/core/types.ts

import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'

// --- Time ---

/** Matches Lightweight Charts HorzScaleItem — supports both formats */
export type TimeValue = number | string

// --- Data ---

export interface OHLCData {
  readonly time: TimeValue
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume?: number
}

// --- LLM Context & Result ---

export interface ChartContext {
  readonly timeRange: { readonly from: TimeValue; readonly to: TimeValue }
  readonly data: readonly OHLCData[]
}

export interface PriceLineAction {
  readonly price: number
  readonly color?: string
  readonly lineWidth?: number
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted'
  readonly title?: string
}

export interface MarkerAction {
  readonly time: TimeValue
  readonly position: 'aboveBar' | 'belowBar'
  readonly shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
  readonly color?: string
  readonly text?: string
}

export interface AnalysisResult {
  readonly explanation?: string
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}

// --- Provider ---

export interface LLMProvider {
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<AnalysisResult>
}

// --- Data Accessor ---

export type DataAccessor = (timeRange: {
  from: TimeValue
  to: TimeValue
}) => OHLCData[]

// --- Options ---

export interface AgentOverlayUIOptions {
  readonly promptPlacement?: 'top' | 'bottom'
  readonly theme?: 'light' | 'dark'
}

export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly dataAccessor?: DataAccessor
  readonly ui?: AgentOverlayUIOptions
}

// --- Event Map ---

export interface AgentOverlayEventMap {
  'analyze-start': () => void
  'analyze-complete': (result: AnalysisResult) => void
  'error': (error: Error) => void
}

// --- Return Value ---

export interface AgentOverlay {
  destroy(): void
  clearOverlays(): void
  on<K extends keyof AgentOverlayEventMap>(
    event: K,
    handler: AgentOverlayEventMap[K],
  ): () => void
}
```

- [ ] **Step 2: Write a compilation test**

```ts
// src/core/types.test.ts
import type {
  TimeValue,
  OHLCData,
  ChartContext,
  AnalysisResult,
  LLMProvider,
  AgentOverlayOptions,
  AgentOverlay,
  DataAccessor,
  PriceLineAction,
  MarkerAction,
} from './types'

describe('types', () => {
  it('TimeValue accepts number and string', () => {
    const a: TimeValue = 1234567890
    const b: TimeValue = '2024-01-01'
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('string')
  })

  it('OHLCData has required and optional fields', () => {
    const data: OHLCData = {
      time: 1234567890,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
    }
    expect(data.volume).toBeUndefined()

    const dataWithVolume: OHLCData = { ...data, volume: 1000 }
    expect(dataWithVolume.volume).toBe(1000)
  })

  it('AnalysisResult fields are all optional', () => {
    const empty: AnalysisResult = {}
    expect(empty.explanation).toBeUndefined()
    expect(empty.priceLines).toBeUndefined()
    expect(empty.markers).toBeUndefined()
  })

  it('PriceLineAction requires price, rest optional', () => {
    const line: PriceLineAction = { price: 100 }
    expect(line.price).toBe(100)

    const full: PriceLineAction = {
      price: 100,
      color: 'red',
      lineWidth: 2,
      lineStyle: 'dashed',
      title: 'Support',
    }
    expect(full.lineStyle).toBe('dashed')
  })

  it('MarkerAction uses correct position values', () => {
    const marker: MarkerAction = {
      time: '2024-01-01',
      position: 'aboveBar',
      shape: 'arrowDown',
      color: 'red',
      text: 'Sell',
    }
    expect(marker.position).toBe('aboveBar')
  })
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm test -- src/core/types.test.ts`

Expected: PASS — all type compilation checks pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/core/types.test.ts
git commit -m "feat: add core type definitions"
```

---

### Task 4: Create typed event emitter (internal utility)

**Files:**
- Create: `src/core/event-emitter.ts`
- Test: `src/core/event-emitter.test.ts`

A small typed event emitter used internally by `agent-overlay.ts`. Not exported publicly.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/event-emitter.test.ts
import { createEventEmitter } from './event-emitter'

interface TestEvents {
  ping: () => void
  data: (value: number) => void
  error: (err: Error) => void
}

describe('createEventEmitter', () => {
  it('calls handler when event is emitted', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('ping', handler)
    emitter.emit('ping')

    expect(handler).toHaveBeenCalledOnce()
  })

  it('passes arguments to handler', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    emitter.on('data', handler)
    emitter.emit('data', 42)

    expect(handler).toHaveBeenCalledWith(42)
  })

  it('returns unsubscribe function from on()', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    const unsub = emitter.on('ping', handler)
    unsub()
    emitter.emit('ping')

    expect(handler).not.toHaveBeenCalled()
  })

  it('supports multiple handlers for same event', () => {
    const emitter = createEventEmitter<TestEvents>()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('ping', h2)
    emitter.emit('ping')

    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('removeAll clears all handlers', () => {
    const emitter = createEventEmitter<TestEvents>()
    const h1 = vi.fn()
    const h2 = vi.fn()

    emitter.on('ping', h1)
    emitter.on('data', h2)
    emitter.removeAll()
    emitter.emit('ping')
    emitter.emit('data', 1)

    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('unsubscribing same handler twice is safe', () => {
    const emitter = createEventEmitter<TestEvents>()
    const handler = vi.fn()

    const unsub = emitter.on('ping', handler)
    unsub()
    unsub() // should not throw

    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/event-emitter.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/event-emitter.ts

type EventMap = Record<string, (...args: never[]) => void>

export interface EventEmitter<T extends EventMap> {
  on<K extends keyof T>(event: K, handler: T[K]): () => void
  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void
  removeAll(): void
}

export function createEventEmitter<T extends EventMap>(): EventEmitter<T> {
  const handlers = new Map<keyof T, Set<T[keyof T]>>()

  return {
    on<K extends keyof T>(event: K, handler: T[K]): () => void {
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler as T[keyof T])

      return () => {
        handlers.get(event)?.delete(handler as T[keyof T])
      }
    },

    emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
      const set = handlers.get(event)
      if (!set) return
      for (const handler of set) {
        ;(handler as (...a: Parameters<T[K]>) => void)(...args)
      }
    },

    removeAll(): void {
      handlers.clear()
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/event-emitter.test.ts`

Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/event-emitter.ts src/core/event-emitter.test.ts
git commit -m "feat: add typed event emitter utility"
```

---

## Chunk 2: Selection System

### Task 5: Implement context-builder (data extraction)

**Files:**
- Create: `src/core/selection/context-builder.ts`
- Test: `src/core/selection/context-builder.test.ts`

Extracts OHLCV data from a time range. Depends only on `types.ts`.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/selection/context-builder.test.ts
import { buildChartContext } from './context-builder'
import type { OHLCData, DataAccessor } from '../types'

const SAMPLE_DATA: OHLCData[] = [
  { time: 1000, open: 100, high: 110, low: 90, close: 105 },
  { time: 2000, open: 105, high: 115, low: 95, close: 110 },
  { time: 3000, open: 110, high: 120, low: 100, close: 115 },
  { time: 4000, open: 115, high: 125, low: 105, close: 120 },
  { time: 5000, open: 120, high: 130, low: 110, close: 125 },
]

describe('buildChartContext', () => {
  it('filters data by time range (inclusive)', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 2000, to: 4000 })

    expect(ctx.timeRange).toEqual({ from: 2000, to: 4000 })
    expect(ctx.data).toHaveLength(3)
    expect(ctx.data[0].time).toBe(2000)
    expect(ctx.data[2].time).toBe(4000)
  })

  it('returns empty data when range has no matches', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 9000, to: 10000 })

    expect(ctx.data).toHaveLength(0)
    expect(ctx.timeRange).toEqual({ from: 9000, to: 10000 })
  })

  it('handles string time values', () => {
    const stringData: OHLCData[] = [
      { time: '2024-01-01', open: 100, high: 110, low: 90, close: 105 },
      { time: '2024-01-02', open: 105, high: 115, low: 95, close: 110 },
      { time: '2024-01-03', open: 110, high: 120, low: 100, close: 115 },
    ]
    const ctx = buildChartContext(stringData, { from: '2024-01-01', to: '2024-01-02' })

    expect(ctx.data).toHaveLength(2)
  })

  it('uses dataAccessor when provided', () => {
    const customData: OHLCData[] = [
      { time: 2000, open: 999, high: 999, low: 999, close: 999, volume: 50000 },
    ]
    const accessor: DataAccessor = vi.fn().mockReturnValue(customData)

    const ctx = buildChartContext(SAMPLE_DATA, { from: 2000, to: 4000 }, accessor)

    expect(accessor).toHaveBeenCalledWith({ from: 2000, to: 4000 })
    expect(ctx.data).toEqual(customData)
  })

  it('swaps from/to if from > to (numeric)', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 4000, to: 2000 })

    expect(ctx.timeRange).toEqual({ from: 2000, to: 4000 })
    expect(ctx.data).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/selection/context-builder.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/selection/context-builder.ts

import type { ChartContext, DataAccessor, OHLCData, TimeValue } from '../types'

function compareTime(a: TimeValue, b: TimeValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function normalizeRange(from: TimeValue, to: TimeValue): { from: TimeValue; to: TimeValue } {
  if (compareTime(from, to) > 0) return { from: to, to: from }
  return { from, to }
}

export function buildChartContext(
  seriesData: readonly OHLCData[],
  range: { from: TimeValue; to: TimeValue },
  dataAccessor?: DataAccessor,
): ChartContext {
  const timeRange = normalizeRange(range.from, range.to)

  if (dataAccessor) {
    return { timeRange, data: dataAccessor(timeRange) }
  }

  const data = seriesData.filter(
    (d) => compareTime(d.time, timeRange.from) >= 0 && compareTime(d.time, timeRange.to) <= 0,
  )

  return { timeRange, data }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/selection/context-builder.test.ts`

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/selection/context-builder.ts src/core/selection/context-builder.test.ts
git commit -m "feat: add context-builder for chart data extraction"
```

---

### Task 6: Implement selection-primitive (canvas highlight)

**Files:**
- Create: `src/core/selection/selection-primitive.ts`
- Test: `src/core/selection/selection-primitive.test.ts`

An `ISeriesPrimitive` that draws a semi-transparent rectangle over the selected time range. It must implement `paneViews()` and `updateAllViews()` so the highlight follows chart zoom/pan.

Note: This module interacts with Lightweight Charts' canvas rendering. Tests will verify the primitive's data model (setting/clearing range, calculating coordinates), not actual canvas drawing.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/selection/selection-primitive.test.ts
import { SelectionPrimitive } from './selection-primitive'

// Minimal mock for SeriesAttachedParameter
function createMockAttachedParams() {
  return {
    chart: {
      timeScale: () => ({
        timeToCoordinate: vi.fn((time: number) => time / 10), // simplified mapping
      }),
    },
    series: {
      priceToCoordinate: vi.fn(),
    },
    requestUpdate: vi.fn(),
  }
}

describe('SelectionPrimitive', () => {
  it('starts with no selection', () => {
    const primitive = new SelectionPrimitive()
    expect(primitive.getRange()).toBeNull()
  })

  it('setRange stores the time range', () => {
    const primitive = new SelectionPrimitive()
    primitive.setRange({ from: 1000, to: 2000 })
    expect(primitive.getRange()).toEqual({ from: 1000, to: 2000 })
  })

  it('clearRange resets to null', () => {
    const primitive = new SelectionPrimitive()
    primitive.setRange({ from: 1000, to: 2000 })
    primitive.clearRange()
    expect(primitive.getRange()).toBeNull()
  })

  it('requestUpdate is called on setRange when attached', () => {
    const primitive = new SelectionPrimitive()
    const params = createMockAttachedParams()
    primitive.attached(params as never)

    primitive.setRange({ from: 1000, to: 2000 })
    expect(params.requestUpdate).toHaveBeenCalled()
  })

  it('paneViews returns empty array when no range', () => {
    const primitive = new SelectionPrimitive()
    expect(primitive.paneViews()).toEqual([])
  })

  it('paneViews returns a view when range is set', () => {
    const primitive = new SelectionPrimitive()
    const params = createMockAttachedParams()
    primitive.attached(params as never)
    primitive.setRange({ from: 1000, to: 2000 })
    primitive.updateAllViews()

    const views = primitive.paneViews()
    expect(views).toHaveLength(1)
    expect(views[0].renderer).toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/selection/selection-primitive.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/selection/selection-primitive.ts

import type { TimeValue } from '../types'

interface TimeRange {
  readonly from: TimeValue
  readonly to: TimeValue
}

interface AttachedParams {
  chart: {
    timeScale: () => {
      timeToCoordinate: (time: TimeValue) => number | null
    }
  }
  requestUpdate: () => void
}

interface PaneRenderer {
  draw(target: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }): void
}

interface PaneView {
  renderer: PaneRenderer
}

const HIGHLIGHT_COLOR = 'rgba(33, 150, 243, 0.15)'

export class SelectionPrimitive {
  private range: TimeRange | null = null
  private params: AttachedParams | null = null
  private cachedViews: PaneView[] = []
  private x1: number | null = null
  private x2: number | null = null

  getRange(): TimeRange | null {
    return this.range
  }

  setRange(range: TimeRange): void {
    this.range = range
    this.params?.requestUpdate()
  }

  clearRange(): void {
    this.range = null
    this.cachedViews = []
    this.x1 = null
    this.x2 = null
    this.params?.requestUpdate()
  }

  attached(params: AttachedParams): void {
    this.params = params
  }

  detached(): void {
    this.params = null
  }

  updateAllViews(): void {
    if (!this.range || !this.params) {
      this.cachedViews = []
      return
    }

    const timeScale = this.params.chart.timeScale()
    const fromX = timeScale.timeToCoordinate(this.range.from)
    const toX = timeScale.timeToCoordinate(this.range.to)

    if (fromX === null || toX === null) {
      this.cachedViews = []
      return
    }

    this.x1 = Math.min(fromX, toX)
    this.x2 = Math.max(fromX, toX)

    const x1 = this.x1
    const x2 = this.x2

    this.cachedViews = [
      {
        renderer: {
          draw(target) {
            const ctx = target.context
            const height = target.mediaSize.height

            ctx.fillStyle = HIGHLIGHT_COLOR
            ctx.fillRect(x1, 0, x2 - x1, height)
          },
        },
      },
    ]
  }

  paneViews(): readonly PaneView[] {
    return this.cachedViews
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/selection/selection-primitive.test.ts`

Expected: PASS — all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/selection/selection-primitive.ts src/core/selection/selection-primitive.test.ts
git commit -m "feat: add selection primitive for canvas highlight"
```

---

### Task 7: Implement range-selector (mouse events → selection coordinates)

**Files:**
- Create: `src/core/selection/range-selector.ts`
- Test: `src/core/selection/range-selector.test.ts`

Listens to mousedown/mousemove/mouseup on the chart container. Converts pixel coordinates to time values via `chart.timeScale().coordinateToTime()`. Manages the `SelectionPrimitive` lifecycle.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/selection/range-selector.test.ts
import { RangeSelector } from './range-selector'

function createMockChart() {
  const coordinateToTime = vi.fn((x: number) => x * 10) // pixel 10 → time 100
  // IMPORTANT: create the element ONCE and return the same reference every time
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ left: 0, top: 0 } as DOMRect)
  return {
    el, // exposed for test access
    timeScale: () => ({ coordinateToTime }),
    chartElement: () => el,
  }
}

function createMockSeries() {
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
  }
}

function fireMouseEvent(el: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, { clientX, clientY: 50, bubbles: true })
  el.dispatchEvent(event)
}

describe('RangeSelector', () => {
  it('creates and attaches SelectionPrimitive on init', () => {
    const chart = createMockChart()
    const series = createMockSeries()

    new RangeSelector(chart as never, series as never)
    expect(series.attachPrimitive).toHaveBeenCalledOnce()
  })

  it('emits onSelect after mousedown → mousemove → mouseup', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect

    // Use chart.el — the SAME element that RangeSelector bound listeners to
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)

    expect(onSelect).toHaveBeenCalledWith({ from: 100, to: 500 })
  })

  it('does not emit onSelect for click without drag (same position)', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect

    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mouseup', 10)

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('destroy removes event listeners and detaches primitive', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)

    selector.destroy()
    expect(series.detachPrimitive).toHaveBeenCalledOnce()

    // Verify events no longer fire after destroy
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/selection/range-selector.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/selection/range-selector.ts

import type { TimeValue } from '../types'
import { SelectionPrimitive } from './selection-primitive'

const MIN_DRAG_PX = 5

interface ChartLike {
  timeScale(): { coordinateToTime(x: number): TimeValue | null }
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
}

export class RangeSelector {
  private readonly primitive: SelectionPrimitive
  private readonly chart: ChartLike
  private readonly series: SeriesLike
  private readonly el: HTMLElement
  private startX: number | null = null
  private isDragging = false

  onSelect: ((range: { from: TimeValue; to: TimeValue }) => void) | null = null

  private readonly handleMouseDown: (e: MouseEvent) => void
  private readonly handleMouseMove: (e: MouseEvent) => void
  private readonly handleMouseUp: (e: MouseEvent) => void

  constructor(chart: ChartLike, series: SeriesLike) {
    this.chart = chart
    this.series = series
    this.el = chart.chartElement()
    this.primitive = new SelectionPrimitive()

    series.attachPrimitive(this.primitive)

    this.handleMouseDown = (e: MouseEvent) => {
      this.startX = e.clientX - this.el.getBoundingClientRect().left
      this.isDragging = false
      this.primitive.clearRange()
    }

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.startX === null) return
      const currentX = e.clientX - this.el.getBoundingClientRect().left

      if (!this.isDragging && Math.abs(currentX - this.startX) >= MIN_DRAG_PX) {
        this.isDragging = true
      }

      if (!this.isDragging) return

      const fromTime = this.chart.timeScale().coordinateToTime(this.startX)
      const toTime = this.chart.timeScale().coordinateToTime(currentX)

      if (fromTime !== null && toTime !== null) {
        this.primitive.setRange({ from: fromTime, to: toTime })
      }
    }

    this.handleMouseUp = (e: MouseEvent) => {
      if (this.startX === null) return

      const endX = e.clientX - this.el.getBoundingClientRect().left

      if (this.isDragging) {
        const fromTime = this.chart.timeScale().coordinateToTime(this.startX)
        const toTime = this.chart.timeScale().coordinateToTime(endX)

        if (fromTime !== null && toTime !== null) {
          this.onSelect?.({ from: fromTime, to: toTime })
        }
      }

      this.startX = null
      this.isDragging = false
    }

    this.el.addEventListener('mousedown', this.handleMouseDown)
    this.el.addEventListener('mousemove', this.handleMouseMove)
    this.el.addEventListener('mouseup', this.handleMouseUp)
  }

  getRange(): { from: TimeValue; to: TimeValue } | null {
    return this.primitive.getRange()
  }

  clearSelection(): void {
    this.primitive.clearRange()
  }

  destroy(): void {
    this.el.removeEventListener('mousedown', this.handleMouseDown)
    this.el.removeEventListener('mousemove', this.handleMouseMove)
    this.el.removeEventListener('mouseup', this.handleMouseUp)
    this.series.detachPrimitive(this.primitive)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/selection/range-selector.test.ts`

Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/selection/range-selector.ts src/core/selection/range-selector.test.ts
git commit -m "feat: add range-selector for drag selection"
```

---

## Chunk 3: Overlay Rendering

### Task 8: Implement overlay-renderer

**Files:**
- Create: `src/core/overlay/overlay-renderer.ts`
- Test: `src/core/overlay/overlay-renderer.test.ts`

Parses `AnalysisResult` and calls `series.createPriceLine()` + `createSeriesMarkers()`. Tracks created references for cleanup.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/overlay/overlay-renderer.test.ts
import { OverlayRenderer } from './overlay-renderer'
import type { AnalysisResult } from '../types'

function createMockSeries() {
  const priceLines: Array<{ options: unknown }> = []
  return {
    createPriceLine: vi.fn((opts: unknown) => {
      const line = { options: opts }
      priceLines.push(line)
      return line
    }),
    removePriceLine: vi.fn(),
    _priceLines: priceLines,
  }
}

// Mock createSeriesMarkers at module level
const mockSetMarkers = vi.fn()
const mockDetach = vi.fn()
const mockMarkers = vi.fn().mockReturnValue([])

vi.mock('lightweight-charts', () => ({
  createSeriesMarkers: vi.fn(() => ({
    setMarkers: mockSetMarkers,
    detach: mockDetach,
    markers: mockMarkers,
  })),
  LineStyle: { Solid: 0, Dashed: 1, LargeDashed: 2, Dotted: 3 },
}))

describe('OverlayRenderer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders price lines from AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)

    const result: AnalysisResult = {
      priceLines: [
        { price: 100, title: 'Support', color: 'green', lineStyle: 'dashed' },
        { price: 200, title: 'Resistance', color: 'red' },
      ],
    }

    renderer.render(result)

    expect(series.createPriceLine).toHaveBeenCalledTimes(2)
    expect(series.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 100, title: 'Support', color: 'green', lineStyle: 1 }),
    )
  })

  it('renders markers from AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)

    const result: AnalysisResult = {
      markers: [
        { time: 1000, position: 'aboveBar', shape: 'arrowDown', color: 'red', text: 'Sell' },
      ],
    }

    renderer.render(result)

    expect(mockSetMarkers).toHaveBeenCalledWith([
      expect.objectContaining({ time: 1000, position: 'aboveBar', shape: 'arrowDown' }),
    ])
  })

  it('clear removes all price lines and markers', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)

    renderer.render({
      priceLines: [{ price: 100 }],
      markers: [{ time: 1000, position: 'aboveBar', shape: 'circle' }],
    })

    renderer.clear()

    expect(series.removePriceLine).toHaveBeenCalledOnce()
    expect(mockDetach).toHaveBeenCalledOnce()
  })

  it('maps lineStyle strings to LineStyle enum', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)

    renderer.render({
      priceLines: [
        { price: 100, lineStyle: 'solid' },
        { price: 200, lineStyle: 'dashed' },
        { price: 300, lineStyle: 'dotted' },
      ],
    })

    const calls = series.createPriceLine.mock.calls
    expect(calls[0][0].lineStyle).toBe(0) // Solid
    expect(calls[1][0].lineStyle).toBe(1) // Dashed
    expect(calls[2][0].lineStyle).toBe(3) // Dotted
  })

  it('handles empty AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)

    renderer.render({})

    expect(series.createPriceLine).not.toHaveBeenCalled()
    expect(mockSetMarkers).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/overlay/overlay-renderer.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/overlay/overlay-renderer.ts

import { createSeriesMarkers, LineStyle } from 'lightweight-charts'
import type { AnalysisResult, PriceLineAction, MarkerAction } from '../types'

interface SeriesLike {
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
}

const LINE_STYLE_MAP: Record<string, number> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
}

function mapPriceLineOptions(action: PriceLineAction): Record<string, unknown> {
  return {
    price: action.price,
    ...(action.color != null && { color: action.color }),
    ...(action.lineWidth != null && { lineWidth: action.lineWidth }),
    ...(action.lineStyle != null && { lineStyle: LINE_STYLE_MAP[action.lineStyle] ?? LineStyle.Solid }),
    ...(action.title != null && { title: action.title }),
    axisLabelVisible: true,
  }
}

export class OverlayRenderer {
  private readonly series: SeriesLike
  // Mutable refs tracking is necessary — Lightweight Charts' imperative API
  // requires storing references for cleanup. Using immutable reassignment pattern.
  private priceLineRefs: readonly unknown[] = []
  private markersPlugin: { setMarkers: (m: unknown[]) => void; detach: () => void } | null = null

  constructor(series: SeriesLike) {
    this.series = series
  }

  render(result: AnalysisResult): void {
    if (result.priceLines && result.priceLines.length > 0) {
      const newRefs = result.priceLines.map((line) =>
        this.series.createPriceLine(mapPriceLineOptions(line)),
      )
      this.priceLineRefs = [...this.priceLineRefs, ...newRefs]
    }

    if (result.markers && result.markers.length > 0) {
      const markerData = result.markers.map((m: MarkerAction) => ({
        time: m.time,
        position: m.position,
        shape: m.shape,
        ...(m.color != null && { color: m.color }),
        ...(m.text != null && { text: m.text }),
      }))

      if (!this.markersPlugin) {
        this.markersPlugin = createSeriesMarkers(this.series as never, markerData) as never
      } else {
        this.markersPlugin.setMarkers(markerData)
      }
    }
  }

  clear(): void {
    for (const ref of this.priceLineRefs) {
      this.series.removePriceLine(ref)
    }
    this.priceLineRefs = []

    if (this.markersPlugin) {
      this.markersPlugin.detach()
      this.markersPlugin = null
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/overlay/overlay-renderer.test.ts`

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/overlay/overlay-renderer.ts src/core/overlay/overlay-renderer.test.ts
git commit -m "feat: add overlay-renderer for price lines and markers"
```

---

## Chunk 4: UI Components

### Task 9: Implement prompt-input (floating DOM input)

**Files:**
- Create: `src/core/ui/prompt-input.ts`
- Test: `src/core/ui/prompt-input.test.ts`

A floating text input that appears over the chart when a range is selected. Shows loading state during analysis.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/ui/prompt-input.test.ts
import { PromptInput } from './prompt-input'

describe('PromptInput', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('show() adds input element to container', () => {
    const input = new PromptInput(container)
    input.show({ x: 100, y: 50 })

    const el = container.querySelector('[data-agent-overlay-prompt]')
    expect(el).not.toBeNull()
  })

  it('hide() removes element from container', () => {
    const input = new PromptInput(container)
    input.show({ x: 100, y: 50 })
    input.hide()

    const el = container.querySelector('[data-agent-overlay-prompt]')
    expect(el).toBeNull()
  })

  it('calls onSubmit when Enter is pressed', () => {
    const input = new PromptInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit

    input.show({ x: 100, y: 50 })

    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.value = 'Draw support lines'
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onSubmit).toHaveBeenCalledWith('Draw support lines')
  })

  it('does not call onSubmit for empty input', () => {
    const input = new PromptInput(container)
    const onSubmit = vi.fn()
    input.onSubmit = onSubmit

    input.show({ x: 100, y: 50 })

    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.value = '   '
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('hides on Escape key', () => {
    const input = new PromptInput(container)
    input.show({ x: 100, y: 50 })

    const inputEl = container.querySelector('input') as HTMLInputElement
    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })

  it('setLoading shows loading indicator', () => {
    const input = new PromptInput(container)
    input.show({ x: 100, y: 50 })
    input.setLoading(true)

    const inputEl = container.querySelector('input') as HTMLInputElement
    expect(inputEl.disabled).toBe(true)
  })

  it('destroy cleans up', () => {
    const input = new PromptInput(container)
    input.show({ x: 100, y: 50 })
    input.destroy()

    expect(container.querySelector('[data-agent-overlay-prompt]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/ui/prompt-input.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/ui/prompt-input.ts

type Theme = 'light' | 'dark'

const THEME_STYLES: Record<Theme, { bg: string; border: string; text: string; placeholder: string }> = {
  dark: { bg: '#1e1e2e', border: '#444', text: '#e0e0e0', placeholder: '#888' },
  light: { bg: '#ffffff', border: '#ccc', text: '#1a1a1a', placeholder: '#999' },
}

export class PromptInput {
  private readonly container: HTMLElement
  private readonly theme: Theme
  private wrapper: HTMLElement | null = null

  onSubmit: ((prompt: string) => void) | null = null
  onCancel: (() => void) | null = null

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    this.container = container
    this.theme = theme
  }

  show(position: { x: number; y: number }): void {
    this.hide()

    const s = THEME_STYLES[this.theme]

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-prompt', '')
    wrapper.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 4px;
      background: ${s.bg};
      border: 1px solid ${s.border};
      border-radius: 6px;
      padding: 4px 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = 'Ask about this range...'
    input.style.cssText = `
      background: transparent;
      border: none;
      outline: none;
      color: ${s.text};
      font-size: 13px;
      width: 260px;
      font-family: inherit;
    `

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        const value = input.value.trim()
        if (value) {
          this.onSubmit?.(value)
        }
      } else if (e.key === 'Escape') {
        this.hide()
        this.onCancel?.()
      }
    })

    wrapper.appendChild(input)
    this.container.appendChild(wrapper)
    this.wrapper = wrapper

    input.focus()
  }

  hide(): void {
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    }
  }

  setLoading(loading: boolean): void {
    if (!this.wrapper) return
    const input = this.wrapper.querySelector('input')
    if (input) {
      input.disabled = loading
      input.placeholder = loading ? 'Analyzing...' : 'Ask about this range...'
    }
  }

  destroy(): void {
    this.hide()
    this.onSubmit = null
    this.onCancel = null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/ui/prompt-input.test.ts`

Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/prompt-input.ts src/core/ui/prompt-input.test.ts
git commit -m "feat: add floating prompt input component"
```

---

### Task 10: Implement explanation-popup

**Files:**
- Create: `src/core/ui/explanation-popup.ts`
- Test: `src/core/ui/explanation-popup.test.ts`

Shows the AI's text explanation after analysis. Dismissible via click outside, Escape, or close button.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/ui/explanation-popup.test.ts
import { ExplanationPopup } from './explanation-popup'

describe('ExplanationPopup', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('show() displays explanation text', () => {
    const popup = new ExplanationPopup(container)
    popup.show('This is a support level', { x: 100, y: 50 })

    const el = container.querySelector('[data-agent-overlay-explanation]')
    expect(el).not.toBeNull()
    expect(el!.textContent).toContain('This is a support level')
  })

  it('hide() removes element', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    popup.hide()

    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('Escape key dismisses popup', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('close button dismisses popup', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })

    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLElement
    closeBtn.click()

    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })

  it('destroy cleans up', () => {
    const popup = new ExplanationPopup(container)
    popup.show('text', { x: 100, y: 50 })
    popup.destroy()

    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/ui/explanation-popup.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/ui/explanation-popup.ts

type Theme = 'light' | 'dark'

const EXPLANATION_THEME: Record<Theme, { bg: string; border: string; text: string; closeColor: string }> = {
  dark: { bg: '#1e1e2e', border: '#444', text: '#e0e0e0', closeColor: '#888' },
  light: { bg: '#ffffff', border: '#ccc', text: '#1a1a1a', closeColor: '#666' },
}

export class ExplanationPopup {
  private readonly container: HTMLElement
  private readonly theme: Theme
  private wrapper: HTMLElement | null = null
  private readonly handleEscape: (e: KeyboardEvent) => void

  constructor(container: HTMLElement, theme: Theme = 'dark') {
    this.container = container
    this.theme = theme
    this.handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.hide()
    }
  }

  show(text: string, position: { x: number; y: number }): void {
    this.hide()

    const s = EXPLANATION_THEME[this.theme]

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-explanation', '')
    wrapper.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      z-index: 1000;
      background: ${s.bg};
      border: 1px solid ${s.border};
      border-radius: 6px;
      padding: 8px 12px;
      max-width: 320px;
      max-height: 200px;
      overflow-y: auto;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: ${s.text};
      font-size: 13px;
      line-height: 1.5;
    `

    const closeBtn = document.createElement('button')
    closeBtn.setAttribute('data-agent-overlay-close', '')
    closeBtn.textContent = '\u00d7'
    closeBtn.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      background: none;
      border: none;
      color: ${s.closeColor};
      cursor: pointer;
      font-size: 16px;
      padding: 0 4px;
    `
    closeBtn.addEventListener('click', () => this.hide())

    const content = document.createElement('div')
    content.style.paddingRight = '16px'
    content.textContent = text

    wrapper.appendChild(closeBtn)
    wrapper.appendChild(content)
    this.container.appendChild(wrapper)
    this.wrapper = wrapper

    document.addEventListener('keydown', this.handleEscape)
  }

  hide(): void {
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }
  }

  destroy(): void {
    this.hide()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/ui/explanation-popup.test.ts`

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/explanation-popup.ts src/core/ui/explanation-popup.test.ts
git commit -m "feat: add explanation popup component"
```

---

## Chunk 5: Orchestrator & Providers

### Task 11: Implement agent-overlay (main orchestrator)

**Files:**
- Create: `src/core/agent-overlay.ts`
- Test: `src/core/agent-overlay.test.ts`

The `createAgentOverlay()` function that wires everything together: RangeSelector → PromptInput → Provider → OverlayRenderer → ExplanationPopup. Manages AbortController for cancellation.

- [ ] **Step 1: Write failing tests**

```ts
// src/core/agent-overlay.test.ts
import { createAgentOverlay } from './agent-overlay'
import type { LLMProvider, AnalysisResult, AgentOverlayOptions } from './types'

// Mock lightweight-charts
vi.mock('lightweight-charts', () => ({
  createSeriesMarkers: vi.fn(() => ({
    setMarkers: vi.fn(),
    detach: vi.fn(),
    markers: vi.fn().mockReturnValue([]),
  })),
  LineStyle: { Solid: 0, Dashed: 1, LargeDashed: 2, Dotted: 3 },
}))

function createMockChart() {
  const el = document.createElement('div')
  el.style.position = 'relative'
  document.body.appendChild(el)
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 } as DOMRect)

  return {
    el,
    chart: {
      timeScale: () => ({
        coordinateToTime: vi.fn((x: number) => x * 10),
        timeToCoordinate: vi.fn((t: number) => t / 10),
      }),
      chartElement: () => el,
    },
  }
}

function createMockSeries() {
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
    createPriceLine: vi.fn(() => ({})),
    removePriceLine: vi.fn(),
    data: vi.fn().mockReturnValue([
      { time: 1000, open: 100, high: 110, low: 90, close: 105 },
      { time: 2000, open: 105, high: 115, low: 95, close: 110 },
      { time: 3000, open: 110, high: 120, low: 100, close: 115 },
    ]),
  }
}

function createMockProvider(result: AnalysisResult = {}): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue(result),
  }
}

describe('createAgentOverlay', () => {
  it('returns AgentOverlay with expected methods', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })

    expect(agent.destroy).toBeInstanceOf(Function)
    expect(agent.clearOverlays).toBeInstanceOf(Function)
    expect(agent.on).toBeInstanceOf(Function)
  })

  it('on() returns an unsubscribe function', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const handler = vi.fn()
    const unsub = agent.on('analyze-start', handler)

    expect(typeof unsub).toBe('function')
  })

  it('destroy cleans up without errors', () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    expect(() => agent.destroy()).not.toThrow()

    el.remove()
  })

  it('clearOverlays does not throw when no overlays exist', () => {
    const { chart } = createMockChart()
    const series = createMockSeries()
    const provider = createMockProvider()

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    expect(() => agent.clearOverlays()).not.toThrow()
  })

  it('emits analyze-complete after successful provider call', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const result = {
      explanation: 'Support at 100',
      priceLines: [{ price: 100, title: 'Support' }],
    }
    const provider = createMockProvider(result)

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onComplete = vi.fn()
    agent.on('analyze-complete', onComplete)

    // Simulate drag selection
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, bubbles: true }))

    // Find and submit prompt via the input element
    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'Find support levels'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      // Wait for async provider call
      await vi.waitFor(() => {
        expect(provider.analyze).toHaveBeenCalled()
      })
      await vi.waitFor(() => {
        expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ explanation: 'Support at 100' }))
      })
    }

    el.remove()
  })

  it('emits error when provider rejects', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider: LLMProvider = {
      analyze: vi.fn().mockRejectedValue(new Error('API failed')),
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onError = vi.fn()
    agent.on('error', onError)

    // Simulate drag selection
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, bubbles: true }))

    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'test'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

      await vi.waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'API failed' }))
      })
    }

    el.remove()
  })

  it('swallows AbortError when request is cancelled', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider: LLMProvider = {
      analyze: vi.fn().mockImplementation((_ctx, _prompt, signal) => {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            const err = new Error('Aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      }),
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onError = vi.fn()
    agent.on('error', onError)

    // First drag selection and submit
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, bubbles: true }))

    const input = el.querySelector('input') as HTMLInputElement
    if (input) {
      input.value = 'test'
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    }

    // New drag selection while request is in-flight — triggers abort
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 20, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mousemove', { clientX: 60, bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { clientX: 60, bubbles: true }))

    // AbortError should be swallowed, not emitted
    await new Promise((r) => setTimeout(r, 50))
    expect(onError).not.toHaveBeenCalled()

    el.remove()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/agent-overlay.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/core/agent-overlay.ts

import type {
  AgentOverlay,
  AgentOverlayEventMap,
  AgentOverlayOptions,
  AnalysisResult,
} from './types'
import { createEventEmitter } from './event-emitter'
import { RangeSelector } from './selection/range-selector'
import { buildChartContext } from './selection/context-builder'
import { OverlayRenderer } from './overlay/overlay-renderer'
import { PromptInput } from './ui/prompt-input'
import { ExplanationPopup } from './ui/explanation-popup'

interface ChartLike {
  timeScale(): {
    coordinateToTime(x: number): unknown
    timeToCoordinate(time: unknown): number | null
  }
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
  data(): readonly Record<string, unknown>[]
}

function validateResult(raw: unknown): AnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid analysis result: expected an object')
  }
  const obj = raw as Record<string, unknown>

  return {
    ...(typeof obj.explanation === 'string' && { explanation: obj.explanation }),
    ...(Array.isArray(obj.priceLines) && { priceLines: obj.priceLines }),
    ...(Array.isArray(obj.markers) && { markers: obj.markers }),
  }
}

export function createAgentOverlay(
  chart: ChartLike,
  series: SeriesLike,
  options: AgentOverlayOptions,
): AgentOverlay {
  const emitter = createEventEmitter<AgentOverlayEventMap>()
  const rangeSelector = new RangeSelector(chart as never, series as never)
  const renderer = new OverlayRenderer(series as never)
  const chartEl = chart.chartElement()
  const theme = options.ui?.theme ?? 'dark'

  // Ensure container supports absolute positioning for UI overlays
  if (getComputedStyle(chartEl).position === 'static') {
    chartEl.style.position = 'relative'
  }

  const promptInput = new PromptInput(chartEl, theme)
  const explanationPopup = new ExplanationPopup(chartEl, theme)

  let abortController: AbortController | null = null

  rangeSelector.onSelect = (range) => {
    // Cancel any in-flight request
    abortController?.abort()
    abortController = null

    // Hide previous UI
    promptInput.hide()
    explanationPopup.hide()

    // Show prompt input near the selection
    const fromX = chart.timeScale().timeToCoordinate(range.from)
    const placement = options.ui?.promptPlacement ?? 'top'
    const y = placement === 'top' ? 8 : chartEl.clientHeight - 48
    const x = fromX ?? 100

    promptInput.show({ x, y })
  }

  promptInput.onSubmit = async (prompt: string) => {
    promptInput.setLoading(true)
    emitter.emit('analyze-start')

    abortController = new AbortController()

    try {
      const seriesData = series.data() as never[]
      const currentRange = rangeSelector.getRange()

      if (!currentRange) {
        throw new Error('No selection range available')
      }

      const context = buildChartContext(
        seriesData,
        currentRange as never,
        options.dataAccessor,
      )

      const rawResult = await options.provider.analyze(context, prompt, abortController.signal)
      const result = validateResult(rawResult)

      renderer.render(result)

      if (result.explanation) {
        const fromX = chart.timeScale().timeToCoordinate(currentRange.from)
        explanationPopup.show(result.explanation, {
          x: (fromX ?? 100) as number,
          y: (options.ui?.promptPlacement === 'bottom' ? 8 : chartEl.clientHeight - 220),
        })
      }

      promptInput.hide()
      emitter.emit('analyze-complete', result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        promptInput.setLoading(false)
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      abortController = null
    }
  }

  promptInput.onCancel = () => {
    abortController?.abort()
    abortController = null
    rangeSelector.clearSelection()
  }

  return {
    destroy() {
      abortController?.abort()
      rangeSelector.destroy()
      promptInput.destroy()
      explanationPopup.destroy()
      renderer.clear()
      emitter.removeAll()
    },

    clearOverlays() {
      renderer.clear()
      explanationPopup.hide()
    },

    on<K extends keyof AgentOverlayEventMap>(
      event: K,
      handler: AgentOverlayEventMap[K],
    ): () => void {
      return emitter.on(event, handler)
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/agent-overlay.test.ts`

Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: add createAgentOverlay orchestrator"
```

---

### Task 12a: Extract shared JSON parser for providers

**Files:**
- Create: `src/providers/parse-response.ts`
- Test: `src/providers/parse-response.test.ts`

Shared utility for extracting JSON from LLM text responses.

- [ ] **Step 1: Write failing tests**

```ts
// src/providers/parse-response.test.ts
import { extractJsonFromText } from './parse-response'

describe('extractJsonFromText', () => {
  it('parses clean JSON', () => {
    const result = extractJsonFromText('{"price": 100}')
    expect(result).toEqual({ price: 100 })
  })

  it('extracts JSON from surrounding text', () => {
    const result = extractJsonFromText('Here is the result: {"price": 100} hope that helps')
    expect(result).toEqual({ price: 100 })
  })

  it('handles JSON in markdown code fences', () => {
    const result = extractJsonFromText('```json\n{"price": 100}\n```')
    expect(result).toEqual({ price: 100 })
  })

  it('throws on completely invalid input', () => {
    expect(() => extractJsonFromText('no json here')).toThrow('Failed to parse')
  })

  it('throws on empty string', () => {
    expect(() => extractJsonFromText('')).toThrow('Failed to parse')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/providers/parse-response.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/providers/parse-response.ts

export function extractJsonFromText(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Try to find JSON object in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 100)}`)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/providers/parse-response.test.ts`

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/providers/parse-response.ts src/providers/parse-response.test.ts
git commit -m "feat: add shared JSON parser for LLM responses"
```

---

### Task 12b: Implement Anthropic provider

**Files:**
- Create: `src/providers/anthropic.ts`
- Test: `src/providers/anthropic.test.ts`

Built-in provider that calls the Anthropic API directly from the browser.

- [ ] **Step 1: Write failing tests**

```ts
// src/providers/anthropic.test.ts
import { createAnthropicProvider } from './anthropic'
import type { ChartContext } from '../core/types'

const MOCK_CONTEXT: ChartContext = {
  timeRange: { from: 1000, to: 3000 },
  data: [
    { time: 1000, open: 100, high: 110, low: 90, close: 105 },
    { time: 2000, open: 105, high: 115, low: 95, close: 110 },
  ],
}

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('calls fetch with correct Anthropic API shape', async () => {
    const mockResponse = {
      explanation: 'Support at 100',
      priceLines: [{ price: 100, title: 'Support' }],
    }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    const result = await provider.analyze(MOCK_CONTEXT, 'Find support levels')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )

    expect(result.priceLines).toHaveLength(1)
    expect(result.priceLines![0].price).toBe(100)
  })

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    })

    const provider = createAnthropicProvider({ apiKey: 'bad-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Anthropic API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: '{}' }],
      }),
    })

    const controller = new AbortController()
    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    await provider.analyze(MOCK_CONTEXT, 'test', controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('handles malformed JSON from LLM gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Failed to parse')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/providers/anthropic.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/providers/anthropic.ts

import type { LLMProvider, ChartContext, AnalysisResult } from '../core/types'
import { extractJsonFromText } from './parse-response'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const API_URL = 'https://api.anthropic.com/v1/messages'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

You MUST respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "explanation": "string - brief analysis in the user's language",
  "priceLines": [{ "price": number, "title": string, "color": string, "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": number_or_string, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": string, "color": string }]
}

Only include priceLines and markers that are relevant to the user's request. All fields except "price" (for priceLines) and "time"/"position"/"shape" (for markers) are optional.`

interface AnthropicProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return {
    async analyze(context: ChartContext, prompt: string, signal?: AbortSignal): Promise<AnalysisResult> {
      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': options.apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/providers/anthropic.test.ts`

Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic.ts src/providers/anthropic.test.ts
git commit -m "feat: add built-in Anthropic provider"
```

---

### Task 13: Implement OpenAI provider

**Files:**
- Create: `src/providers/openai.ts`
- Test: `src/providers/openai.test.ts`

Same pattern as Anthropic but for OpenAI's chat completions API.

- [ ] **Step 1: Write failing tests**

```ts
// src/providers/openai.test.ts
import { createOpenAIProvider } from './openai'
import type { ChartContext } from '../core/types'

const MOCK_CONTEXT: ChartContext = {
  timeRange: { from: 1000, to: 3000 },
  data: [
    { time: 1000, open: 100, high: 110, low: 90, close: 105 },
  ],
}

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key' })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('calls OpenAI chat completions API', async () => {
    const mockResponse = { explanation: 'Bearish trend' }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify(mockResponse) } }],
      }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key' })
    const result = await provider.analyze(MOCK_CONTEXT, 'Analyze trend')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    )

    expect(result.explanation).toBe('Bearish trend')
  })

  it('throws on non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    })

    const provider = createOpenAIProvider({ apiKey: 'bad-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('OpenAI API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: '{}' } }],
      }),
    })

    const controller = new AbortController()
    const provider = createOpenAIProvider({ apiKey: 'test-key' })
    await provider.analyze(MOCK_CONTEXT, 'test', controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('handles malformed JSON from LLM gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: 'not valid json {{{' } }],
      }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Failed to parse')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/providers/openai.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```ts
// src/providers/openai.ts

import type { LLMProvider, ChartContext, AnalysisResult } from '../core/types'
import { extractJsonFromText } from './parse-response'

const DEFAULT_MODEL = 'gpt-4o-mini'
const API_URL = 'https://api.openai.com/v1/chat/completions'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

You MUST respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "explanation": "string - brief analysis in the user's language",
  "priceLines": [{ "price": number, "title": string, "color": string, "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": number_or_string, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": string, "color": string }]
}

Only include priceLines and markers that are relevant to the user's request.`

interface OpenAIProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
  readonly baseURL?: string
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL

  return {
    async analyze(context: ChartContext, prompt: string, signal?: AbortSignal): Promise<AnalysisResult> {
      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(baseURL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 1024,
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content ?? ''

      return extractJsonFromText(text) as AnalysisResult
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/providers/openai.test.ts`

Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai.ts src/providers/openai.test.ts
git commit -m "feat: add built-in OpenAI provider"
```

---

## Chunk 6: Entry Points, React Hook & Examples

### Task 14: Create entry points

**Files:**
- Create: `src/index.ts`
- Create: `src/react/index.ts`

- [ ] **Step 1: Create core entry point**

```ts
// src/index.ts
export { createAgentOverlay } from './core/agent-overlay'
export type {
  AgentOverlay,
  AgentOverlayOptions,
  AgentOverlayUIOptions,
  AgentOverlayEventMap,
  LLMProvider,
  ChartContext,
  AnalysisResult,
  OHLCData,
  TimeValue,
  PriceLineAction,
  MarkerAction,
  DataAccessor,
} from './core/types'
```

- [ ] **Step 2: Create react entry point (placeholder — hook added next task)**

```ts
// src/react/index.ts
export { useAgentOverlay } from './use-agent-overlay'
```

- [ ] **Step 3: Verify build compiles**

Run: `pnpm build`

Expected: `dist/` created with `index.js`, `index.cjs`, `index.d.ts` etc. May warn about missing react module — that's OK, we create it next.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts src/react/index.ts
git commit -m "feat: add package entry points"
```

---

### Task 15: Implement useAgentOverlay React hook

**Files:**
- Create: `src/react/use-agent-overlay.ts`
- Test: `src/react/use-agent-overlay.test.ts`

Thin wrapper that calls `createAgentOverlay` in a `useEffect` and exposes React state.

- [ ] **Step 1: Write failing tests**

```ts
// src/react/use-agent-overlay.test.ts
import { renderHook } from '@testing-library/react'
import { useAgentOverlay } from './use-agent-overlay'
import { createAgentOverlay } from '../core/agent-overlay'
import type { LLMProvider } from '../core/types'

// Note: install @testing-library/react as devDependency before running
// pnpm add -D @testing-library/react

// Mock the core module
vi.mock('../core/agent-overlay', () => ({
  createAgentOverlay: vi.fn(() => ({
    destroy: vi.fn(),
    clearOverlays: vi.fn(),
    on: vi.fn((_event: string, _handler: Function) => {
      return () => {}
    }),
  })),
}))

const mockCreateAgentOverlay = vi.mocked(createAgentOverlay)

const mockProvider: LLMProvider = {
  analyze: vi.fn().mockResolvedValue({}),
}

describe('useAgentOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() =>
      useAgentOverlay(null, null, { provider: mockProvider }),
    )

    expect(result.current.clearOverlays).toBeInstanceOf(Function)
    expect(result.current.isAnalyzing).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('does not create agent when chart is null', () => {
    renderHook(() => useAgentOverlay(null, null, { provider: mockProvider }))

    expect(mockCreateAgentOverlay).not.toHaveBeenCalled()
  })

  it('creates agent when chart and series are provided', () => {
    const mockChart = {} as never
    const mockSeries = {} as never

    renderHook(() =>
      useAgentOverlay(mockChart, mockSeries, { provider: mockProvider }),
    )

    expect(mockCreateAgentOverlay).toHaveBeenCalledOnce()
  })

  it('cleans up on unmount', () => {
    const mockChart = {} as never
    const mockSeries = {} as never

    const { unmount } = renderHook(() =>
      useAgentOverlay(mockChart, mockSeries, { provider: mockProvider }),
    )

    const agent = mockCreateAgentOverlay.mock.results[0]?.value

    unmount()

    expect(agent?.destroy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Install @testing-library/react**

Run: `pnpm add -D @testing-library/react`

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test -- src/react/use-agent-overlay.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation**

```ts
// src/react/use-agent-overlay.ts

import { useEffect, useRef, useState, useCallback } from 'react'
import { createAgentOverlay } from '../core/agent-overlay'
import type {
  AgentOverlay,
  AgentOverlayOptions,
  AnalysisResult,
} from '../core/types'

interface ChartLike {
  timeScale(): unknown
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
  data(): readonly Record<string, unknown>[]
}

interface UseAgentOverlayReturn {
  clearOverlays: () => void
  isAnalyzing: boolean
  error: Error | null
  lastResult: AnalysisResult | null
}

export function useAgentOverlay(
  chart: ChartLike | null,
  series: SeriesLike | null,
  options: AgentOverlayOptions,
): UseAgentOverlayReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null)
  const agentRef = useRef<AgentOverlay | null>(null)

  useEffect(() => {
    if (!chart || !series) return

    const agent = createAgentOverlay(chart as never, series as never, options)
    agentRef.current = agent

    const unsubStart = agent.on('analyze-start', () => {
      setIsAnalyzing(true)
      setError(null)
    })

    const unsubComplete = agent.on('analyze-complete', (result) => {
      setIsAnalyzing(false)
      setLastResult(result)
    })

    const unsubError = agent.on('error', (err) => {
      setIsAnalyzing(false)
      setError(err)
    })

    return () => {
      unsubStart()
      unsubComplete()
      unsubError()
      agent.destroy()
      agentRef.current = null
    }
  }, [chart, series, options.provider])

  const clearOverlays = useCallback(() => {
    agentRef.current?.clearOverlays()
    setLastResult(null)
  }, [])

  return { clearOverlays, isAnalyzing, error, lastResult }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test -- src/react/use-agent-overlay.test.ts`

Expected: PASS — all 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/react/use-agent-overlay.ts src/react/use-agent-overlay.test.ts
git commit -m "feat: add useAgentOverlay React hook"
```

---

### Task 16: Create vanilla example

**Files:**
- Create: `examples/vanilla/index.html`
- Create: `examples/vanilla/main.ts`

A minimal working demo that imports the library and shows the full flow.

- [ ] **Step 1: Create example HTML**

```html
<!-- examples/vanilla/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lightweight Chart Agent Overlay — Demo</title>
  <style>
    body { margin: 0; background: #131722; font-family: system-ui; }
    #chart { width: 100vw; height: 100vh; position: relative; }
    .instructions {
      position: fixed; top: 8px; left: 50%; transform: translateX(-50%);
      color: #888; font-size: 13px; z-index: 10; pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="instructions">Drag to select a range, then type your question</div>
  <div id="chart"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create example main.ts**

```ts
// examples/vanilla/main.ts
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { createAgentOverlay } from '../../src/index'
import { createAnthropicProvider } from '../../src/providers/anthropic'

const container = document.getElementById('chart')!

const chart = createChart(container, {
  layout: {
    background: { color: '#131722' },
    textColor: '#d1d4dc',
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
})

const series = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
})

// Generate sample data
const data = []
let time = new Date('2024-01-01').getTime() / 1000
let close = 100
for (let i = 0; i < 200; i++) {
  const open = close + (Math.random() - 0.5) * 5
  const high = Math.max(open, close) + Math.random() * 3
  const low = Math.min(open, close) - Math.random() * 3
  close = open + (Math.random() - 0.5) * 8
  data.push({ time: time + i * 86400, open, high, low, close })
}

series.setData(data as never[])
chart.timeScale().fitContent()

// Initialize agent overlay
// Replace with your actual API key to test
const provider = createAnthropicProvider({
  apiKey: 'YOUR_API_KEY_HERE',
})

const agent = createAgentOverlay(chart as never, series as never, {
  provider,
})

agent.on('analyze-start', () => console.log('Analysis started...'))
agent.on('analyze-complete', (result) => console.log('Analysis complete:', result))
agent.on('error', (err) => console.error('Analysis error:', err))
```

- [ ] **Step 3: Verify dev server runs**

Run: `pnpm dev`

Expected: Vite starts at `http://localhost:5173`, page shows a candlestick chart with dark theme.

- [ ] **Step 4: Commit**

```bash
git add examples/vanilla/
git commit -m "feat: add vanilla JS example"
```

---

### Task 17: Final build verification and full test run

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

Expected: All tests pass.

- [ ] **Step 2: Run coverage**

Run: `pnpm test:coverage`

Expected: Coverage ≥ 80% across all metrics.

- [ ] **Step 3: Run lint and format check**

Run: `pnpm check`

Expected: No lint errors, format is correct, types check out.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: `dist/` contains all entry points:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`
- `dist/react/index.js`, `dist/react/index.cjs`, `dist/react/index.d.ts`
- `dist/providers/anthropic.js`, `dist/providers/anthropic.cjs`
- `dist/providers/openai.js`, `dist/providers/openai.cjs`

- [ ] **Step 5: Fix any issues found**

If tests/lint/build fail, fix and re-run until green.

- [ ] **Step 6: Commit final adjustments**

```bash
git add -A
git commit -m "chore: fix build and test issues"
```
