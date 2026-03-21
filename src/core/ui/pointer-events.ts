export interface PointerPos {
  readonly clientX: number
  readonly clientY: number
  readonly event: Event
}

export interface PointerCallbacks {
  /** Return false to cancel the gesture (no move/end will fire). */
  onStart(pos: PointerPos): void | false
  onMove(pos: { clientX: number; clientY: number }): void
  onEnd(pos: { clientX: number; clientY: number }): void
}

/**
 * Attaches unified pointer (mouse + touch) handlers on `el`.
 * Move/end listeners are lazily added to `document` only while a gesture is active.
 * Returns a cleanup function that removes all listeners.
 */
export function onPointerDown(el: HTMLElement, callbacks: PointerCallbacks): () => void {
  // --- Mouse ---

  const onMouseMove = (e: MouseEvent) => {
    callbacks.onMove({ clientX: e.clientX, clientY: e.clientY })
  }

  const onMouseUp = (e: MouseEvent) => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    callbacks.onEnd({ clientX: e.clientX, clientY: e.clientY })
  }

  const onMouseDown = (e: MouseEvent) => {
    const result = callbacks.onStart({ clientX: e.clientX, clientY: e.clientY, event: e })
    if (result === false) return
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // --- Touch ---

  const onTouchMove = (e: TouchEvent) => {
    e.preventDefault()
    const t = e.touches[0]
    callbacks.onMove({ clientX: t.clientX, clientY: t.clientY })
  }

  const onTouchEnd = (e: TouchEvent) => {
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    const t = e.changedTouches[0]
    callbacks.onEnd({ clientX: t.clientX, clientY: t.clientY })
  }

  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]
    const result = callbacks.onStart({ clientX: t.clientX, clientY: t.clientY, event: e })
    if (result === false) return
    e.preventDefault()
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
  }

  el.addEventListener('mousedown', onMouseDown)
  el.addEventListener('touchstart', onTouchStart, { passive: false })

  return () => {
    el.removeEventListener('mousedown', onMouseDown)
    el.removeEventListener('touchstart', onTouchStart)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
  }
}

function stopPropagation(e: Event) {
  e.stopPropagation()
}

/**
 * Stops mousedown and touchstart propagation on `el`.
 * Returns a cleanup function that removes the listeners.
 */
export function stopPointerPropagation(el: HTMLElement): () => void {
  el.addEventListener('mousedown', stopPropagation)
  el.addEventListener('touchstart', stopPropagation)

  return () => {
    el.removeEventListener('mousedown', stopPropagation)
    el.removeEventListener('touchstart', stopPropagation)
  }
}
