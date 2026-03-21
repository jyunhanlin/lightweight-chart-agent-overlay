// src/core/ui/make-draggable.ts
import { onPointerDown } from './pointer-events'

export interface DragOptions {
  /** CSS selector for elements that should NOT trigger drag (e.g. 'input, button') */
  readonly exclude?: string
  /** Only this element triggers drag; clicks elsewhere on the main element are ignored */
  readonly handle?: HTMLElement
  /** Called when drag ends with the final position */
  readonly onDragEnd?: (position: { left: number; top: number }) => void
}

export interface DraggableHandle {
  enable(): void
  disable(): void
  destroy(): void
}

/**
 * Makes an absolutely-positioned element draggable.
 * Returns a DraggableHandle to enable, disable, or destroy the drag behaviour.
 */
export function makeDraggable(element: HTMLElement, options?: DragOptions): DraggableHandle {
  let offsetX = 0
  let offsetY = 0

  const dragTarget = options?.handle ?? element

  let cleanupPointer: (() => void) | null = null

  const attach = () => {
    cleanupPointer = onPointerDown(dragTarget, {
      onStart(pos) {
        // Skip if target matches exclude selector
        if (options?.exclude && (pos.event.target as HTMLElement).closest(options.exclude)) {
          return false
        }

        const rect = element.getBoundingClientRect()
        offsetX = pos.clientX - rect.left
        offsetY = pos.clientY - rect.top
      },

      onMove({ clientX, clientY }) {
        const parent = element.offsetParent as HTMLElement | null
        if (!parent) return

        const parentRect = parent.getBoundingClientRect()
        const left = Math.max(
          0,
          Math.min(clientX - parentRect.left - offsetX, parentRect.width - element.offsetWidth),
        )
        const top = Math.max(
          0,
          Math.min(clientY - parentRect.top - offsetY, parentRect.height - element.offsetHeight),
        )

        element.style.left = `${left}px`
        element.style.top = `${top}px`
        // Clear any transform/right/bottom that might conflict
        element.style.right = 'auto'
        element.style.transform = 'none'
      },

      onEnd() {
        if (options?.onDragEnd) {
          options.onDragEnd({
            left: element.offsetLeft,
            top: element.offsetTop,
          })
        }
      },
    })
  }

  const detach = () => {
    cleanupPointer?.()
    cleanupPointer = null
  }

  // Start enabled
  attach()

  return {
    enable() {
      detach()
      attach()
    },
    disable() {
      detach()
    },
    destroy() {
      detach()
    },
  }
}
