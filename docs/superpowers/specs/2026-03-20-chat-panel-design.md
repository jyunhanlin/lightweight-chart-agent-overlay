# Chat Panel Design

## Problem

The current UI is single-turn: select range → prompt input → explanation popup → done. Users cannot follow up on analysis results without starting over. The explanation popup and prompt input are separate components that don't support conversation flow.

## Goals

1. **Multi-turn conversation** — users can ask follow-up questions within the same analysis context
2. **Unified UI** — replace prompt-input and explanation-popup with a single ChatPanel component
3. **Per-turn overlays** — each conversation turn has its own overlays (priceLines, markers); clicking a turn switches to that turn's overlays
4. **Window-like behavior** — draggable from header, resizable from all 4 edges and 4 corners, collapsible

## Non-Goals

- Side panel layout (chart resize) — stays as floating overlay
- Overlay accumulation across turns (each turn replaces)
- AI-controlled overlay mutations (add/remove/clear actions)
- Persistent chat storage beyond in-memory history
- Context window management (turn truncation, summarization) — if the API returns a context-length error, it surfaces as a normal error
- Full keyboard/accessibility support — deferred to follow-up
- ChatPanel configuration (default size, position preferences) — defaults hardcoded for v1

## Design

### 1. Component Architecture

**Delete:**
- `src/core/ui/prompt-input.ts` — functionality moves into ChatPanel
- `src/core/ui/explanation-popup.ts` — replaced by ChatPanel

**Create:**
- `src/core/ui/chat-panel.ts` — orchestrator: header, message list, input area coordination
- `src/core/ui/chat-message-list.ts` — scrollable message rendering, per-turn click handling
- `src/core/ui/chat-input.ts` — toolbar (model/preset/settings dropdowns) + auto-grow textarea
- `src/core/ui/make-resizable.ts` — window-like resize from all edges/corners

**Modify:**
- `src/core/agent-overlay.ts` — wire ChatPanel instead of prompt-input + explanation-popup
- `src/core/types.ts` — add `ChatMessage`, `ChatTurn` types, update `HistoryEntry`
- `src/providers/anthropic.ts` — handle `ChatMessage[]` in internal message building
- `src/providers/openai.ts` — handle `ChatMessage[]` in internal message building
- `src/core/history-store.ts` — store conversations (turns), add `updateLatest()`

### 2. ChatPanel UI Structure

```
┌─────────────────────────────────┐
│ ← 1/3 →              – ×      │  ← Header (drag to move)
│─────────────────────────────────│
│                    why drop?    │  ← Turn 1: user bubble
│ claude-haiku · Technical        │     model/preset tags (per-turn)
│                                 │
│ ## Market Analysis              │  ← Turn 1: AI response (markdown)
│ The chart shows a downtrend...  │
│─────────────────────────────────│
│ ▎             support levels?   │  ← Turn 2 (active, left border highlight)
│ ▎ gpt-4o · Technical            │     different model for this turn
│ ▎                               │
│ ▎ ## Support Analysis           │  ← Turn 2: AI response
│ ▎ Key support at $85,000...     │
│─────────────────────────────────│
│ [Model ▾] [Presets ▾] [⚙]     │  ← Toolbar (model/preset/settings)
│ ┌───────────────────────┐  ⌘↵  │  ← Input area
│ │ Follow up...          │       │
│ └───────────────────────┘       │
└─────────────────────────────────┘
  ↕ ↔ resize from all edges/corners
```

**Header bar:**
- History navigation (← N/M →) — navigates between different chats (by range)
- Collapse toggle (–/◻)
- Close button (×) — closes panel, clears overlays

**Message list (scrollable):**
- Each turn: user message bubble + model/preset tags + AI response (rendered markdown)
- Active turn has left border highlight; clicking a turn switches overlays
- Streaming: new AI response renders markdown in real-time with blinking cursor

**Toolbar + Input (sticky bottom):**
- Model dropdown, preset dropdown, settings gear (from prompt-input)
- Auto-grow textarea with ⌘↵ submit
- During streaming: input disabled, X button aborts

### 3. ChatTurn & Per-Turn State

Each conversation turn stores its own result, raw response, and the model/presets used:

```ts
interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

interface ChatTurn {
  readonly userMessage: string
  readonly rawResponse: string           // full LLM response text (for rebuilding messages array)
  readonly result: NormalizedAnalysisResult
  readonly model?: string
  readonly presets: readonly AnalysisPreset[]
}
```

**`rawResponse`** stores the complete LLM output (including the JSON fence). This is needed to reconstruct the messages array for subsequent API calls. `result` is the parsed/normalized version for rendering.

**Overlay behavior:**
- When a new turn completes → its overlays replace the previous turn's on the chart
- Clicking a previous turn → renders that turn's overlays, highlights that turn
- Default: latest turn is active

### 4. Provider Interface — No Signature Change

The `LLMProvider` interface signature stays exactly the same:

```ts
analyze(context: ChartContext, prompt: string, signal?, options?): Promise<AnalysisResult>
analyzeStream?(context: ChartContext, prompt: string, signal?, options?): AsyncIterable<string>
```

**The orchestrator (agent-overlay) is responsible for building the prompt.** For multi-turn:
- The orchestrator builds a `ChatMessage[]` internally
- For built-in providers: pass a serialization hint via `AnalyzeOptions` so the provider can use native messages array
- For custom providers: the orchestrator concatenates conversation history into a single string prompt (fallback)

Add to `AnalyzeOptions`:

```ts
interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly chatMessages?: readonly ChatMessage[]  // NEW — multi-turn context
}
```

**Built-in provider behavior:**
- If `options.chatMessages` exists → use native messages array (Anthropic `messages`, OpenAI `messages`)
- If not → use `prompt` string as before (backward compatible)

**Custom provider behavior:**
- Custom providers that don't read `options.chatMessages` → the orchestrator builds a concatenated prompt string, works as before
- Custom providers that want multi-turn → read `options.chatMessages`

This is **not breaking** — `chatMessages` is optional on an existing optional interface.

### 5. Multi-Turn Message Format

When building the messages array for API calls:

```ts
// System message (always first)
{ role: 'system', content: systemPrompt + additionalSystemPrompt }

// First turn: includes chart data
{ role: 'user', content: 'Chart data (N candles, from X to Y):\n[...]\n\nUser question: why drop?' }
{ role: 'assistant', content: '<turn 1 rawResponse>' }

// Follow-up turns: user question only (no chart data repeated)
{ role: 'user', content: 'support levels?' }
{ role: 'assistant', content: '<turn 2 rawResponse>' }

// Current question
{ role: 'user', content: 'what about resistance?' }
```

Chart data is included only in the first user message. The assistant messages use `rawResponse` (the full LLM output including markdown + JSON fence) so the LLM sees its own prior output and maintains context.

### 6. Selection + History Interaction

**New selection = new chat:**
- Dragging a new range closes the current ChatPanel
- Opens a fresh ChatPanel with empty conversation
- Previous chat is saved to history

**History = resume chat:**
- Clicking history button shows the latest chat
- History navigation (← →) switches between chats
- Resuming a chat restores the range selection, all turns, and the active turn's overlays
- User can continue asking follow-ups in a restored chat

**HistoryEntry update:**

```ts
interface HistoryEntry {
  readonly turns: readonly ChatTurn[]
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
}
```

This is a **breaking change** to the exported `HistoryEntry` type (removing `prompt`, `isQuickRun`, `result`). Backward compatibility helpers:

```ts
// Convenience getters for common access patterns
// (documented in migration guide, not computed getters on the type)
// First turn's user message = entry.turns[0]?.userMessage
// Latest result = entry.turns[entry.turns.length - 1]?.result
// Model used = entry.turns[0]?.model
```

Since this is a `0.x` library, the breaking change is acceptable per semver. Document in CHANGELOG.

### 7. HistoryStore Changes

Currently stores one entry per analysis. Updated to store conversations:

```ts
interface HistoryStore {
  push(entry: HistoryEntry): void
  updateLatest(entry: HistoryEntry): void  // NEW — for adding turns to current chat
  get(index: number): HistoryEntry | undefined
  latest(): HistoryEntry | undefined
  size(): number
  clear(): void
}
```

**`updateLatest(entry)`** replaces the last entry with a new immutable entry that has the additional turn. Called after each follow-up turn completes:

```ts
// After turn N completes:
const updatedEntry = { ...currentEntry, turns: [...currentEntry.turns, newTurn] }
historyStore.updateLatest(updatedEntry)
```

This preserves immutability — a new entry object is created, not mutated.

### 8. make-resizable Utility

Window-like resize behavior for any absolutely-positioned element.

```ts
function makeResizable(element: HTMLElement, options?: {
  minWidth?: number    // default: 320
  minHeight?: number   // default: 200
  maxWidth?: number    // default: viewport width - padding
  maxHeight?: number   // default: viewport height - padding
  edges?: number       // hit area width in px, default: 6
}): () => void  // returns cleanup function
```

**Implementation:**
- Invisible hit areas on all 4 edges and 4 corners via CSS pseudo-elements or overlay divs
- Cursor styles: `n-resize`, `e-resize`, `nw-resize`, `ne-resize`, `sw-resize`, `se-resize`, etc.
- On mousedown: determine which edge/corner, track pointer movement, update element width/height/top/left
- Respect min/max constraints
- ~100-150 lines, same pointer-tracking pattern as `makeDraggable`

**Interaction with makeDraggable:**
- Add `handle` option to `makeDraggable`: `makeDraggable(wrapper, { handle: headerEl })` — only the header triggers drag
- This replaces the current `exclude: 'button'` pattern for ChatPanel (though `exclude` remains for backward compat)

### 9. Error Handling for Follow-Up Turns

When a follow-up turn fails (API error, network issue), the ChatPanel should **not** close:

- Turn 1 succeeded → visible in chat
- Turn 2 fails → show inline error message below the user's question: "Failed to get response. [Retry]"
- User can retry or modify their message
- The ChatPanel remains open with all previous turns intact

This differs from the current behavior where errors hide the popup entirely. The new behavior is specific to follow-up turns; first-turn errors still behave as before (show error, user can retry from the input).

### 10. Events

No new public events. Existing events fire per-turn:
- `analyze-start` — fires when user submits (any turn)
- `analyze-complete` — fires when AI response finishes (any turn), emits that turn's `NormalizedAnalysisResult`
- `error` — fires on any error
- `selection-mode-change` — unchanged

### 11. What Stays the Same

- `createAgentOverlay()` public API signature — no changes
- `AgentOverlayOptions` — no changes
- `RangeSelector` — unchanged
- `OverlayRenderer` — unchanged
- Theming (CSS variables) — ChatPanel uses same variables
- `DropdownManager` — reused for model/preset/settings dropdowns
- `HistoryButton` — unchanged (opens latest chat)
- React wrapper — works as-is for basic usage. Multi-turn state exposure deferred to follow-up.

### 12. Breaking Changes

- `HistoryEntry` type changes (removes `prompt`, `isQuickRun`, `result`; adds `turns`)
- `prompt-input.ts` and `explanation-popup.ts` deleted (internal, but consumers importing them directly would break)

Both are acceptable for a `0.x` release. Document in CHANGELOG with migration notes.

## Files Affected

| File | Action | Notes |
|------|--------|-------|
| `src/core/ui/chat-panel.ts` | Create | Orchestrator: header, message list, input coordination |
| `src/core/ui/chat-message-list.ts` | Create | Scrollable message rendering, per-turn click |
| `src/core/ui/chat-input.ts` | Create | Toolbar + textarea, extracted from prompt-input |
| `src/core/ui/make-resizable.ts` | Create | Window-like resize utility |
| `src/core/ui/make-draggable.ts` | Modify | Add `handle` option for header-only drag |
| `src/core/ui/prompt-input.ts` | Delete | Replaced by chat-input.ts |
| `src/core/ui/explanation-popup.ts` | Delete | Replaced by chat-panel.ts |
| `src/core/agent-overlay.ts` | Modify | Wire ChatPanel, multi-turn orchestration |
| `src/core/types.ts` | Modify | Add `ChatMessage`, `ChatTurn`, update `HistoryEntry` |
| `src/core/history-store.ts` | Modify | Add `updateLatest()`, store conversations |
| `src/providers/anthropic.ts` | Modify | Handle `options.chatMessages` for native messages |
| `src/providers/openai.ts` | Modify | Handle `options.chatMessages` for native messages |
| `src/index.ts` | Modify | Update exports |
| Tests for all above | Create/Modify | |

## Test Scenarios

### ChatPanel
- Opens on selection with empty conversation and input focused
- First turn: submit → streaming → markdown render → overlays
- Follow-up: submit → streaming → appended to conversation
- Click previous turn → overlays switch, visual highlight changes
- Collapse/expand toggle works
- Close → clears overlays, clears selection
- Escape during streaming → abort
- Model/preset/settings dropdowns work
- Auto-grow textarea, ⌘↵ submit, disabled during streaming
- Error on follow-up → inline error, panel stays open

### make-resizable
- Resize from each edge (N, S, E, W)
- Resize from each corner (NE, NW, SE, SW)
- Respects min/max width/height constraints
- Correct cursor on hover
- Cleanup function removes listeners
- Does not interfere with header drag

### makeDraggable handle option
- `handle` option limits drag trigger to specified element
- Backward compat: `exclude` option still works

### Provider multi-turn
- `options.chatMessages` present → built-in providers use native messages array
- `options.chatMessages` absent → uses prompt string (backward compatible)
- Chart data only in first message, not repeated

### History + multi-turn
- New selection → new chat (old chat saved to history)
- Follow-up turn → `updateLatest()` called, history entry updated
- History navigation → restore chat with all turns
- Resume chat → can continue follow-up
- Per-turn overlay switching works across history navigation
- Per-turn model/preset tags display correctly
