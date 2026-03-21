import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeDraggable } from './make-draggable'

function createMockElement(rect: Partial<DOMRect> = {}): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 300,
    height: 40,
    right: 300,
    bottom: 40,
    x: 0,
    y: 0,
    toJSON: () => '',
    ...rect,
  })
  Object.defineProperty(el, 'offsetLeft', { value: 10, writable: true })
  Object.defineProperty(el, 'offsetTop', { value: 20, writable: true })
  Object.defineProperty(el, 'offsetWidth', { value: 300, writable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 40, writable: true })
  return el
}

function createMockParent(): HTMLElement {
  const parent = document.createElement('div')
  parent.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    width: 800,
    height: 600,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => '',
  })
  return parent
}

describe('makeDraggable', () => {
  let element: HTMLElement
  let parent: HTMLElement

  beforeEach(() => {
    parent = createMockParent()
    element = createMockElement()
    // Mock offsetParent so drag movement logic is exercised in jsdom
    Object.defineProperty(element, 'offsetParent', { value: parent, configurable: true })
    parent.appendChild(element)
    document.body.appendChild(parent)
  })

  it('should attach mousedown listener', () => {
    const spy = vi.spyOn(element, 'addEventListener')
    makeDraggable(element)
    expect(spy).toHaveBeenCalledWith('mousedown', expect.any(Function))
  })

  it('should return handle with destroy() that removes listeners', () => {
    const spy = vi.spyOn(element, 'removeEventListener')
    const handle = makeDraggable(element)
    handle.destroy()
    expect(spy).toHaveBeenCalledWith('mousedown', expect.any(Function))
  })

  it('should not drag when target matches exclude selector', () => {
    const input = document.createElement('input')
    element.appendChild(input)
    makeDraggable(element, { exclude: 'input' })

    const mousedown = new MouseEvent('mousedown', { clientX: 50, clientY: 50 })
    Object.defineProperty(mousedown, 'target', { value: input })
    element.dispatchEvent(mousedown)

    // If drag was NOT started, mousemove should have no effect
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))

    // Element position should not change
    expect(element.style.left).toBe('')
  })

  it('should update element position during drag', () => {
    makeDraggable(element)

    // Start drag at (10, 10) — element rect starts at (0, 0)
    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))

    // Move to (100, 80) — new position = (100 - 0 - 10, 80 - 0 - 10) = (90, 70)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 80 }))

    expect(element.style.left).toBe('90px')
    expect(element.style.top).toBe('70px')
    expect(element.style.right).toBe('auto')
    expect(element.style.transform).toBe('none')

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('should clamp position to parent bounds', () => {
    makeDraggable(element)

    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))

    // Move far beyond parent bounds (parent is 800x600, element is 300x40)
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 2000, clientY: 2000 }))

    // Should be clamped: left <= 800 - 300 = 500, top <= 600 - 40 = 560
    expect(parseInt(element.style.left)).toBeLessThanOrEqual(500)
    expect(parseInt(element.style.top)).toBeLessThanOrEqual(560)

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('should clamp position to minimum 0', () => {
    makeDraggable(element)

    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))

    // Move to negative coordinates
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -500, clientY: -500 }))

    expect(parseInt(element.style.left)).toBe(0)
    expect(parseInt(element.style.top)).toBe(0)

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('should not move when isDragging is false', () => {
    makeDraggable(element)

    // Dispatch mousemove without prior mousedown
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))

    expect(element.style.left).toBe('')
  })

  it('should call onDragEnd with position on mouseup', () => {
    const onDragEnd = vi.fn()
    makeDraggable(element, { onDragEnd })

    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(onDragEnd).toHaveBeenCalledWith({
      left: element.offsetLeft,
      top: element.offsetTop,
    })
  })

  it('should stop dragging after mouseup', () => {
    makeDraggable(element)

    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    const leftAfterUp = element.style.left

    // Further mousemove should not change position
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
    expect(element.style.left).toBe(leftAfterUp)
  })

  it('should skip drag movement when offsetParent is null', () => {
    Object.defineProperty(element, 'offsetParent', { value: null, configurable: true })
    makeDraggable(element)

    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))

    // Position should not change
    expect(element.style.left).toBe('')

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('handle option limits drag trigger to specified element', () => {
    const handle = document.createElement('div')
    handle.style.cssText = 'width: 100px; height: 30px;'
    element.appendChild(handle)

    const draggable = makeDraggable(element, { handle })

    // Mousedown on the element body (not handle) — should NOT drag
    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 150 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    const leftAfterBodyDrag = parseFloat(element.style.left) || 0

    // Mousedown on the handle — SHOULD drag
    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, clientY: 50, bubbles: true }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 150 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    const leftAfterHandleDrag = parseFloat(element.style.left) || 0

    // The handle drag should have moved the element
    expect(leftAfterHandleDrag).not.toBe(leftAfterBodyDrag)

    draggable.destroy()
  })

  it('exclude option still works when handle is not set', () => {
    const button = document.createElement('button')
    element.appendChild(button)

    makeDraggable(element, { exclude: 'button' })

    const mousedown = new MouseEvent('mousedown', { clientX: 50, clientY: 50 })
    Object.defineProperty(mousedown, 'target', { value: button })
    element.dispatchEvent(mousedown)

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 150 }))

    // Drag was blocked by exclude — position should not change
    expect(element.style.left).toBe('')

    document.dispatchEvent(new MouseEvent('mouseup'))
  })

  it('disable() stops drag from working', () => {
    const handle = makeDraggable(element)

    handle.disable()

    // Attempt to drag after disable
    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(element.style.left).toBe('')
  })

  it('enable() after disable() restores drag', () => {
    const handle = makeDraggable(element)

    handle.disable()
    handle.enable()

    // Drag should work again
    element.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10 }))
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 80 }))
    document.dispatchEvent(new MouseEvent('mouseup'))

    expect(element.style.left).toBe('90px')
    expect(element.style.top).toBe('70px')
  })
})
