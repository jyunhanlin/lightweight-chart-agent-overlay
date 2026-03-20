import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeResizable } from './make-resizable'

function createPositionedElement(width = 400, height = 300): HTMLElement {
  const el = document.createElement('div')
  el.style.position = 'absolute'
  el.style.left = '50px'
  el.style.top = '50px'
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  document.body.appendChild(el)
  return el
}

function getHandle(el: HTMLElement, direction: string): HTMLElement {
  return el.querySelector(`[data-resize="${direction}"]`) as HTMLElement
}

function simulateResize(el: HTMLElement, direction: string, deltaX: number, deltaY: number): void {
  const handle = getHandle(el, direction)
  handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, clientY: 100, bubbles: true }))
  document.dispatchEvent(
    new MouseEvent('mousemove', { clientX: 100 + deltaX, clientY: 100 + deltaY }),
  )
  document.dispatchEvent(new MouseEvent('mouseup'))
}

describe('makeResizable', () => {
  let element: HTMLElement
  let cleanup: () => void

  beforeEach(() => {
    element = createPositionedElement()
  })

  afterEach(() => {
    cleanup?.()
    element.remove()
  })

  it('returns a cleanup function', () => {
    cleanup = makeResizable(element)
    expect(typeof cleanup).toBe('function')
  })

  it('creates 8 handle elements in the DOM', () => {
    cleanup = makeResizable(element)
    const handles = element.querySelectorAll('[data-resize]')
    expect(handles).toHaveLength(8)
    const directions = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']
    for (const dir of directions) {
      expect(getHandle(element, dir)).not.toBeNull()
    }
  })

  it('east resize: width increases, left unchanged', () => {
    cleanup = makeResizable(element)
    const initialLeft = element.style.left
    simulateResize(element, 'e', 50, 0)
    expect(element.style.width).toBe('450px')
    expect(element.style.left).toBe(initialLeft)
  })

  it('west resize: left decreases, width increases', () => {
    cleanup = makeResizable(element)
    simulateResize(element, 'w', -50, 0)
    expect(element.style.left).toBe('0px')
    expect(element.style.width).toBe('450px')
  })

  it('south resize: height increases, top unchanged', () => {
    cleanup = makeResizable(element)
    const initialTop = element.style.top
    simulateResize(element, 's', 0, 50)
    expect(element.style.height).toBe('350px')
    expect(element.style.top).toBe(initialTop)
  })

  it('north resize: top decreases, height increases', () => {
    cleanup = makeResizable(element)
    simulateResize(element, 'n', 0, -50)
    expect(element.style.top).toBe('0px')
    expect(element.style.height).toBe('350px')
  })

  it('SE corner: both width and height increase', () => {
    cleanup = makeResizable(element)
    const initialLeft = element.style.left
    const initialTop = element.style.top
    simulateResize(element, 'se', 60, 40)
    expect(element.style.width).toBe('460px')
    expect(element.style.height).toBe('340px')
    expect(element.style.left).toBe(initialLeft)
    expect(element.style.top).toBe(initialTop)
  })

  it('NW corner: left/top decrease, width/height increase', () => {
    cleanup = makeResizable(element)
    simulateResize(element, 'nw', -30, -20)
    expect(element.style.left).toBe('20px')
    expect(element.style.top).toBe('30px')
    expect(element.style.width).toBe('430px')
    expect(element.style.height).toBe('320px')
  })

  it('respects minWidth: width cannot go below default (320)', () => {
    cleanup = makeResizable(element)
    simulateResize(element, 'e', -200, 0)
    expect(parseInt(element.style.width)).toBeGreaterThanOrEqual(320)
  })

  it('respects minHeight: height cannot go below default (200)', () => {
    cleanup = makeResizable(element)
    simulateResize(element, 's', 0, -200)
    expect(parseInt(element.style.height)).toBeGreaterThanOrEqual(200)
  })

  it('respects custom minWidth option', () => {
    cleanup = makeResizable(element, { minWidth: 100 })
    simulateResize(element, 'e', -350, 0)
    expect(parseInt(element.style.width)).toBeGreaterThanOrEqual(100)
  })

  it('respects custom minHeight option', () => {
    cleanup = makeResizable(element, { minHeight: 50 })
    simulateResize(element, 's', 0, -300)
    expect(parseInt(element.style.height)).toBeGreaterThanOrEqual(50)
  })

  it('cleanup removes all handles', () => {
    cleanup = makeResizable(element)
    expect(element.querySelectorAll('[data-resize]')).toHaveLength(8)
    cleanup()
    expect(element.querySelectorAll('[data-resize]')).toHaveLength(0)
  })
})
