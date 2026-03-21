# Responsive Layout & Touch Support Design

## Goal

Make lightweight-chart-agent-overlay usable on small screens (mobile browsers, small dashboard widgets) and touch devices without changing the public API.

## Approach

Two-step adaptation:

1. **Layout**: Detect container width via `ResizeObserver`. Below 480px, ChatPanel switches to fullscreen overlay ("compact mode"). Above 480px, existing floating window behavior is unchanged.
2. **Touch**: Extract a shared `pointer-events.ts` helper that unifies mouse and touch events. Retrofit all drag/select interactions to use it.

## Breakpoint Strategy

- Use **container width** (not viewport width) because this is a library — the chart may be embedded in any size container.
- Threshold: **480px**.
- Detection: `ResizeObserver` on `chart.chartElement()`.
- `agent-overlay.ts` calls `chatPanel.setCompact(isCompact)` on resize.
- The ResizeObserver callback skips the call when the compact state hasn't changed (avoids layout thrashing when width oscillates around 480px during drag-resize).

## Compact Mode (< 480px)

### Layout

ChatPanel switches to `position: absolute; inset: 0; z-index: 9999` within the chart container (which is already `position: relative`):

```
┌──────────────────────────┐
│ [✕]  ◀ 1/3 ▶   [Model▾] │  header (fixed top)
├──────────────────────────┤
│                          │
│   Chat messages          │  scrollable area
│   (scrollable)           │
│                          │
├──────────────────────────┤
│ [Presets▾]               │  toolbar
├──────────────────────────┤
│ Ask about this range...  │  textarea
│                     [↑]  │
└──────────────────────────┘
```

Using `position: absolute` instead of `position: fixed` because `fixed` breaks when any ancestor has `transform`, `will-change`, or `filter` CSS — common in embedded dashboard scenarios. Since the chart container is already `position: relative`, `absolute; inset: 0` fills the container reliably.

### Behavioral changes in compact mode

- **Drag disabled** — panel fills container, no dragging.
- **Resize disabled** — panel fills container, no resize handles.
- **Divider disabled** — the draggable divider between messages and input is hidden; messages area fills available space via flex.

### Virtual keyboard handling

When the user taps the textarea on mobile, the virtual keyboard pushes the viewport up. Use `visualViewport` API:

- Listen to `window.visualViewport.resize`.
- Set panel height to `visualViewport.height` instead of `100%`.
- This keeps the textarea visible above the keyboard.
- Graceful degradation: if `visualViewport` is not available, fall back to `100%` (keyboard may overlap on very old browsers).

### Safe area insets

On devices with notches or rounded corners, use `env(safe-area-inset-*)` for padding on the header (top) and textarea area (bottom) to prevent content from rendering behind the notch or home indicator.

### Transition between modes

- `ResizeObserver` fires when container resizes (e.g., device rotation, dashboard resize).
- `setCompact(true)` applies fullscreen styles, disables drag/resize/divider.
- `setCompact(false)` restores floating styles, re-enables drag/resize/divider.
- If panel is currently hidden, the mode is stored and applied on next `show()`.

## Touch Support

### Pointer events helper

New file: `src/core/ui/pointer-events.ts`

```ts
interface PointerCallbacks {
  onStart(pos: { clientX: number; clientY: number }): void
  onMove(pos: { clientX: number; clientY: number }): void
  onEnd(pos: { clientX: number; clientY: number }): void
}

// Lazy-attach pattern: binds mousedown/touchstart on el,
// then binds move/end on document only after start fires.
function onPointerDown(
  el: HTMLElement,
  callbacks: PointerCallbacks,
  options?: { passive?: boolean },
): () => void
```

Behavior:
- Binds both `mousedown` and `touchstart` on `el`.
- On start, binds `mousemove/mouseup` or `touchmove/touchend` on `document`.
- On end, removes move/end listeners from `document`.
- Normalizes touch events: extracts `touches[0]` (or `changedTouches[0]` for `touchend`).
- Calls `e.preventDefault()` on touch events to prevent page scrolling during drag.
- Touch listeners are registered with `{ passive: false }` to allow `preventDefault()`.
- Returns a cleanup function that removes all listeners.

### Propagation helper

A separate small utility for stopPropagation on both mouse and touch:

```ts
function stopPointerPropagation(el: HTMLElement): () => void
```

Binds both `mousedown` and `touchstart` with `e.stopPropagation()`. Used by `chat-panel.ts` wrapper, `dropdown.ts`, `history-button.ts`, `settings-panel.ts`.

### Consumers

| File | Current | After |
|------|---------|-------|
| `make-draggable.ts` | `mousedown/move/up` | `onPointerDown()` |
| `make-resizable.ts` | `mousedown/move/up` | `onPointerDown()` |
| `range-selector.ts` | `mousedown/move/up` (always-attached) | Refactor to `onPointerDown()` lazy-attach pattern. Currently binds `mousemove` always and guards with `if (startX === null)`. Lazy-attach is equivalent and cleaner. |
| `chat-panel.ts` (divider) | `mousedown/move/up` | `onPointerDown()` |
| `chat-panel.ts` (wrapper) | `mousedown` stopPropagation | `stopPointerPropagation()` |
| `dropdown.ts` | `mousedown` outside-click | Add `touchstart` equivalent |
| `history-button.ts` | `mousedown` stopPropagation | `stopPointerPropagation()` |
| `settings-panel.ts` | `mousedown` stopPropagation | `stopPointerPropagation()` |

### Return type for makeDraggable / makeResizable

Currently both return `() => void` (cleanup only). Change to:

```ts
interface JsonHandle {
  enable(): void
  disable(): void
  destroy(): void
}
```

- `enable()` — re-attaches pointer listeners.
- `disable()` — removes pointer listeners, cancels any in-progress drag.
- `destroy()` — calls `disable()` + cleans up DOM (resize handles, etc.).

`ChatPanel` stores these handles and calls `disable()`/`enable()` from `setCompact()`.

### Touch-specific considerations

- `touch-action: none` CSS applied **conditionally** on the chart element — only when selection mode is enabled (`RangeSelector.setEnabled(true)`). When selection is off, the property is removed so native Lightweight Charts touch gestures (pan, scroll) work normally.
- `touch-action: none` applied on drag handles and resize handles unconditionally (they always need to capture touch).
- Range selection hit area is already the full chart canvas, which is large enough for fingers.
- Resize handles are not needed on mobile (compact mode disables resize).

## Files Changed

| File | Change |
|------|--------|
| `src/core/ui/pointer-events.ts` | **New** — `onPointerDown()` + `stopPointerPropagation()` helpers |
| `src/core/ui/chat-panel.ts` | Add `setCompact()`, conditional drag/resize/divider, virtual keyboard handling, safe area insets, use `onPointerDown` for divider, `stopPointerPropagation` for wrapper |
| `src/core/agent-overlay.ts` | Add `ResizeObserver` with skip-if-unchanged guard, call `setCompact()` |
| `src/core/ui/make-draggable.ts` | Use `onPointerDown()`, return `DraggableHandle` with `enable()`/`disable()`/`destroy()` |
| `src/core/ui/make-resizable.ts` | Use `onPointerDown()`, return `ResizableHandle` with `enable()`/`disable()`/`destroy()` |
| `src/core/selection/range-selector.ts` | Refactor to lazy-attach pattern, use `onPointerDown()`, conditional `touch-action: none` |
| `src/core/ui/dropdown.ts` | Add `touchstart` to outside-click handler |
| `src/core/ui/history-button.ts` | Use `stopPointerPropagation()` |
| `src/core/ui/settings-panel.ts` | Use `stopPointerPropagation()` |

## Files NOT Changed

- `ChatInput` — flex layout, auto-fills parent. No changes needed.
- `ChatMessageList` — scrollable div, auto-fills parent. No changes needed.
- Public API (`AgentOverlay`, `AgentOverlayOptions`) — no new options. Responsive behavior is automatic.
- Provider interface — unrelated.

## Testing Strategy

- **Unit tests** for `pointer-events.ts`: verify mouse and touch event normalization, `stopPointerPropagation`.
- **Unit tests** for `setCompact()`: verify style changes and drag/resize/divider disable.
- **Unit tests** for `make-draggable.ts` / `make-resizable.ts`: verify `enable()`/`disable()`/`destroy()` methods.
- **Unit tests** for `range-selector.ts`: verify touch events trigger selection.
- **Existing tests**: should continue to pass since no API changes.

## Out of Scope

- CSS media queries (we use container width, not viewport).
- Pinch-to-zoom on chart (this is a Lightweight Charts concern, not ours).
- Landscape-specific layouts (fullscreen works for both orientations).
- Custom breakpoint configuration (YAGNI — 480px is hardcoded, can be extracted later if needed).
