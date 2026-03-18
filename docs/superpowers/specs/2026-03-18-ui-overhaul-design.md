# UI Overhaul — Design Spec

## Overview

Major UI upgrade for the prompt input, explanation popup, and a new history system. The prompt input becomes a Cursor-style multi-line input with a toolbar for model selection and analysis presets. The explanation popup shows structured results with context. A persistent history button on the chart allows browsing past analyses.

## Changes Summary

| Area | Before | After |
|------|--------|-------|
| Prompt Input | Single-line `<input>`, no toolbar | Multi-line `<textarea>`, toolbar with model/preset dropdowns |
| Explanation Popup | Plain text + close button | Structured sections + user prompt context + history navigation |
| History | None | In-memory per-session, persistent chart button, cross-selection |
| `AnalysisResult` | `explanation: string` | `explanation: string \| { sections }` |
| `LLMProvider` | `analyze(context, prompt, signal)` | `analyze(context, prompt, signal, options?)` |
| `LLMProvider` | No `models` property | `models?: ModelOption[]` property |
| `AgentOverlayOptions` | No preset/builder config | `presets`, `promptBuilder?` |
| Prompt Building | Inline in orchestrator | `PromptBuilder` interface with default impl |

## 1. Public Interface Changes

### AnalysisResult

```ts
interface ExplanationSection {
  readonly label: string
  readonly content: string
}

// Public type — what providers return
interface AnalysisResult {
  explanation?: string | { sections: readonly ExplanationSection[] }
  priceLines?: readonly PriceLineAction[]
  markers?: readonly MarkerAction[]
}

// Internal type — after validateResult(), explanation is always normalized
interface NormalizedExplanation {
  readonly sections: readonly ExplanationSection[]
}

// Internal type — AnalysisResult after validation
interface NormalizedAnalysisResult {
  readonly explanation?: NormalizedExplanation
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}
```

**Validation in `validateResult()`:**

After validation, `explanation` is always `NormalizedExplanation | undefined`. The UI layer only deals with the normalized form.

| LLM returns | validateResult output |
|---|---|
| `"explanation": "plain text"` | `{ sections: [{ label: "Analysis", content: "plain text" }] }` |
| `"explanation": { "sections": [...] }` | Filter out entries missing `label` or `content` |
| `"explanation": { "sections": [] }` | `undefined` (empty = don't show) |
| `"explanation": null` | `undefined` |
| `"explanation": 123` | `undefined` |
| `"explanation": { "sections": "not array" }` | `undefined` |
| `"explanation": { "other_key": "value" }` | `undefined` |

Blanket rule: any `explanation` value that is not a string and not an object with a valid `sections` array is treated as `undefined`.

### LLMProvider

```ts
interface ModelOption {
  readonly id: string
  readonly label: string
}

interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
}

interface LLMProvider {
  readonly models?: readonly ModelOption[]
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
}
```

- `models` — optional list of available models. When present, the UI shows a model dropdown. When absent, the dropdown is hidden and the provider uses its default model.
- `options.model` — selected model ID, forwarded from the UI dropdown.
- `options.additionalSystemPrompt` — merged preset system prompts, appended to the provider's base system prompt.

**Migration note**: Adding `options?: AnalyzeOptions` is source-compatible for callers (optional param), but custom `LLMProvider` implementations will need to accept the new parameter. Since the package is unpublished (0.0.1), this has zero external impact.

### AnalysisPreset

```ts
interface AnalysisPreset {
  readonly label: string
  readonly systemPrompt: string
  readonly defaultPrompt: string
}
```

### PromptBuilder

```ts
interface PromptBuildParams {
  readonly userPrompt: string
  readonly selectedPresets: readonly AnalysisPreset[]
  readonly isQuickRun: boolean
}

interface PromptBuildResult {
  readonly prompt: string
  readonly additionalSystemPrompt: string
}

interface PromptBuilder {
  build(params: PromptBuildParams): PromptBuildResult
}
```

The package provides a `defaultPromptBuilder`:
- **Custom prompt**: `prompt` = user's text, `additionalSystemPrompt` = selected presets' `systemPrompt` values joined by `\n\n`.
- **Quick run**: `prompt` = selected presets' `defaultPrompt` values joined by `\n\n`, `additionalSystemPrompt` = same merge.

Developers can provide a custom `PromptBuilder` to inject additional context (portfolio data, RAG results, etc.) or change the merging strategy.

### AgentOverlayOptions

```ts
interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly dataAccessor?: DataAccessor
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly ui?: AgentOverlayUIOptions
}
```

- `provider.models` drives the model dropdown (not in `AgentOverlayOptions`).
- `presets` drives the preset dropdown. When not provided, the preset dropdown is hidden.
- `promptBuilder` overrides the default prompt construction logic. When not provided, `defaultPromptBuilder` is used.

## 2. Prompt Input

### Layout

```
+------------------------------------------------- x-+
|                                                     |
|  Ask about this range...                            |  <- textarea
|                                                     |
+----------------------------------------------------|
|  [Model v]  [Preset v]                         [^]  |  <- toolbar
+----------------------------------------------------+
```

### Elements

- **Textarea**: Replaces `<input>`. Shift+Enter for newline, Enter to submit.
- **x button**: Top-right close. Side effects: hides prompt, aborts in-flight request, clears selection (same as Esc).
- **Model dropdown**: Lists `provider.models`. Single-select. Hidden if `provider.models` not provided.
- **Preset dropdown**: Multi-select checkboxes from `options.presets`. Bottom has "Run" button for quick execution with default prompts. Hidden if `presets` not provided.
- **Submit button**: Circular arrow, visually active only when textarea has text.
- **Progress bar**: Existing sliding bar at bottom during loading.

When neither `models` nor `presets` is configured, the toolbar shows only the submit button.

### Dropdown Behavior

- **Open/close**: Click button to toggle. Click outside to close. Esc to close.
- **Model dropdown**: Closes on selection (single-select).
- **Preset dropdown**: Stays open after check/uncheck (multi-select). Closes on click outside, Esc, or clicking the "Run" button.
- **Z-index**: Dropdowns render above the prompt input (z-index: 1001+).
- **Overflow**: If dropdown would overflow chart container, flip direction (open upward instead of downward).

### Preset Dropdown Display

Selected presets shown in the dropdown button label:
- 0 selected: "—"
- 1 selected: "Technical"
- 2 selected: "Technical, Entry/Exit"
- 3+ selected: "Technical, Entry/Exit +1"

### Preset Execution Modes

1. **Custom prompt**: Select presets -> type question -> submit. Orchestrator calls `promptBuilder.build({ userPrompt, selectedPresets, isQuickRun: false })`.
2. **Quick run**: Select presets -> click "Run" in dropdown. Orchestrator calls `promptBuilder.build({ userPrompt: '', selectedPresets, isQuickRun: true })`. Submits immediately. Textarea content is ignored. "Run" is disabled when no presets are selected.

### Error Display

When the provider returns an error:
- Progress bar hides, textarea re-enables.
- A brief error message appears below the toolbar (red text, auto-dismisses after 5s or on next submit).
- The user can edit their prompt and retry.

## 3. Explanation Popup

### Layout (Custom Prompt)

```
+--------------------------------------+
|  <-  3 / 5  ->                     x |
|--------------------------------------|
|              User's question here  |  <- right-aligned chat bubble
|                                      |
|  Haiku 4.5 . Technical . Entry/Exit   |  <- tags (model + preset labels)
|--------------------------------------|
|  Technical                           |  <- section label
|  Support at $82,340...               |  <- section content
|--------------------------------------|
|  Entry/Exit                          |  <- section label
|  Bullish flag forming...             |  <- section content
+--------------------------------------+
```

### Layout (Quick Run / Preset Default Prompt)

```
+--------------------------------------+
|  <-  4 / 5  ->                     x |
|--------------------------------------|
|  > Quick . Haiku 4.5 . Technical      |  <- indicator bar (no chat bubble)
|--------------------------------------|
|  Technical                           |
|  Support at $82,340...               |
|--------------------------------------|
|  Entry/Exit                          |
|  Bullish flag forming...             |
+--------------------------------------+
```

### Section Rendering

Each `ExplanationSection` renders as a labeled block. Sections are separated by a subtle divider. Section labels use distinct colors to differentiate analysis perspectives.

### History Navigation

- `<-` and `->` arrows navigate through history entries.
- Counter shows current position (e.g., "3 / 5").
- Switching entries: clear current overlays via `renderer.clear()`, then `renderer.render(targetEntry.result)` to re-render from stored `AnalysisResult` data. Update selection highlight to target entry's range via `rangeSelector.setRange(entry.range)`.
- Close button: removes current overlay from chart, history is preserved (can re-open via history button).

## 4. History System

### Storage

- In-memory array of `HistoryEntry` objects.
- Per-session only (cleared on page reload).
- Accumulates across different selection ranges.
- Capped at 50 entries. When full, oldest entry is dropped. If the dropped entry is currently displayed, its overlays are cleared first.

```ts
interface HistoryEntry {
  readonly prompt: string
  readonly isQuickRun: boolean
  readonly model?: string     // model used; absent when provider.models not configured
  readonly presets: readonly AnalysisPreset[]
  readonly result: NormalizedAnalysisResult
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
}
```

Notes:
- `result` stores the **post-validation normalized result** (`NormalizedAnalysisResult`), not the raw provider response. The UI layer can render directly from it.
- `overlayRefs` are NOT stored. Overlays are re-rendered from `result` data when navigating history. Only one entry's overlays are visible at a time.
- Full `AnalysisPreset` objects are stored (not just labels) to enable potential future "re-run with same presets" functionality.
- When `model` is absent, the explanation popup hides the model tag.

### History Button

- Positioned at chart top-right corner.
- Shows a badge with the count of history entries.
- Hidden when there are no entries.
- Click: restores the most recent entry — renders its selection highlight + overlay + explanation popup.

### Overlay Management

Only one history entry's overlays are visible at a time. When navigating or restoring:

1. `renderer.clear()` — remove all current overlays from chart.
2. `renderer.render(entry.result)` — re-render target entry's overlays from stored `AnalysisResult` data.
3. `rangeSelector.setRange(entry.range)` — update selection highlight to target entry's time range.

When a new analysis completes, the previous overlays are cleared before rendering the new result.

**Contract**: `render()` is additive — it appends overlays. Callers must always call `clear()` before `render()` to avoid stacking overlays from different analyses.

### RangeSelector API Addition

`RangeSelector` needs a new public method to programmatically set the selection highlight:

```ts
setRange(range: { from: TimeValue; to: TimeValue }): void
```

This sets the selection primitive's range without triggering `onSelect` or `onDismiss` callbacks. It does NOT change the selection mode (`_enabled`), does NOT call `applyOptions` to disable scroll/scale, and does NOT modify drag state. It is a pure visual operation used only by history navigation.

## 5. Prompt Builder & Provider Changes

### Prompt Build Flow

```
User action
    |
    v
Orchestrator calls promptBuilder.build({
  userPrompt,           // textarea content (or "" for quick run)
  selectedPresets,      // checked presets from dropdown
  isQuickRun,           // true if "Run" button clicked
})
    |
    v
PromptBuildResult { prompt, additionalSystemPrompt }
    |
    v
provider.analyze(context, prompt, signal, {
  model: selectedModelId,
  additionalSystemPrompt,
})
```

### Built-in Provider Behavior

The provider appends `additionalSystemPrompt` to its own base system prompt:

```
[Base system prompt (JSON schema instructions, structured sections format)]

[additionalSystemPrompt from PromptBuilder]
```

The base system prompt is updated to request structured explanation sections:

```
Return explanation as structured sections:
"explanation": {
  "sections": [
    { "label": "section name matching the analysis perspective", "content": "analysis text" }
  ]
}
```

### Model Override

When `options.model` is provided in `AnalyzeOptions`, the provider uses it for that request instead of the default model.

### Provider Models

Built-in providers accept a `models` option at creation:

```ts
const provider = createAnthropicProvider({
  apiKey: '...',
  models: [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
})
// provider.models is exposed for the UI dropdown
```

## 6. UI Lifecycle & State Transitions

### New Analysis Flow

1. User selects range -> prompt input shows (previous popup dismissed if any).
2. User submits (Enter or Quick Run) -> prompt disabled, progress bar shows.
3. Provider returns result -> `renderer.clear()`, `renderer.render(result)`, push to history, show explanation popup, hide prompt input.
4. Error -> progress bar hides, error message shown below toolbar, prompt re-enabled for retry.

### History Button Click

- If explanation popup is already showing: no-op (popup already visible with navigation).
- If prompt input is showing: hide prompt input, show most recent history entry.
- If nothing is showing: show most recent history entry (highlight + overlay + explanation).

### Closing Explanation Popup

- Overlays are cleared, selection highlight is cleared.
- History is **preserved** — not cleared on close.
- The existing `onClose` handler needs to be updated: it currently clears overlays + selection (keep this), but must NOT clear history.

### New Selection While Popup Is Showing

- Existing overlay is cleared (the entry is already in history).
- Explanation popup is dismissed.
- Prompt input appears for the new selection.
- History is preserved — user can re-open via history button.

## 7. Package Structure Changes

```
src/core/ui/
  prompt-input.ts        # Major rewrite: textarea, toolbar, dropdowns
  explanation-popup.ts   # Major rewrite: structured sections, history nav
  calculate-position.ts  # No change
  make-draggable.ts      # No change
  history-button.ts      # NEW: persistent chart corner button
  dropdown.ts            # NEW: reusable dropdown component

src/core/
  agent-overlay.ts       # Updated: history management, new options wiring
  types.ts               # Updated: new interfaces
  history-store.ts       # NEW: in-memory history management
  prompt-builder.ts      # NEW: PromptBuilder interface + defaultPromptBuilder
```

## 8. Developer Experience

### Minimal Setup (no models/presets)

```ts
const agent = createAgentOverlay(chart, series, {
  provider: createAnthropicProvider({ apiKey: '...' }),
})
```

Prompt input shows textarea + submit only. No dropdowns. Works exactly like before but with the new input style.

### Full Setup

```ts
const provider = createAnthropicProvider({
  apiKey: '...',
  models: [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
})

const agent = createAgentOverlay(chart, series, {
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

### Custom PromptBuilder

```ts
const agent = createAgentOverlay(chart, series, {
  provider,
  presets,
  promptBuilder: {
    build({ userPrompt, selectedPresets, isQuickRun }) {
      const additionalSystemPrompt = selectedPresets
        .map(p => p.systemPrompt)
        .join('\n\n')
      const prompt = isQuickRun
        ? selectedPresets.map(p => p.defaultPrompt).join('\n\n')
        : `${userPrompt}\n\nPortfolio context: ${getPortfolioData()}`
      return { prompt, additionalSystemPrompt }
    }
  },
})
```

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM ignores structured explanation format | Falls back to single section | `validateResult()` wraps plain string in `{ sections: [{ label, content }] }` |
| Multiple preset system prompts confuse LLM | Poor quality response | Each preset should be concise and focused; test combinations |
| History memory growth | Memory usage on long sessions | Cap at 50 entries, drop oldest with overlay cleanup |
| Overlay re-rendering on history navigation | Flicker or lag | `clear()` then `render()` in single synchronous sequence |
| Toolbar too wide on narrow charts | Layout overflow | Dropdown labels truncate with +N pattern |
| "Run" button accidental click in dropdown | Unintended submission | "Run" disabled when no presets selected; visual separation from checkboxes |
