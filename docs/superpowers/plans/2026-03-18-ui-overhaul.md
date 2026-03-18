# UI Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul prompt input (Cursor-style), explanation popup (structured sections + history nav), add history system, PromptBuilder abstraction, and provider model/preset support.

**Architecture:** Bottom-up — new interfaces and logic modules first, then UI components, then orchestrator wiring. Each task produces a working, testable unit. Existing tests must continue passing at every commit.

**Tech Stack:** TypeScript, vitest (jsdom), vanilla DOM, lightweight-charts v5

**Spec:** `docs/superpowers/specs/2026-03-18-ui-overhaul-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `src/core/prompt-builder.ts` | `PromptBuilder` interface + `defaultPromptBuilder` impl |
| `src/core/prompt-builder.test.ts` | Tests for prompt builder |
| `src/core/history-store.ts` | In-memory history store (push, get, navigate, cap at 50) |
| `src/core/history-store.test.ts` | Tests for history store |
| `src/core/ui/dropdown.ts` | Reusable dropdown component (single-select + multi-select) |
| `src/core/ui/dropdown.test.ts` | Tests for dropdown |
| `src/core/ui/history-button.ts` | Persistent chart corner button with badge |
| `src/core/ui/history-button.test.ts` | Tests for history button |
| `src/core/validate-result.ts` | Extracted validateResult with structured explanation support |
| `src/core/validate-result.test.ts` | Tests for validate-result |

### Modified Files
| File | Changes |
|------|---------|
| `src/core/types.ts` | Add ExplanationSection, NormalizedExplanation, NormalizedAnalysisResult, ModelOption, AnalyzeOptions, AnalysisPreset, PromptBuildParams, PromptBuildResult, PromptBuilder, HistoryEntry. Update LLMProvider, AgentOverlayOptions, AnalysisResult. |
| `src/index.ts` | Export new public types and `defaultPromptBuilder` |
| `src/core/agent-overlay.ts` | Major rewrite: wire PromptBuilder, HistoryStore, HistoryButton, pass AnalyzeOptions to provider, handle history navigation |
| `src/core/selection/range-selector.ts` | Add `setRange()` method (pure visual, no callbacks) |
| `src/core/ui/prompt-input.ts` | Major rewrite: textarea, toolbar, model/preset dropdowns, error display |
| `src/core/ui/explanation-popup.ts` | Major rewrite: structured sections, prompt context, history nav |
| `src/providers/anthropic.ts` | Add `models` property, handle `options.model` and `options.additionalSystemPrompt`, update system prompt for structured sections |
| `src/providers/openai.ts` | Same changes as anthropic.ts |
| `examples/vanilla/main.ts` | Add models and presets configuration |

---

## Phase 1: Foundation (Interfaces & Logic)

### Task 1: Update Type Interfaces

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add new type interfaces**

Add to `src/core/types.ts` after the existing types:

```ts
// --- Explanation (structured) ---

export interface ExplanationSection {
  readonly label: string
  readonly content: string
}

export interface NormalizedExplanation {
  readonly sections: readonly ExplanationSection[]
}

export interface NormalizedAnalysisResult {
  readonly explanation?: NormalizedExplanation
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}

// --- Model ---

export interface ModelOption {
  readonly id: string
  readonly label: string
}

// --- Analyze Options ---

export interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
}

// --- Presets ---

export interface AnalysisPreset {
  readonly label: string
  readonly systemPrompt: string
  readonly defaultPrompt: string
}

// --- Prompt Builder ---

export interface PromptBuildParams {
  readonly userPrompt: string
  readonly selectedPresets: readonly AnalysisPreset[]
  readonly isQuickRun: boolean
}

export interface PromptBuildResult {
  readonly prompt: string
  readonly additionalSystemPrompt: string
}

export interface PromptBuilder {
  build(params: PromptBuildParams): PromptBuildResult
}

// --- History ---

export interface HistoryEntry {
  readonly prompt: string
  readonly isQuickRun: boolean
  readonly model?: string
  readonly presets: readonly AnalysisPreset[]
  readonly result: NormalizedAnalysisResult
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
}
```

- [ ] **Step 2: Update AnalysisResult to accept structured explanation**

Change the existing `AnalysisResult` interface:

```ts
export interface AnalysisResult {
  readonly explanation?: string | { sections: readonly ExplanationSection[] }
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}
```

- [ ] **Step 3: Update LLMProvider interface**

```ts
export interface LLMProvider {
  readonly models?: readonly ModelOption[]
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
}
```

- [ ] **Step 4: Update AgentOverlayOptions**

```ts
export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly dataAccessor?: DataAccessor
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly ui?: AgentOverlayUIOptions
}
```

- [ ] **Step 5: Update `src/index.ts` exports**

Add new public types to `src/index.ts`:

```ts
export type {
  ExplanationSection,
  ModelOption,
  AnalyzeOptions,
  AnalysisPreset,
  PromptBuildParams,
  PromptBuildResult,
  PromptBuilder,
  HistoryEntry,
} from './core/types'

// defaultPromptBuilder will be exported after Task 2 creates it:
// export { defaultPromptBuilder } from './core/prompt-builder'
```

Note: `NormalizedExplanation` and `NormalizedAnalysisResult` are internal types — do NOT export them.

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: Type errors in providers and agent-overlay (they don't accept `options` yet). Tests should still compile since `options` is optional on the new interface.

- [ ] **Step 7: Commit**

```bash
git add src/core/types.ts src/index.ts
git commit -m "feat: add new type interfaces for UI overhaul"
```

---

### Task 2: PromptBuilder

**Files:**
- Create: `src/core/prompt-builder.ts`
- Create: `src/core/prompt-builder.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/prompt-builder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { defaultPromptBuilder } from './prompt-builder'
import type { AnalysisPreset } from './types'

const PRESETS: readonly AnalysisPreset[] = [
  { label: 'Technical', systemPrompt: 'Focus on technical analysis.', defaultPrompt: 'Analyze technicals' },
  { label: 'Fundamental', systemPrompt: 'Focus on fundamentals.', defaultPrompt: 'Analyze fundamentals' },
]

describe('defaultPromptBuilder', () => {
  it('should return user prompt for custom prompt mode', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'What is the trend?',
      selectedPresets: PRESETS,
      isQuickRun: false,
    })
    expect(result.prompt).toBe('What is the trend?')
  })

  it('should merge preset systemPrompts with double newline', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'test',
      selectedPresets: PRESETS,
      isQuickRun: false,
    })
    expect(result.additionalSystemPrompt).toBe(
      'Focus on technical analysis.\n\nFocus on fundamentals.',
    )
  })

  it('should concatenate defaultPrompts for quick run', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: PRESETS,
      isQuickRun: true,
    })
    expect(result.prompt).toBe('Analyze technicals\n\nAnalyze fundamentals')
  })

  it('should return empty strings when no presets selected', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'test',
      selectedPresets: [],
      isQuickRun: false,
    })
    expect(result.prompt).toBe('test')
    expect(result.additionalSystemPrompt).toBe('')
  })

  it('should return empty prompt for quick run with no presets', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: [],
      isQuickRun: true,
    })
    expect(result.prompt).toBe('')
    expect(result.additionalSystemPrompt).toBe('')
  })

  it('should handle single preset', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: [PRESETS[0]],
      isQuickRun: true,
    })
    expect(result.prompt).toBe('Analyze technicals')
    expect(result.additionalSystemPrompt).toBe('Focus on technical analysis.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/prompt-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement defaultPromptBuilder**

Create `src/core/prompt-builder.ts`:

```ts
import type { PromptBuilder, PromptBuildParams, PromptBuildResult } from './types'

export const defaultPromptBuilder: PromptBuilder = {
  build(params: PromptBuildParams): PromptBuildResult {
    const { userPrompt, selectedPresets, isQuickRun } = params

    const additionalSystemPrompt = selectedPresets
      .map((p) => p.systemPrompt)
      .join('\n\n')

    const prompt = isQuickRun
      ? selectedPresets.map((p) => p.defaultPrompt).join('\n\n')
      : userPrompt

    return { prompt, additionalSystemPrompt }
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/prompt-builder.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/prompt-builder.ts src/core/prompt-builder.test.ts
git commit -m "feat: add PromptBuilder interface and defaultPromptBuilder"
```

---

### Task 3: HistoryStore

**Files:**
- Create: `src/core/history-store.ts`
- Create: `src/core/history-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/history-store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { createHistoryStore } from './history-store'
import type { HistoryEntry } from './types'

function makeEntry(prompt: string): HistoryEntry {
  return {
    prompt,
    isQuickRun: false,
    presets: [],
    result: {},
    range: { from: 1, to: 2 },
  }
}

describe('createHistoryStore', () => {
  it('should start empty', () => {
    const store = createHistoryStore()
    expect(store.getAll()).toEqual([])
    expect(store.size()).toBe(0)
  })

  it('should push and retrieve entries', () => {
    const store = createHistoryStore()
    const entry = makeEntry('test')
    store.push(entry)
    expect(store.size()).toBe(1)
    expect(store.getAll()[0]).toBe(entry)
  })

  it('should get entry by index', () => {
    const store = createHistoryStore()
    const e1 = makeEntry('first')
    const e2 = makeEntry('second')
    store.push(e1)
    store.push(e2)
    expect(store.get(0)).toBe(e1)
    expect(store.get(1)).toBe(e2)
  })

  it('should return undefined for out-of-bounds index', () => {
    const store = createHistoryStore()
    expect(store.get(0)).toBeUndefined()
    expect(store.get(-1)).toBeUndefined()
  })

  it('should return latest entry', () => {
    const store = createHistoryStore()
    store.push(makeEntry('first'))
    store.push(makeEntry('second'))
    expect(store.latest()?.prompt).toBe('second')
  })

  it('should return undefined for latest when empty', () => {
    const store = createHistoryStore()
    expect(store.latest()).toBeUndefined()
  })

  it('should cap at maxEntries and drop oldest', () => {
    const store = createHistoryStore(3)
    store.push(makeEntry('a'))
    store.push(makeEntry('b'))
    store.push(makeEntry('c'))
    store.push(makeEntry('d'))
    expect(store.size()).toBe(3)
    expect(store.get(0)?.prompt).toBe('b')
    expect(store.get(2)?.prompt).toBe('d')
  })

  it('should clear all entries', () => {
    const store = createHistoryStore()
    store.push(makeEntry('a'))
    store.push(makeEntry('b'))
    store.clear()
    expect(store.size()).toBe(0)
    expect(store.getAll()).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/history-store.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement HistoryStore**

Create `src/core/history-store.ts`:

```ts
import type { HistoryEntry } from './types'

export interface HistoryStore {
  push(entry: HistoryEntry): void
  get(index: number): HistoryEntry | undefined
  latest(): HistoryEntry | undefined
  getAll(): readonly HistoryEntry[]
  size(): number
  clear(): void
}

const DEFAULT_MAX_ENTRIES = 50

export function createHistoryStore(maxEntries = DEFAULT_MAX_ENTRIES): HistoryStore {
  let entries: HistoryEntry[] = []

  return {
    push(entry) {
      const next = [...entries, entry]
      entries = next.length > maxEntries ? next.slice(next.length - maxEntries) : next
    },

    get(index) {
      if (index < 0 || index >= entries.length) return undefined
      return entries[index]
    },

    latest() {
      return entries.length > 0 ? entries[entries.length - 1] : undefined
    },

    getAll() {
      return entries
    },

    size() {
      return entries.length
    },

    clear() {
      entries = []
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/history-store.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/history-store.ts src/core/history-store.test.ts
git commit -m "feat: add in-memory HistoryStore with cap support"
```

---

### Task 4: RangeSelector.setRange()

**Files:**
- Modify: `src/core/selection/range-selector.ts`
- Modify: `src/core/selection/range-selector.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/core/selection/range-selector.test.ts`:

```ts
it('setRange should set selection highlight without triggering callbacks', () => {
  const onSelect = vi.fn()
  const onDismiss = vi.fn()
  selector.onSelect = onSelect
  selector.onDismiss = onDismiss

  selector.setRange({ from: 100, to: 200 })

  expect(selector.getRange()).toEqual({ from: 100, to: 200 })
  expect(onSelect).not.toHaveBeenCalled()
  expect(onDismiss).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/core/selection/range-selector.test.ts`
Expected: FAIL — `setRange is not a function`

- [ ] **Step 3: Implement setRange**

Add to `RangeSelector` class in `src/core/selection/range-selector.ts`:

```ts
setRange(range: { from: TimeValue; to: TimeValue }): void {
  this.primitive.setRange(range)
}
```

This calls the existing `SelectionPrimitive.setRange()` which already handles the highlight rendering. It does NOT trigger `onSelect`/`onDismiss`, does NOT change `_enabled`, does NOT call `applyOptions`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/selection/range-selector.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/selection/range-selector.ts src/core/selection/range-selector.test.ts
git commit -m "feat: add setRange() to RangeSelector for history navigation"
```

---

### Task 5: Update validateResult for Structured Explanation

**Files:**
- Modify: `src/core/agent-overlay.ts` (the `validateResult` function)
- Modify: `src/core/agent-overlay.test.ts`

- [ ] **Step 1: Write failing tests for new validation cases**

Add to `src/core/agent-overlay.test.ts` (or create a dedicated test file if preferred — check existing structure). Add tests for the `validateResult` function. Since `validateResult` is not exported, test it indirectly through the full flow, or extract it. For testability, extract `validateResult` to a separate file.

Create `src/core/validate-result.ts`:

```ts
import type { AnalysisResult, NormalizedAnalysisResult, NormalizedExplanation } from './types'

function isValidPriceLine(item: unknown): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>).price === 'number'
  )
}

function isValidMarker(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const m = item as Record<string, unknown>
  return m.time != null && typeof m.position === 'string' && typeof m.shape === 'string'
}

function normalizeExplanation(raw: unknown): NormalizedExplanation | undefined {
  if (typeof raw === 'string') {
    return raw.trim() ? { sections: [{ label: 'Analysis', content: raw }] } : undefined
  }

  if (typeof raw !== 'object' || raw === null) return undefined

  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.sections)) return undefined

  const validSections = obj.sections.filter(
    (s: unknown) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Record<string, unknown>).label === 'string' &&
      typeof (s as Record<string, unknown>).content === 'string',
  )

  return validSections.length > 0 ? { sections: validSections } : undefined
}

export function validateResult(raw: unknown): NormalizedAnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid analysis result: expected an object')
  }
  const obj = raw as Record<string, unknown>

  const explanation = normalizeExplanation(obj.explanation)
  const priceLines = Array.isArray(obj.priceLines)
    ? obj.priceLines.filter(isValidPriceLine)
    : undefined
  const markers = Array.isArray(obj.markers) ? obj.markers.filter(isValidMarker) : undefined

  return {
    ...(explanation && { explanation }),
    ...(priceLines && priceLines.length > 0 && { priceLines }),
    ...(markers && markers.length > 0 && { markers }),
  }
}
```

Create `src/core/validate-result.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateResult } from './validate-result'

describe('validateResult', () => {
  it('should wrap string explanation in sections', () => {
    const result = validateResult({ explanation: 'hello' })
    expect(result.explanation).toEqual({
      sections: [{ label: 'Analysis', content: 'hello' }],
    })
  })

  it('should pass through valid structured sections', () => {
    const result = validateResult({
      explanation: { sections: [{ label: 'Tech', content: 'support at 100' }] },
    })
    expect(result.explanation?.sections).toHaveLength(1)
    expect(result.explanation?.sections[0].label).toBe('Tech')
  })

  it('should filter out sections missing label or content', () => {
    const result = validateResult({
      explanation: {
        sections: [
          { label: 'Good', content: 'valid' },
          { label: 'Bad' },
          { content: 'no label' },
        ],
      },
    })
    expect(result.explanation?.sections).toHaveLength(1)
  })

  it('should return undefined for empty sections array', () => {
    const result = validateResult({ explanation: { sections: [] } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for null explanation', () => {
    const result = validateResult({ explanation: null })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for numeric explanation', () => {
    const result = validateResult({ explanation: 123 })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for sections that is not an array', () => {
    const result = validateResult({ explanation: { sections: 'not array' } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for object without sections key', () => {
    const result = validateResult({ explanation: { other: 'value' } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for empty string explanation', () => {
    const result = validateResult({ explanation: '' })
    expect(result.explanation).toBeUndefined()
  })

  it('should still validate priceLines and markers', () => {
    const result = validateResult({
      priceLines: [{ price: 100 }, { notPrice: true }],
      markers: [{ time: 1, position: 'aboveBar', shape: 'circle' }],
    })
    expect(result.priceLines).toHaveLength(1)
    expect(result.markers).toHaveLength(1)
  })

  it('should throw for non-object input', () => {
    expect(() => validateResult(null)).toThrow()
    expect(() => validateResult('string')).toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/validate-result.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create validate-result.ts with implementation above**

Write the file as shown in Step 1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/validate-result.test.ts`
Expected: 12 tests PASS

- [ ] **Step 5: Update agent-overlay.ts to import from validate-result.ts**

In `src/core/agent-overlay.ts`, replace the inline `validateResult`, `isValidPriceLine`, and `isValidMarker` functions with:

```ts
import { validateResult } from './validate-result'
```

Remove the three inline functions. The return type changes from `AnalysisResult` to `NormalizedAnalysisResult`.

- [ ] **Step 6: Update OverlayRenderer to accept NormalizedAnalysisResult**

In `src/core/overlay/overlay-renderer.ts`, update the `render()` method type annotation to accept `NormalizedAnalysisResult` (or use a compatible type). Since `render()` only reads `priceLines` and `markers` (ignores `explanation`), a minimal type like `{ priceLines?: ...; markers?: ... }` works. Import `NormalizedAnalysisResult` from types and use it.

- [ ] **Step 7: Fix agent-overlay.test.ts for normalized explanation**

The existing test at `src/core/agent-overlay.test.ts` expects `explanation: 'Support at 100'` (string) in analyze-complete events. After normalization, this becomes `explanation: { sections: [{ label: 'Analysis', content: 'Support at 100' }] }`. Update the mock provider return value and assertion to match.

Also update the mock provider in the test to return a `NormalizedAnalysisResult`-compatible result, or keep it returning a string and verify that `validateResult` normalizes it.

- [ ] **Step 8: Run all tests**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/core/validate-result.ts src/core/validate-result.test.ts src/core/agent-overlay.ts src/core/overlay/overlay-renderer.ts src/core/agent-overlay.test.ts
git commit -m "refactor: extract validateResult with structured explanation support"
```

> **Note:** This task modifies `agent-overlay.ts`. If running tasks in parallel, ensure this completes before Task 11 (Orchestrator Rewrite) begins, as Task 11 will further modify the same file.

---

### Task 6: Update Providers

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/openai.ts`
- Modify: `src/providers/anthropic.test.ts`
- Modify: `src/providers/openai.test.ts`

- [ ] **Step 1: Write failing tests for Anthropic provider**

Add to `src/providers/anthropic.test.ts`:

```ts
it('should expose models when provided', () => {
  const provider = createAnthropicProvider({
    apiKey: 'test',
    models: [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }],
  })
  expect(provider.models).toEqual([{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }])
})

it('should have undefined models when not provided', () => {
  const provider = createAnthropicProvider({ apiKey: 'test' })
  expect(provider.models).toBeUndefined()
})

it('should use options.model when provided', async () => {
  // ... mock fetch, call analyze with options: { model: 'claude-sonnet-4-6' }
  // verify the request body contains model: 'claude-sonnet-4-6'
})

it('should append additionalSystemPrompt to system prompt', async () => {
  // ... mock fetch, call analyze with options: { additionalSystemPrompt: 'Extra instructions' }
  // verify the request body system field contains the additional prompt
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/providers/anthropic.test.ts`
Expected: FAIL — `models` property doesn't exist, `options` parameter not accepted

- [ ] **Step 3: Update Anthropic provider**

In `src/providers/anthropic.ts`:

1. Add `models` to options interface:
```ts
interface AnthropicProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
  readonly models?: readonly ModelOption[]
}
```

2. Update `analyze` signature to accept `options?: AnalyzeOptions`.

3. Use `options?.model ?? model` for the model in the request.

4. Append `options?.additionalSystemPrompt` to the system prompt:
```ts
const finalSystemPrompt = options?.additionalSystemPrompt
  ? `${systemPrompt}\n\n${options.additionalSystemPrompt}`
  : systemPrompt
```

5. Expose `models` on the returned object:
```ts
return {
  models: options.models,
  async analyze(...) { ... }
}
```

6. Update the base system prompt to request structured explanation sections (add JSON schema for sections format).

- [ ] **Step 4: Run Anthropic tests**

Run: `pnpm vitest run src/providers/anthropic.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Apply same changes to OpenAI provider**

Mirror the Anthropic changes in `src/providers/openai.ts` and update `src/providers/openai.test.ts`.

- [ ] **Step 6: Run all provider tests**

Run: `pnpm vitest run src/providers/`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/providers/
git commit -m "feat: add models, model override, and additionalSystemPrompt to providers"
```

---

## Phase 2: UI Components

### Task 7: Dropdown Component

**Files:**
- Create: `src/core/ui/dropdown.ts`
- Create: `src/core/ui/dropdown.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/ui/dropdown.test.ts` with tests for:
- Single-select: renders options, selects one, closes on selection
- Multi-select: renders checkboxes, toggles on click, stays open
- Click-outside-to-close behavior
- Escape to close
- Dropdown button label updates on selection
- Multi-select label truncation (+N pattern)
- "Run" button in multi-select (disabled when none selected)

Key test cases:

```ts
describe('Dropdown', () => {
  describe('single-select', () => {
    it('should render options and select one')
    it('should close on selection')
    it('should update button label to selected option')
    it('should close on Escape')
  })

  describe('multi-select', () => {
    it('should render checkboxes')
    it('should toggle checkbox on click')
    it('should stay open after toggle')
    it('should show comma-separated labels for 2 selected')
    it('should show +N for 3+ selected')
    it('should show "—" when none selected')
    it('should have Run button disabled when none selected')
    it('should call onRun with selected items when Run clicked')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/dropdown.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Dropdown**

Create `src/core/ui/dropdown.ts`. The dropdown is a DOM-based component:

```ts
interface DropdownOptions<T> {
  readonly items: readonly T[]
  readonly getLabel: (item: T) => string
  readonly multiSelect?: boolean
  readonly onSelect?: (selected: readonly T[]) => void
  readonly onRun?: (selected: readonly T[]) => void
  readonly theme?: 'light' | 'dark'
}
```

Key implementation details:
- Creates a button element (trigger) + panel element (dropdown list)
- Panel is `position: absolute` below the button
- Single-select: click item → call `onSelect([item])` → close panel
- Multi-select: click item → toggle checkbox → update button label → stay open
- Button label: formats selected items with comma + `+N` truncation
- "Run" button at bottom of multi-select panel
- Click-outside: `document.addEventListener('mousedown', ...)` → close if target outside
- Escape: `document.addEventListener('keydown', ...)` → close
- Returns `{ element, getSelected, destroy }` — the `element` is the button to append to toolbar

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/dropdown.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/dropdown.ts src/core/ui/dropdown.test.ts
git commit -m "feat: add reusable Dropdown component (single + multi-select)"
```

---

### Task 8: Prompt Input Rewrite

**Files:**
- Modify: `src/core/ui/prompt-input.ts`
- Modify: `src/core/ui/prompt-input.test.ts`

- [ ] **Step 1: Write failing tests for new behavior**

Update `src/core/ui/prompt-input.test.ts` to test:
- Textarea (not input) is rendered
- Shift+Enter inserts newline (does not submit)
- Enter submits
- x button closes (fires onCancel)
- Model dropdown renders when models provided
- Preset dropdown renders when presets provided
- Neither dropdown renders when not configured
- Submit button active only when text present
- `onQuickRun` callback when preset "Run" clicked
- Error display (show/auto-dismiss)
- Loading state (progress bar, disabled textarea)
- `getSelectedModel()` returns current selection
- `getSelectedPresets()` returns current selections

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/prompt-input.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite PromptInput**

Rewrite `src/core/ui/prompt-input.ts`. Key structural changes:

```ts
interface PromptInputOptions {
  readonly models?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly theme?: 'light' | 'dark'
}

export class PromptInput {
  constructor(container: HTMLElement, options?: PromptInputOptions)

  show(position?: UIPosition): void
  hide(): void
  setLoading(loading: boolean): void
  showError(message: string): void
  getLastPosition(): UIPosition | null
  getSelectedModel(): string | undefined
  getSelectedPresets(): readonly AnalysisPreset[]
  destroy(): void

  onSubmit: ((prompt: string) => void) | null
  onCancel: (() => void) | null
  onQuickRun: ((presets: readonly AnalysisPreset[]) => void) | null
}
```

Layout: wrapper → textarea row (textarea + x button) → toolbar row (model dropdown + preset dropdown + submit button) → progress bar → error area.

Use `Dropdown` component for both model and preset selectors.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/prompt-input.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/prompt-input.ts src/core/ui/prompt-input.test.ts
git commit -m "feat: rewrite PromptInput with textarea, toolbar, and dropdowns"
```

---

### Task 9: Explanation Popup Rewrite

**Files:**
- Modify: `src/core/ui/explanation-popup.ts`
- Modify: `src/core/ui/explanation-popup.test.ts`

- [ ] **Step 1: Write failing tests for new behavior**

Update `src/core/ui/explanation-popup.test.ts` to test:
- Shows structured sections with labels and content
- Shows user prompt as chat bubble (right-aligned)
- Shows quick-run indicator bar (no bubble)
- Shows model + preset tags
- Hides model tag when model is undefined
- History navigation: shows `<- N/M ->` counter
- Left arrow click → fires `onNavigate(-1)`
- Right arrow click → fires `onNavigate(1)`
- Left arrow disabled at index 0
- Right arrow disabled at last index
- Close button fires onClose
- Escape fires onClose
- Draggable behavior preserved

New `show` signature:

```ts
interface ExplanationShowOptions {
  readonly entry: HistoryEntry
  readonly currentIndex: number
  readonly totalCount: number
  readonly position?: UIPosition
}

show(options: ExplanationShowOptions): void
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/explanation-popup.test.ts`
Expected: FAIL

- [ ] **Step 3: Rewrite ExplanationPopup**

Rewrite `src/core/ui/explanation-popup.ts`. Key changes:

```ts
export class ExplanationPopup {
  constructor(container: HTMLElement, theme?: 'light' | 'dark')

  show(options: ExplanationShowOptions): void
  hide(): void
  destroy(): void

  onClose: (() => void) | null
  onNavigate: ((direction: -1 | 1) => void) | null
}
```

Layout: wrapper → nav bar (`<- N/M -> ... x`) → prompt context (chat bubble or quick-run bar) → tags row → sections list (each with colored label + content, separated by dividers).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/explanation-popup.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/explanation-popup.ts src/core/ui/explanation-popup.test.ts
git commit -m "feat: rewrite ExplanationPopup with structured sections and history nav"
```

---

### Task 10: History Button

**Files:**
- Create: `src/core/ui/history-button.ts`
- Create: `src/core/ui/history-button.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/core/ui/history-button.test.ts`:

```ts
describe('HistoryButton', () => {
  it('should be hidden when count is 0')
  it('should show badge with count')
  it('should update badge when count changes')
  it('should fire onClick when clicked')
  it('should be visible when count > 0')
  it('should hide when count set back to 0')
  it('should be positioned at top-right of container')
  it('should stopPropagation on mousedown')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/ui/history-button.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement HistoryButton**

Create `src/core/ui/history-button.ts`:

```ts
export class HistoryButton {
  constructor(container: HTMLElement, theme?: 'light' | 'dark')

  setCount(count: number): void
  destroy(): void

  onClick: (() => void) | null
}
```

Simple DOM element: positioned `absolute; top: 8px; right: 8px`, shows "History (N)" with a badge. Hidden when count is 0.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/ui/history-button.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/ui/history-button.ts src/core/ui/history-button.test.ts
git commit -m "feat: add HistoryButton component with badge"
```

---

## Phase 3: Integration

### Task 11a: Orchestrator — PromptBuilder & Provider Wiring

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

- [ ] **Step 1: Write tests for PromptBuilder integration**

Add to `src/core/agent-overlay.test.ts`:
- Test that `defaultPromptBuilder` is used when no custom builder provided
- Test that custom `promptBuilder` is called with correct params
- Test that provider receives `AnalyzeOptions` with model and additionalSystemPrompt
- Test that result goes through `validateResult` (returns `NormalizedAnalysisResult`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: FAIL

- [ ] **Step 3: Wire PromptBuilder into orchestrator**

In `createAgentOverlay`:
1. `const promptBuilder = options.promptBuilder ?? defaultPromptBuilder`
2. Update `promptInput.onSubmit` to:
   - Get selectedModel and selectedPresets from promptInput
   - Call `promptBuilder.build({ userPrompt, selectedPresets, isQuickRun: false })`
   - Call `provider.analyze(context, buildResult.prompt, signal, { model: selectedModel, additionalSystemPrompt: buildResult.additionalSystemPrompt })`
3. Add `promptInput.onQuickRun` handler:
   - Same flow but with `isQuickRun: true`
4. On error, call `promptInput.showError(err.message)` in addition to `setLoading(false)`

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: wire PromptBuilder and AnalyzeOptions into orchestrator"
```

---

### Task 11b: Orchestrator — History Store & Button

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

- [ ] **Step 1: Write tests for history integration**

Add tests:
- History entry pushed after successful analysis
- HistoryButton badge updates with count
- HistoryButton hidden when no entries
- Closing popup clears overlay + selection but preserves history
- New selection clears current overlay but preserves history

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: FAIL

- [ ] **Step 3: Wire HistoryStore and HistoryButton**

1. `const historyStore = createHistoryStore()`
2. `const historyButton = new HistoryButton(chartEl, theme)`
3. After successful analysis: push entry to `historyStore`, update `historyButton.setCount()`
4. Update `explanationPopup.onClose`: clear overlay + selection, do NOT clear history
5. Update `destroy()` to clean up historyButton and historyStore

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: wire HistoryStore and HistoryButton into orchestrator"
```

---

### Task 11c: Orchestrator — History Navigation

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

- [ ] **Step 1: Write tests for history navigation**

Add tests:
- History button click when nothing showing → restores latest entry (overlay + highlight + popup)
- History button click when prompt showing → hides prompt, shows latest entry
- History button click when popup already showing → no-op
- ExplanationPopup `onNavigate(1)` → switch to next entry (clear + render + setRange)
- ExplanationPopup `onNavigate(-1)` → switch to previous entry
- Navigation at boundaries (first/last entry)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: FAIL

- [ ] **Step 3: Wire history navigation**

1. Wire `historyButton.onClick`:
   - If popup visible: no-op
   - If prompt visible: hide prompt
   - Restore latest entry: `renderer.clear()` → `renderer.render(entry.result)` → `rangeSelector.setRange(entry.range)` → show explanation popup with entry data and index info
2. Wire `explanationPopup.onNavigate`:
   - Calculate target index (current + direction)
   - Clamp to [0, historyStore.size() - 1]
   - `renderer.clear()` → `renderer.render(targetEntry.result)` → `rangeSelector.setRange(targetEntry.range)`
   - Update popup with target entry
3. Track current history index in orchestrator state

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/core/agent-overlay.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: All tests PASS

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: wire history navigation into orchestrator"
```

---

### Task 12: Update Example & React Hook

**Files:**
- Modify: `examples/vanilla/main.ts`
- Modify: `src/react/use-agent-overlay.ts`

- [ ] **Step 1: Update vanilla example**

Update `examples/vanilla/main.ts` to use models and presets:

```ts
const provider = createAnthropicProvider({
  apiKey,
  models: [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
})

const agent = createAgentOverlay(chart as never, series as never, {
  provider,
  presets: [
    {
      label: 'Technical',
      systemPrompt: 'Focus on technical analysis: support/resistance, patterns, indicators. Include priceLines and markers.',
      defaultPrompt: 'Analyze the technical aspects of this range',
    },
    {
      label: 'Fundamental',
      systemPrompt: 'Focus on macroeconomic context, news events, and fundamental factors. Only return explanation sections, no priceLines or markers.',
      defaultPrompt: 'Analyze relevant macro events and fundamentals',
    },
    {
      label: 'Smart Money',
      systemPrompt: 'Analyze volume patterns, unusual activity, and institutional behavior. Include markers for anomalies.',
      defaultPrompt: 'Analyze smart money signals in this range',
    },
    {
      label: 'Sentiment',
      systemPrompt: 'Assess market sentiment from price action patterns. Only return explanation sections, no priceLines or markers.',
      defaultPrompt: 'What is the market sentiment in this range?',
    },
  ],
})
```

Also update the mock provider to return structured explanation.

- [ ] **Step 2: Update React hook and its tests**

Update `src/react/use-agent-overlay.ts` to pass through the new `AgentOverlayOptions` (presets, promptBuilder). The hook signature should accept the updated options type.

Update `src/react/use-agent-overlay.test.ts` to verify the hook still works with the new options shape. The `lastResult` type changes from `AnalysisResult` to `NormalizedAnalysisResult` — update assertions accordingly.

- [ ] **Step 3: Run dev server and manually test**

Run: `pnpm dev`
Test:
- Selection mode toggle (S key)
- Drag select → prompt input with toolbar
- Model dropdown (if API key set)
- Preset multi-select
- Submit → structured explanation popup
- History navigation (← →)
- History button
- Quick run via preset "Run" button

- [ ] **Step 4: Run full verification**

Run: `pnpm check && pnpm test`
Expected: All checks pass, all tests pass

- [ ] **Step 5: Commit**

```bash
git add examples/vanilla/main.ts src/react/use-agent-overlay.ts
git commit -m "feat: update example with presets and models, update React hook types"
```

---

## Phase 4: Final Verification

### Task 13: Coverage & Cleanup

- [ ] **Step 1: Run coverage report**

Run: `pnpm test:coverage`
Expected: All files above 80% coverage threshold

- [ ] **Step 2: Fix any coverage gaps**

Add tests for uncovered branches if below 80%.

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint && pnpm typecheck`
Expected: All pass

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix coverage gaps and formatting"
```

---

## Dependency Graph

```
Task 1 (types) ──┬── Task 2 (PromptBuilder)
                  ├── Task 3 (HistoryStore)
                  ├── Task 4 (setRange)
                  ├── Task 5 (validateResult) ── NOTE: modifies agent-overlay.ts
                  ├── Task 6 (providers)
                  ├── Task 7 (Dropdown)
                  │
                  ├── Task 8 (PromptInput) ──── depends on Task 7
                  ├── Task 9 (ExplanationPopup)
                  ├── Task 10 (HistoryButton)
                  │
                  ├── Task 11a (Orchestrator: PromptBuilder) ── depends on Tasks 2, 5, 8
                  ├── Task 11b (Orchestrator: History) ──────── depends on Tasks 3, 10, 11a
                  └── Task 11c (Orchestrator: Navigation) ───── depends on Tasks 4, 9, 11b
                       │
                       └── Task 12 (Example + React) ── depends on Task 11c
                            │
                            └── Task 13 (Cleanup)
```

**Parallelism notes:**
- Tasks 2, 3, 4, 6, 7, 9, 10 are independent and can run in parallel after Task 1.
- Task 5 modifies `agent-overlay.ts` — do NOT run in parallel with Tasks 11a/b/c.
- Task 8 depends on Task 7 (uses Dropdown component).
- Tasks 11a → 11b → 11c must run sequentially.
