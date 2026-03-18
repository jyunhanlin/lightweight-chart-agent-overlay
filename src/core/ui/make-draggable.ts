// src/core/ui/make-draggable.ts

export interface DragOptions {
  /** CSS selector for elements that should NOT trigger drag (e.g. 'input, button') */
  readonly exclude?: string
  /** Called when drag ends with the final position */
  readonly onDragEnd?: (position: { left: number; top: number }) => void
}

/**
 * Makes an absolutely-positioned element draggable.
 * Returns a cleanup function to remove listeners.
 */
export function makeDraggable(element: HTMLElement, options?: DragOptions): () => void {
  let offsetX = 0
  let offsetY = 0
  let isDragging = false

  const onMouseDown = (e: MouseEvent) => {
    // Skip if target matches exclude selector
    if (options?.exclude && (e.target as HTMLElement).closest(options.exclude)) {
      return
    }

    e.preventDefault()
    const rect = element.getBoundingClientRect()
    offsetX = e.clientX - rect.left
    offsetY = e.clientY - rect.top
    isDragging = true

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return

    const parent = element.offsetParent as HTMLElement | null
    if (!parent) return

    const parentRect = parent.getBoundingClientRect()
    const left = Math.max(
      0,
      Math.min(e.clientX - parentRect.left - offsetX, parentRect.width - element.offsetWidth),
    )
    const top = Math.max(
      0,
      Math.min(e.clientY - parentRect.top - offsetY, parentRect.height - element.offsetHeight),
    )

    element.style.left = `${left}px`
    element.style.top = `${top}px`
    // Clear any transform/right/bottom that might conflict
    element.style.right = 'auto'
    element.style.transform = 'none'
  }

  const onMouseUp = () => {
    isDragging = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)

    if (options?.onDragEnd) {
      options.onDragEnd({
        left: element.offsetLeft,
        top: element.offsetTop,
      })
    }
  }

  element.addEventListener('mousedown', onMouseDown)

  return () => {
    element.removeEventListener('mousedown', onMouseDown)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }
}
