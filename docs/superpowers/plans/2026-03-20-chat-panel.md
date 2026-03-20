# Chat Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace prompt-input and explanation-popup with a unified ChatPanel that supports multi-turn conversation, per-turn overlay switching, and window-like resize/drag.

**Architecture:** ChatPanel is split into 3 sub-components (chat-panel orchestrator, chat-message-list, chat-input). New make-resizable utility handles window-like resize. Provider interface unchanged — multi-turn context passed via `AnalyzeOptions.chatMessages`. HistoryEntry evolves to store conversation turns.

**Tech Stack:** TypeScript, vitest, jsdom, marked, DOMPurify

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/types.ts` | Modify | Add `ChatMessage`, `ChatTurn`, update `HistoryEntry`, `AnalyzeOptions` |
| `src/core/ui/make-resizable.ts` | Create | Window-like resize from all 4 edges and 4 corners |
| `src/core/ui/make-draggable.ts` | Modify | Add `handle` option for header-only drag |
| `src/core/history-store.ts` | Modify | Add `updateLatest()`, adapt to new `HistoryEntry` |
| `src/providers/anthropic.ts` | Modify | Handle `options.chatMessages` for native messages array |
| `src/providers/openai.ts` | Modify | Handle `options.chatMessages` for native messages array |
| `src/core/ui/chat-input.ts` | Create | Toolbar (model/preset/settings dropdowns) + auto-grow textarea |
| `src/core/ui/chat-message-list.ts` | Create | Scrollable message rendering, per-turn click, streaming |
| `src/core/ui/chat-panel.ts` | Create | Orchestrator: header + message-list + input + resize/drag |
| `src/core/agent-overlay.ts` | Modify | Wire ChatPanel, multi-turn orchestration, remove old imports |
| `src/core/ui/prompt-input.ts` | Delete | Replaced by chat-input |
| `src/core/ui/explanation-popup.ts` | Delete | Replaced by chat-panel |
| `src/index.ts` | Modify | Update exports |

---

### Task 1: Update types (ChatMessage, ChatTurn, HistoryEntry, AnalyzeOptions)

**Files:**
- Modify: `src/core/types.ts`

- [ ] **Step 1: Add new types and update existing ones**

Add `ChatMessage` and `ChatTurn` interfaces. Update `HistoryEntry` to use turns. Add `chatMessages` to `AnalyzeOptions`.

```ts
// Add after AnalyzeOptions
export interface ChatMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface ChatTurn {
  readonly userMessage: string
  readonly rawResponse: string
  readonly result: NormalizedAnalysisResult
  readonly model?: string
  readonly presets: readonly AnalysisPreset[]
}
```

Update `AnalyzeOptions`:
```ts
export interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
  readonly apiKey?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly chatMessages?: readonly ChatMessage[]  // NEW
}
```

Update `HistoryEntry`:
```ts
export interface HistoryEntry {
  readonly turns: readonly ChatTurn[]
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
}
```

- [ ] **Step 2: Run typecheck** — `pnpm typecheck` will show errors in files referencing old HistoryEntry fields. That's expected — we'll fix them in later tasks.

- [ ] **Step 3: Commit**
```bash
git add src/core/types.ts
git commit -m "feat: add ChatMessage, ChatTurn types, update HistoryEntry for multi-turn"
```

---

### Task 2: Create make-resizable utility (TDD)

**Files:**
- Create: `src/core/ui/make-resizable.ts`
- Create: `src/core/ui/make-resizable.test.ts`

This utility makes an absolutely-positioned element resizable from all 4 edges and 4 corners, like a desktop window.

- [ ] **Step 1: Write failing tests**

Tests should cover:
1. Returns a cleanup function
2. Adds resize cursor elements to the DOM
3. Resizing from east edge increases width
4. Resizing from south edge increases height
5. Resizing from north edge decreases top and increases height
6. Resizing from west edge decreases left and increases width
7. Resizing from SE corner changes both width and height
8. Respects minWidth/minHeight constraints
9. Respects maxWidth/maxHeight constraints
10. Cleanup removes all listeners and cursor elements

Test helper for simulating resize drag:
```ts
function simulateResize(
  element: HTMLElement,
  edge: string, // 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
  deltaX: number,
  deltaY: number,
) {
  const handle = element.querySelector(`[data-resize="${edge}"]`) as HTMLElement
  handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }))
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + deltaX, clientY: 100 + deltaY }))
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
}
```

- [ ] **Step 2: Run tests — verify failure**

- [ ] **Step 3: Implement make-resizable**

```ts
export interface ResizeOptions {
  readonly minWidth?: number   // default: 320
  readonly minHeight?: number  // default: 200
  readonly maxWidth?: number
  readonly maxHeight?: number
  readonly edges?: number      // hit area width, default: 6
}

export function makeResizable(element: HTMLElement, options?: ResizeOptions): () => void
```

Implementation approach:
- Create 8 invisible hit-area divs (4 edges + 4 corners) positioned absolutely around the element
- Each has appropriate `cursor` style and `data-resize` attribute
- On mousedown: record start position/size, determine resize direction
- On mousemove: update element width/height/top/left based on direction
- On mouseup: cleanup listeners
- Return cleanup function that removes all hit-area divs and listeners

Edge/corner positioning:
```
[nw] ──── [n] ──── [ne]
 │                    │
[w]      element     [e]
 │                    │
[sw] ──── [s] ──── [se]
```

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**
```bash
git add src/core/ui/make-resizable.ts src/core/ui/make-resizable.test.ts
git commit -m "feat: add make-resizable utility for window-like resize"
```

---

### Task 3: Add `handle` option to makeDraggable (TDD)

**Files:**
- Modify: `src/core/ui/make-draggable.ts`
- Modify: `src/core/ui/make-draggable.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it('handle option limits drag trigger to specified element', () => {
  const el = createPositionedElement()
  const handle = document.createElement('div')
  el.appendChild(handle)

  makeDraggable(el, { handle })

  // Mousedown on the element body — should NOT start drag
  el.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }))
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
  document.dispatchEvent(new MouseEvent('mouseup'))
  expect(el.style.left).toBe('0px') // unchanged

  // Mousedown on the handle — should start drag
  handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }))
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
  document.dispatchEvent(new MouseEvent('mouseup'))
  expect(parseFloat(el.style.left)).toBeGreaterThan(0) // moved
})
```

- [ ] **Step 2: Run test — verify failure**
- [ ] **Step 3: Implement handle option**

Add `handle` to `DragOptions`:
```ts
export interface DragOptions {
  readonly exclude?: string
  readonly handle?: HTMLElement  // NEW — only this element triggers drag
  readonly onDragEnd?: (position: { left: number; top: number }) => void
}
```

In `makeDraggable`, when `handle` is set, attach mousedown listener to `handle` instead of `element`:
```ts
const dragTarget = options?.handle ?? element
dragTarget.addEventListener('mousedown', onMouseDown)
// cleanup:
dragTarget.removeEventListener('mousedown', onMouseDown)
```

- [ ] **Step 4: Run tests — verify all pass (including existing)**
- [ ] **Step 5: Commit**
```bash
git add src/core/ui/make-draggable.ts src/core/ui/make-draggable.test.ts
git commit -m "feat: add handle option to makeDraggable"
```

---

### Task 4: Update HistoryStore for multi-turn (TDD)

**Files:**
- Modify: `src/core/history-store.ts`
- Modify: `src/core/history-store.test.ts`

- [ ] **Step 1: Write failing test for updateLatest**

```ts
it('updateLatest replaces the last entry', () => {
  const store = createHistoryStore()
  const entry1 = makeEntry({ turns: [makeTurn('q1', 'a1')] })
  store.push(entry1)

  const updated = { ...entry1, turns: [...entry1.turns, makeTurn('q2', 'a2')] }
  store.updateLatest(updated)

  expect(store.size()).toBe(1) // still 1 entry, not 2
  expect(store.get(0)!.turns).toHaveLength(2)
})

it('updateLatest throws when store is empty', () => {
  const store = createHistoryStore()
  expect(() => store.updateLatest(makeEntry())).toThrow()
})
```

Test helpers:
```ts
function makeTurn(userMessage: string, rawResponse: string): ChatTurn {
  return { userMessage, rawResponse, result: {}, model: 'test', presets: [] }
}
function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return { turns: [makeTurn('q', 'a')], range: { from: 1000, to: 2000 }, ...overrides }
}
```

- [ ] **Step 2: Run tests — verify failure**
- [ ] **Step 3: Update existing tests for new HistoryEntry shape**

All existing tests use `{ prompt, isQuickRun, model, presets, result, range }`. Update them to use `{ turns: [...], range }`.

- [ ] **Step 4: Implement updateLatest**

Add to `HistoryStore` interface and implementation:
```ts
updateLatest(entry: HistoryEntry): void
```

Implementation:
```ts
updateLatest(entry) {
  if (entries.length === 0) throw new Error('No entries to update')
  entries = [...entries.slice(0, -1), entry]
},
```

- [ ] **Step 5: Run tests — verify all pass**
- [ ] **Step 6: Commit**
```bash
git add src/core/history-store.ts src/core/history-store.test.ts
git commit -m "feat: add updateLatest to HistoryStore for multi-turn chats"
```

---

### Task 5: Provider multi-turn support (TDD)

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/openai.ts`
- Modify: `src/providers/anthropic.test.ts`
- Modify: `src/providers/openai.test.ts`

- [ ] **Step 1: Write failing tests for chatMessages support**

For Anthropic:
```ts
it('uses chatMessages when provided in options', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ text: 'response' }] }),
  })
  const provider = createAnthropicProvider({ apiKey: 'key', availableModels: MODELS })
  await provider.analyze(MOCK_CONTEXT, 'ignored when chatMessages present', undefined, {
    chatMessages: [
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
      { role: 'user', content: 'follow up' },
    ],
  })
  const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
  expect(body.messages).toHaveLength(3)
  expect(body.messages[0].content).toBe('first question')
  expect(body.messages[2].content).toBe('follow up')
})
```

Same pattern for OpenAI (with `messages` array in body) and for `analyzeStream`.

- [ ] **Step 2: Run tests — verify failure**
- [ ] **Step 3: Implement chatMessages handling**

In both providers, in `analyze()` and `analyzeStream()`, check `analyzeOptions?.chatMessages`:

```ts
const messages = analyzeOptions?.chatMessages
  ? [...analyzeOptions.chatMessages]
  : [{ role: 'user' as const, content: userMessage }]
```

For Anthropic, system prompt is separate (`system` field). For OpenAI, prepend system message to `messages` array.

- [ ] **Step 4: Run tests — verify all pass**
- [ ] **Step 5: Commit**
```bash
git add src/providers/anthropic.ts src/providers/openai.ts src/providers/anthropic.test.ts src/providers/openai.test.ts
git commit -m "feat: add chatMessages support to providers for multi-turn"
```

---

### Task 6: Create chat-input component (TDD)

**Files:**
- Create: `src/core/ui/chat-input.ts`
- Create: `src/core/ui/chat-input.test.ts`

Extracts toolbar (model dropdown, preset dropdown, settings gear) + auto-grow textarea from the old prompt-input. This is the bottom section of ChatPanel.

- [ ] **Step 1: Write failing tests**

Tests should cover:
1. Renders textarea + toolbar (model dropdown, preset dropdown, settings)
2. ⌘↵ fires onSubmit with textarea value
3. Textarea clears after submit
4. setLoading(true) disables textarea
5. getSelectedModel() returns current model
6. getSelectedPresets() returns selected presets
7. openSettings() opens settings panel
8. Auto-grow textarea on input
9. destroy() cleans up

- [ ] **Step 2: Run tests — verify failure**
- [ ] **Step 3: Implement chat-input**

```ts
export interface ChatInputOptions {
  readonly availableModels?: readonly ModelOption[]
  readonly presets?: readonly AnalysisPreset[]
  readonly requiresApiKey?: boolean
  readonly apiKeyStorageKey?: string
}

export class ChatInput {
  onSubmit: ((text: string) => void) | null = null

  constructor(container: HTMLElement, options?: ChatInputOptions)
  getSelectedModel(): string | undefined
  getSelectedPresets(): readonly AnalysisPreset[]
  setLoading(loading: boolean): void
  openSettings(message?: string): void
  showError(message: string): void
  focus(): void
  destroy(): void
}
```

Reuse `Dropdown`, `DropdownManager`, `SettingsPanel` from existing code. Extract textarea + toolbar logic from `prompt-input.ts`.

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**
```bash
git add src/core/ui/chat-input.ts src/core/ui/chat-input.test.ts
git commit -m "feat: create ChatInput component (toolbar + textarea)"
```

---

### Task 7: Create chat-message-list component (TDD)

**Files:**
- Create: `src/core/ui/chat-message-list.ts`
- Create: `src/core/ui/chat-message-list.test.ts`

Renders the scrollable list of conversation turns with per-turn click handling, streaming support, and active turn highlighting.

- [ ] **Step 1: Write failing tests**

Tests should cover:
1. Renders empty state (no turns)
2. addTurn() renders user bubble + model/preset tags + AI markdown content
3. Multiple turns render with dividers
4. Click on a turn fires onTurnClick(index)
5. setActiveTurn(index) highlights that turn with left border
6. startStreaming() adds streaming area with cursor
7. setStreamText() updates streaming content (markdown rendered)
8. finalizeTurn() converts streaming area to static markdown content
9. showError() shows inline error for failed turn
10. clear() removes all turns

- [ ] **Step 2: Run tests — verify failure**
- [ ] **Step 3: Implement chat-message-list**

```ts
export class ChatMessageList {
  onTurnClick: ((index: number) => void) | null = null

  constructor(container: HTMLElement)
  addTurn(turn: ChatTurn): void
  startStreaming(userMessage: string, model?: string, presets?: readonly AnalysisPreset[]): void
  setStreamText(text: string): void
  finalizeTurn(turn: ChatTurn): void
  showError(message: string): void
  setActiveTurn(index: number): void
  clear(): void
  scrollToBottom(): void
  destroy(): void
}
```

Uses `marked` + `DOMPurify` for markdown rendering (same as explanation-popup did). Reuses existing `buildPromptBubble` and `buildTagsRow` patterns.

Each turn is a `div[data-turn-index="N"]` with:
- User bubble (right-aligned)
- Tags row (model + presets)
- AI response (markdown content)
- Optional left border for active state

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**
```bash
git add src/core/ui/chat-message-list.ts src/core/ui/chat-message-list.test.ts
git commit -m "feat: create ChatMessageList component"
```

---

### Task 8: Create chat-panel orchestrator (TDD)

**Files:**
- Create: `src/core/ui/chat-panel.ts`
- Create: `src/core/ui/chat-panel.test.ts`

The main ChatPanel component that combines header (nav bar + collapse), ChatMessageList, and ChatInput. Handles resize and drag.

- [ ] **Step 1: Write failing tests**

Tests should cover:
1. show() creates panel with header + empty message list + input
2. Header has history nav, collapse toggle, close button
3. Close fires onClose callback
4. Collapse toggle hides/shows content
5. Escape during non-streaming fires onClose
6. Escape during streaming fires onAbort
7. addTurn() delegates to message list
8. startStreaming() delegates to message list
9. setStreamText() delegates to message list
10. finalizeTurn() delegates to message list
11. getSelectedModel() delegates to chat input
12. getSelectedPresets() delegates to chat input
13. setActiveTurn() delegates to message list
14. hide() removes DOM
15. destroy() cleans up everything

- [ ] **Step 2: Run tests — verify failure**
- [ ] **Step 3: Implement chat-panel**

```ts
export interface ChatPanelShowOptions {
  readonly position?: UIPosition
  readonly currentIndex: number
  readonly totalCount: number
}

export class ChatPanel {
  onClose: (() => void) | null = null
  onAbort: (() => void) | null = null
  onNavigate: ((direction: -1 | 1) => void) | null = null
  onSubmit: ((text: string) => void) | null = null
  onTurnClick: ((index: number) => void) | null = null

  constructor(container: HTMLElement, inputOptions?: ChatInputOptions)

  show(options: ChatPanelShowOptions): void
  hide(): void
  destroy(): void

  // Delegate to ChatMessageList
  addTurn(turn: ChatTurn): void
  startStreaming(userMessage: string, model?: string, presets?: readonly AnalysisPreset[]): void
  setStreamText(text: string): void
  finalizeTurn(turn: ChatTurn): void
  showError(message: string): void
  setActiveTurn(index: number): void

  // Delegate to ChatInput
  getSelectedModel(): string | undefined
  getSelectedPresets(): readonly AnalysisPreset[]
  setLoading(loading: boolean): void
  openSettings(message?: string): void
  focusInput(): void

  // State
  isVisible(): boolean
}
```

DOM structure:
```
wrapper [data-agent-overlay-chat] (absolute, resizable, draggable from header)
├── header [data-agent-overlay-nav] (sticky, drag handle)
│   ├── navLeft (← N/M →)
│   └── navRight (– ×)
├── messageListContainer (flex:1, overflow-y:auto)
│   └── ChatMessageList
├── ChatInput (sticky bottom)
```

Uses `makeResizable(wrapper)` + `makeDraggable(wrapper, { handle: header })`.

- [ ] **Step 4: Run tests — verify pass**
- [ ] **Step 5: Commit**
```bash
git add src/core/ui/chat-panel.ts src/core/ui/chat-panel.test.ts
git commit -m "feat: create ChatPanel orchestrator component"
```

---

### Task 9: Wire ChatPanel in agent-overlay (TDD)

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

This is the integration task. Replace PromptInput + ExplanationPopup with ChatPanel. Add multi-turn orchestration.

- [ ] **Step 1: Update tests**

Replace all references to prompt-input/explanation-popup patterns with ChatPanel patterns. Add new multi-turn tests:

1. Selection opens ChatPanel with input focused
2. First turn: submit → streaming → finalizeTurn → overlays
3. Follow-up turn: submit → streaming → finalizeTurn → new overlays replace old
4. Click previous turn → switches overlays via onTurnClick
5. New selection → saves current chat to history, opens new ChatPanel
6. History navigation → restores chat with all turns
7. Abort during streaming works
8. chatMessages built correctly for multi-turn API call
9. Close → clears overlays, clears selection
10. BYOK: missing key opens settings

Key test helper update:
```ts
function createMockProvider(result: AnalysisResult = {}): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue(result),
  }
}

function createStreamingProvider(chunks: string[]): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue({}),
    async *analyzeStream() {
      for (const chunk of chunks) yield chunk
    },
  }
}
```

- [ ] **Step 2: Rewrite agent-overlay imports and initialization**

Replace:
```ts
import { PromptInput } from './ui/prompt-input'
import { ExplanationPopup } from './ui/explanation-popup'
```
With:
```ts
import { ChatPanel } from './ui/chat-panel'
```

Replace initialization:
```ts
// Old
const promptInput = new PromptInput(chartEl, { ... })
const explanationPopup = new ExplanationPopup(chartEl)

// New
const chatPanel = new ChatPanel(chartEl, {
  availableModels: options.provider.availableModels,
  presets,
  requiresApiKey: options.provider.requiresApiKey,
  apiKeyStorageKey: options.apiKeyStorageKey,
})
```

- [ ] **Step 3: Implement multi-turn runAnalysis**

The core change: `runAnalysis` now manages conversation turns.

```ts
let currentTurns: ChatTurn[] = []

async function runAnalysis(
  context: ChartContext,
  userMessage: string,
  additionalSystemPrompt: string | undefined,
  currentRange: { readonly from: TimeValue; readonly to: TimeValue },
): Promise<void> {
  // Build chatMessages from existing turns
  const chatMessages: ChatMessage[] = []
  const firstTurnUserMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${userMessage}`

  if (currentTurns.length === 0) {
    // First turn: include chart data
    chatMessages.push({ role: 'user', content: firstTurnUserMessage })
  } else {
    // Rebuild from existing turns
    chatMessages.push({
      role: 'user',
      content: `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${currentTurns[0].userMessage}`,
    })
    for (const turn of currentTurns) {
      chatMessages.push({ role: 'assistant', content: turn.rawResponse })
      // Skip adding user message for first turn (already added)
      if (turn !== currentTurns[0]) {
        // This is wrong — need to add user messages for turns 1+
      }
    }
    // Actually, rebuild properly:
    // Turn 0: user (with chart data) + assistant
    // Turn 1+: user (question only) + assistant
    // Current: user (question only)
  }

  // ... streaming/non-streaming paths
  // On completion: build ChatTurn, add to currentTurns
  // Update history via historyStore.push() or historyStore.updateLatest()
}
```

The message-building logic:
```ts
function buildChatMessages(
  context: ChartContext,
  turns: readonly ChatTurn[],
  currentUserMessage: string,
): ChatMessage[] {
  const messages: ChatMessage[] = []

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    if (i === 0) {
      // First turn includes chart data
      messages.push({
        role: 'user',
        content: `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${turn.userMessage}`,
      })
    } else {
      messages.push({ role: 'user', content: turn.userMessage })
    }
    messages.push({ role: 'assistant', content: turn.rawResponse })
  }

  // Current question
  if (turns.length === 0) {
    messages.push({
      role: 'user',
      content: `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${currentUserMessage}`,
    })
  } else {
    messages.push({ role: 'user', content: currentUserMessage })
  }

  return messages
}
```

- [ ] **Step 4: Wire event callbacks**

```ts
// Selection → open ChatPanel
rangeSelector.onSelect = (range) => {
  cancelInFlight()
  // Save current chat to history if exists
  if (currentTurns.length > 0) {
    // Already saved via push/updateLatest during analysis
  }
  currentTurns = []
  chatPanel.show({
    position: getSmartPosition(range),
    currentIndex: historyStore.size(),
    totalCount: historyStore.size(),
  })
  chatPanel.focusInput()
}

// Submit from ChatInput
chatPanel.onSubmit = async (userMessage: string) => {
  const { context, currentRange } = buildAnalysisContext()
  await runAnalysis(context, userMessage, undefined, currentRange)
}

// Turn click → switch overlays
chatPanel.onTurnClick = (index: number) => {
  const turn = currentTurns[index]
  if (!turn) return
  renderer.clear()
  renderer.render(turn.result)
  chatPanel.setActiveTurn(index)
}

// Close
chatPanel.onClose = () => {
  renderer.clear()
  rangeSelector.clearSelection()
  currentTurns = []
}

// History navigation
chatPanel.onNavigate = (direction: -1 | 1) => {
  const targetIndex = currentHistoryIndex + direction
  if (targetIndex >= 0 && targetIndex < historyStore.size()) {
    showHistoryEntry(targetIndex)
  }
}
```

- [ ] **Step 5: Update showHistoryEntry for multi-turn**

```ts
function showHistoryEntry(index: number): void {
  const entry = historyStore.get(index)
  if (!entry) return

  currentHistoryIndex = index
  currentTurns = [...entry.turns]

  chatPanel.show({
    position: getSmartPosition(entry.range),
    currentIndex: index,
    totalCount: historyStore.size(),
  })

  // Add all turns to the message list
  for (const turn of entry.turns) {
    chatPanel.addTurn(turn)
  }

  // Show latest turn's overlays
  const lastTurn = entry.turns[entry.turns.length - 1]
  if (lastTurn) {
    renderer.render(lastTurn.result)
    chatPanel.setActiveTurn(entry.turns.length - 1)
  }

  rangeSelector.setRange(entry.range as { from: never; to: never })
}
```

- [ ] **Step 6: Run tests — verify all pass**
- [ ] **Step 7: Run full test suite** — `pnpm test`
- [ ] **Step 8: Run quality checks** — `pnpm check`
- [ ] **Step 9: Commit**
```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: wire ChatPanel in agent-overlay with multi-turn support"
```

---

### Task 10: Delete old files, update exports, final verification

**Files:**
- Delete: `src/core/ui/prompt-input.ts`, `src/core/ui/prompt-input.test.ts`
- Delete: `src/core/ui/explanation-popup.ts`, `src/core/ui/explanation-popup.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Delete old files**

```bash
rm src/core/ui/prompt-input.ts src/core/ui/prompt-input.test.ts
rm src/core/ui/explanation-popup.ts src/core/ui/explanation-popup.test.ts
```

- [ ] **Step 2: Update exports in src/index.ts**

Add new type exports:
```ts
export type { ChatMessage, ChatTurn } from './core/types'
```

Remove any references to deleted files if they were exported.

- [ ] **Step 3: Run full quality gate**
```bash
pnpm check
```

- [ ] **Step 4: Run full test suite with coverage**
```bash
pnpm test:coverage
```
Verify coverage >= 80% on new files.

- [ ] **Step 5: Build**
```bash
pnpm build
```

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: remove prompt-input and explanation-popup, update exports"
```

---

## Dependency Graph

```
Task 1 (types) ──────────────────────────────────┐
Task 2 (make-resizable) ─────────────────────────┤
Task 3 (makeDraggable handle) ───────────────────┤
                                                  │
Task 4 (HistoryStore) ────── (needs 1) ──────────┤
Task 5 (Provider multi-turn) ── (needs 1) ──────┤
                                                  │
Task 6 (chat-input) ─────── (needs 1) ──────────┤
Task 7 (chat-message-list) ── (needs 1) ────────┤
                                                  │
Task 8 (chat-panel) ─── (needs 2,3,6,7) ────────┤
                                                  │
Task 9 (agent-overlay) ── (needs all above) ─────┤
Task 10 (cleanup) ─────── (needs 9) ─────────────┘
```

**Parallelizable groups:**
- Tasks 1, 2, 3 can run in parallel
- Tasks 4, 5, 6, 7 can run in parallel (each only depends on Task 1)
- Task 8 depends on 2, 3, 6, 7
- Task 9 depends on all previous
- Task 10 depends on 9
