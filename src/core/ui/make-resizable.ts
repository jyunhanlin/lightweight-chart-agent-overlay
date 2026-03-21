// src/core/ui/make-resizable.ts

import { onPointerDown } from './pointer-events'

export interface ResizeOptions {
  readonly minWidth?: number
  readonly minHeight?: number
  readonly maxWidth?: number
  readonly maxHeight?: number
  /** Hit area width in px, default: 6 */
  readonly edges?: number
}

export interface ResizableHandle {
  enable(): void
  disable(): void
  destroy(): void
}

type Direction = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se'

interface HandleConfig {
  readonly direction: Direction
  readonly cursor: string
  readonly style: Partial<CSSStyleDeclaration>
}

const CURSOR_MAP: Record<Direction, string> = {
  n: 'n-resize',
  s: 's-resize',
  e: 'e-resize',
  w: 'w-resize',
  nw: 'nw-resize',
  ne: 'ne-resize',
  sw: 'sw-resize',
  se: 'se-resize',
}

function buildHandleConfigs(edgePx: number): HandleConfig[] {
  const corner = edgePx * 2
  const cornerStr = `${corner}px`
  const edgeStr = `${edgePx}px`

  return [
    // Edges
    {
      direction: 'n',
      cursor: CURSOR_MAP.n,
      style: { top: '0', left: edgeStr, right: edgeStr, height: edgeStr },
    },
    {
      direction: 's',
      cursor: CURSOR_MAP.s,
      style: { bottom: '0', left: edgeStr, right: edgeStr, height: edgeStr },
    },
    {
      direction: 'e',
      cursor: CURSOR_MAP.e,
      style: { top: edgeStr, bottom: edgeStr, right: '0', width: edgeStr },
    },
    {
      direction: 'w',
      cursor: CURSOR_MAP.w,
      style: { top: edgeStr, bottom: edgeStr, left: '0', width: edgeStr },
    },
    // Corners (higher z-index so they override edges)
    {
      direction: 'nw',
      cursor: CURSOR_MAP.nw,
      style: { top: '0', left: '0', width: cornerStr, height: cornerStr },
    },
    {
      direction: 'ne',
      cursor: CURSOR_MAP.ne,
      style: { top: '0', right: '0', width: cornerStr, height: cornerStr },
    },
    {
      direction: 'sw',
      cursor: CURSOR_MAP.sw,
      style: { bottom: '0', left: '0', width: cornerStr, height: cornerStr },
    },
    {
      direction: 'se',
      cursor: CURSOR_MAP.se,
      style: { bottom: '0', right: '0', width: cornerStr, height: cornerStr },
    },
  ]
}

function createHandle(config: HandleConfig, isCorner: boolean): HTMLElement {
  const handle = document.createElement('div')
  handle.setAttribute('data-resize', config.direction)
  handle.style.position = 'absolute'
  handle.style.cursor = config.cursor
  handle.style.zIndex = isCorner ? '2' : '1'
  // Apply direction-specific style
  const s = config.style
  if (s.top !== undefined) handle.style.top = s.top
  if (s.bottom !== undefined) handle.style.bottom = s.bottom
  if (s.left !== undefined) handle.style.left = s.left
  if (s.right !== undefined) handle.style.right = s.right
  if (s.width !== undefined) handle.style.width = s.width
  if (s.height !== undefined) handle.style.height = s.height
  return handle
}

/**
 * Makes an absolutely-positioned element resizable from all 4 edges and 4 corners.
 * Returns a ResizableHandle with enable/disable/destroy methods.
 */
export function makeResizable(element: HTMLElement, options?: ResizeOptions): ResizableHandle {
  const minWidth = options?.minWidth ?? 320
  const minHeight = options?.minHeight ?? 200
  const maxWidth = options?.maxWidth ?? Infinity
  const maxHeight = options?.maxHeight ?? Infinity
  const edgePx = options?.edges ?? 6

  const CORNER_DIRECTIONS = new Set<Direction>(['nw', 'ne', 'sw', 'se'])
  const configs = buildHandleConfigs(edgePx)
  const handleEls: HTMLElement[] = configs.map((cfg) =>
    createHandle(cfg, CORNER_DIRECTIONS.has(cfg.direction)),
  )

  for (const handleEl of handleEls) {
    element.appendChild(handleEl)
  }

  // Each handle binds its own pointer listener; cleanup functions are stored here
  let cleanupFns: Array<() => void> = []

  function attachListeners(): void {
    cleanupFns = configs.map((cfg, i) => {
      const handleEl = handleEls[i]
      const direction = cfg.direction

      let startX = 0
      let startY = 0
      let startLeft = 0
      let startTop = 0
      let startWidth = 0
      let startHeight = 0

      return onPointerDown(handleEl, {
        onStart(pos) {
          pos.event.preventDefault()
          pos.event.stopPropagation()

          startX = pos.clientX
          startY = pos.clientY

          const rect = element.getBoundingClientRect()
          startLeft = rect.left
          startTop = rect.top
          startWidth = rect.width
          startHeight = rect.height

          // Prefer inline style values when available, fall back to computed rect
          if (element.style.left) startLeft = parseFloat(element.style.left)
          if (element.style.top) startTop = parseFloat(element.style.top)
          if (element.style.width) startWidth = parseFloat(element.style.width)
          if (element.style.height) startHeight = parseFloat(element.style.height)
        },

        onMove(pos) {
          const dx = pos.clientX - startX
          const dy = pos.clientY - startY

          let newLeft = startLeft
          let newTop = startTop
          let newWidth = startWidth
          let newHeight = startHeight

          // Horizontal axis
          if (direction.includes('e')) {
            newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx))
          } else if (direction.includes('w')) {
            const rawWidth = startWidth - dx
            const clampedWidth = Math.min(maxWidth, Math.max(minWidth, rawWidth))
            newLeft = startLeft + (startWidth - clampedWidth)
            newWidth = clampedWidth
          }

          // Vertical axis
          if (direction.includes('s')) {
            newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + dy))
          } else if (direction.includes('n')) {
            const rawHeight = startHeight - dy
            const clampedHeight = Math.min(maxHeight, Math.max(minHeight, rawHeight))
            newTop = startTop + (startHeight - clampedHeight)
            newHeight = clampedHeight
          }

          element.style.left = `${newLeft}px`
          element.style.top = `${newTop}px`
          element.style.width = `${newWidth}px`
          element.style.height = `${newHeight}px`
        },

        onEnd(_pos) {
          // nothing extra needed; onPointerDown already cleans up document listeners
        },
      })
    })
  }

  function detachListeners(): void {
    for (const fn of cleanupFns) {
      fn()
    }
    cleanupFns = []
  }

  // Start enabled
  attachListeners()

  return {
    enable() {
      detachListeners()
      attachListeners()
    },
    disable() {
      detachListeners()
    },
    destroy() {
      detachListeners()
      for (const handleEl of handleEls) {
        handleEl.remove()
      }
    },
  }
}
