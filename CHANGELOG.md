# lightweight-chart-agent-overlay

## 0.3.1

### Patch Changes

- 87bb782: Add responsive layout and touch support

  - Compact mode: ChatPanel fills chart container when width < 480px (auto-detected via ResizeObserver)
  - Touch support: range selection, panel drag, and all interactions work with touch events
  - Unified `onPointerDown` helper for mouse + touch with lazy-attach pattern
  - `makeDraggable` / `makeResizable` now return handle objects with `enable()` / `disable()` / `destroy()`
  - Dropdown opens upward when insufficient space below
  - Virtual keyboard handling via `visualViewport` API
  - Safe area insets for notched devices
  - Touch propagation fixes across dropdown, history button, settings panel
  - CI: release workflow now waits for CI to pass before publishing

## 0.3.0

### Minor Changes

- Add Chat Panel for multi-turn conversation

  - Replace prompt-input and explanation-popup with unified ChatPanel component
  - Multi-turn follow-up questions within the same analysis context
  - Per-turn overlay switching — click a turn to view its price lines and markers
  - Window-like panel: draggable from header, resizable from all edges/corners, collapsible
  - Draggable divider between toolbar and textarea to adjust input area height
  - Auto-hide scrollbar on message list and textarea
  - Add `chatMessages` to AnalyzeOptions for multi-turn provider support
  - Add `updateLatest()` to HistoryStore for conversation updates
  - Add `makeResizable` utility and `makeDraggable` handle option
  - Breaking: `HistoryEntry` type changed (now uses `turns: ChatTurn[]`)
  - New exports: `ChatMessage`, `ChatTurn` types

## 0.2.0

### Minor Changes

- Add streaming LLM response support

  - Add optional `analyzeStream()` method to `LLMProvider` for streaming responses
  - Explanation text displays progressively with real-time markdown rendering via `marked`
  - Overlays (price lines, markers) render after stream completion
  - Add shared SSE parser utility (`parseSSE`)
  - Add `parseStreamedResponse()` for text + JSON fence format
  - Add `maxTokens` option to built-in providers (default: 8192)
  - Sanitize rendered HTML with DOMPurify
  - System prompt simplified for markdown-native output

## 0.1.0

### Minor Changes

- Initial release: AI-powered analysis overlay for TradingView Lightweight Charts
