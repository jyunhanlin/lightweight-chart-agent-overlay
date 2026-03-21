import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { onPointerDown, stopPointerPropagation } from './pointer-events'

function createTouchEvent(type: string, clientX: number, clientY: number): TouchEvent {
  const touch = {
    identifier: 1,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY,
    screenX: clientX,
    screenY: clientY,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
    target: document.body,
  } as Touch

  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
    cancelable: true,
  })
}

describe('onPointerDown', () => {
  let el: HTMLElement

  beforeEach(() => {
    el = document.createElement('div')
    document.body.appendChild(el)
  })

  afterEach(() => {
    el.remove()
  })

  it('calls onStart on mousedown with position and event', () => {
    const onStart = vi.fn()
    onPointerDown(el, { onStart, onMove: vi.fn(), onEnd: vi.fn() })

    const e = new MouseEvent('mousedown', { clientX: 10, clientY: 20 })
    el.dispatchEvent(e)

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith({ clientX: 10, clientY: 20, event: e })
  })

  it('calls onMove on document mousemove after mousedown', () => {
    const onMove = vi.fn()
    onPointerDown(el, { onStart: vi.fn(), onMove, onEnd: vi.fn() })

    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60 }))

    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith({ clientX: 50, clientY: 60 })
  })

  it('does not call onMove without prior mousedown', () => {
    const onMove = vi.fn()
    onPointerDown(el, { onStart: vi.fn(), onMove, onEnd: vi.fn() })

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60 }))

    expect(onMove).not.toHaveBeenCalled()
  })

  it('calls onEnd on mouseup and removes document listeners so subsequent mousemove does not fire', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    onPointerDown(el, { onStart: vi.fn(), onMove, onEnd })

    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 30, clientY: 40 }))

    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith({ clientX: 30, clientY: 40 })

    // Subsequent mousemove should NOT fire onMove (listeners were removed)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 200 }))
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does not call preventDefault on mousedown', () => {
    onPointerDown(el, { onStart: vi.fn(), onMove: vi.fn(), onEnd: vi.fn() })

    const e = new MouseEvent('mousedown', {
      clientX: 10,
      clientY: 20,
      bubbles: true,
      cancelable: true,
    })
    const spy = vi.spyOn(e, 'preventDefault')
    el.dispatchEvent(e)

    expect(spy).not.toHaveBeenCalled()
  })

  it('calls onStart on touchstart with position and event', () => {
    const onStart = vi.fn()
    onPointerDown(el, { onStart, onMove: vi.fn(), onEnd: vi.fn() })

    const e = createTouchEvent('touchstart', 15, 25)
    el.dispatchEvent(e)

    expect(onStart).toHaveBeenCalledOnce()
    expect(onStart).toHaveBeenCalledWith({ clientX: 15, clientY: 25, event: e })
  })

  it('calls onMove on document touchmove after touchstart', () => {
    const onMove = vi.fn()
    onPointerDown(el, { onStart: vi.fn(), onMove, onEnd: vi.fn() })

    el.dispatchEvent(createTouchEvent('touchstart', 15, 25))
    document.dispatchEvent(createTouchEvent('touchmove', 55, 65))

    expect(onMove).toHaveBeenCalledOnce()
    expect(onMove).toHaveBeenCalledWith({ clientX: 55, clientY: 65 })
  })

  it('calls onEnd on touchend using changedTouches', () => {
    const onEnd = vi.fn()
    onPointerDown(el, { onStart: vi.fn(), onMove: vi.fn(), onEnd })

    el.dispatchEvent(createTouchEvent('touchstart', 15, 25))
    document.dispatchEvent(createTouchEvent('touchend', 35, 45))

    expect(onEnd).toHaveBeenCalledOnce()
    expect(onEnd).toHaveBeenCalledWith({ clientX: 35, clientY: 45 })
  })

  it('skips gesture when onStart returns false — no onMove or onEnd fires', () => {
    const onStart = vi.fn(() => false as const)
    const onMove = vi.fn()
    const onEnd = vi.fn()
    onPointerDown(el, { onStart, onMove, onEnd })

    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 60 }))

    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('skips gesture and does not call preventDefault when onStart returns false for touch', () => {
    const onStart = vi.fn(() => false as const)
    onPointerDown(el, { onStart, onMove: vi.fn(), onEnd: vi.fn() })

    const e = createTouchEvent('touchstart', 15, 25)
    const spy = vi.spyOn(e, 'preventDefault')
    el.dispatchEvent(e)

    expect(spy).not.toHaveBeenCalled()
  })

  it('cleanup removes all listeners', () => {
    const onMove = vi.fn()
    const onEnd = vi.fn()
    const cleanup = onPointerDown(el, { onStart: vi.fn(), onMove, onEnd })

    cleanup()

    // After cleanup, mousedown should not start a gesture
    el.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60 }))
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 60 }))

    expect(onMove).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})

describe('stopPointerPropagation', () => {
  let el: HTMLElement
  let parent: HTMLElement

  beforeEach(() => {
    parent = document.createElement('div')
    el = document.createElement('div')
    parent.appendChild(el)
    document.body.appendChild(parent)
  })

  afterEach(() => {
    parent.remove()
  })

  it('stops mousedown propagation', () => {
    stopPointerPropagation(el)

    const parentHandler = vi.fn()
    parent.addEventListener('mousedown', parentHandler)

    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(parentHandler).not.toHaveBeenCalled()
    parent.removeEventListener('mousedown', parentHandler)
  })

  it('stops touchstart propagation', () => {
    stopPointerPropagation(el)

    const parentHandler = vi.fn()
    parent.addEventListener('touchstart', parentHandler)

    el.dispatchEvent(createTouchEvent('touchstart', 0, 0))

    expect(parentHandler).not.toHaveBeenCalled()
    parent.removeEventListener('touchstart', parentHandler)
  })

  it('cleanup restores propagation', () => {
    const cleanup = stopPointerPropagation(el)
    cleanup()

    const parentHandler = vi.fn()
    parent.addEventListener('mousedown', parentHandler)

    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(parentHandler).toHaveBeenCalledOnce()
    parent.removeEventListener('mousedown', parentHandler)
  })
})
