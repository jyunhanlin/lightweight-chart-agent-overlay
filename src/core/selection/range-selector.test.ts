// src/core/selection/range-selector.test.ts
import { RangeSelector } from './range-selector'

function createTouchEvent(
  type: string,
  clientX: number,
  clientY: number,
  target: EventTarget = document.body,
): TouchEvent {
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
    target,
  } as Touch

  return new TouchEvent(type, {
    touches: type === 'touchend' ? [] : [touch],
    changedTouches: [touch],
    bubbles: true,
    cancelable: true,
  })
}

function createMockChart() {
  const coordinateToTime = vi.fn((x: number) => x * 10)
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect
  return {
    el,
    timeScale: () => ({ coordinateToTime }),
    chartElement: () => el,
    applyOptions: vi.fn(),
  }
}

function createMockSeries() {
  return {
    attachPrimitive: vi.fn(),
    detachPrimitive: vi.fn(),
  }
}

function fireMouseDown(el: HTMLElement, clientX: number) {
  el.dispatchEvent(new MouseEvent('mousedown', { clientX, clientY: 50, bubbles: true }))
}

function fireMouseMove(clientX: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX, clientY: 50, bubbles: true }))
}

function fireMouseUp(clientX: number) {
  document.dispatchEvent(new MouseEvent('mouseup', { clientX, clientY: 50, bubbles: true }))
}

describe('RangeSelector', () => {
  it('creates and attaches SelectionPrimitive on init', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const _selector = new RangeSelector(chart as never, series as never)
    expect(series.attachPrimitive).toHaveBeenCalledOnce()
  })

  it('emits onSelect when enabled and dragged', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    selector.setEnabled(true)
    fireMouseDown(chart.el, 10)
    fireMouseMove(50)
    fireMouseUp(50)
    expect(onSelect).toHaveBeenCalledWith({ from: 100, to: 500 })
  })

  it('ignores drag when not enabled', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    // not enabled by default
    fireMouseDown(chart.el, 10)
    fireMouseMove(50)
    fireMouseUp(50)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not emit onSelect for click without drag (same position)', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    selector.setEnabled(true)
    fireMouseDown(chart.el, 10)
    fireMouseUp(10)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('setEnabled disables chart scroll/scale', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.setEnabled(true)
    expect(chart.applyOptions).toHaveBeenCalledWith({
      handleScroll: false,
      handleScale: false,
    })
    selector.setEnabled(false)
    expect(chart.applyOptions).toHaveBeenCalledWith({
      handleScroll: true,
      handleScale: true,
    })
  })

  it('click when disabled dismisses existing selection', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onDismiss = vi.fn()
    selector.onDismiss = onDismiss

    // Enable, drag to create selection
    selector.setEnabled(true)
    fireMouseDown(chart.el, 10)
    fireMouseMove(50)
    fireMouseUp(50)

    // Disable, then click to dismiss
    selector.setEnabled(false)
    fireMouseDown(chart.el, 30)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('setRange should set selection highlight without triggering callbacks', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    const onDismiss = vi.fn()
    selector.onSelect = onSelect
    selector.onDismiss = onDismiss

    selector.setRange({ from: 100, to: 200 })

    expect(selector.getRange()).toEqual({ from: 100, to: 200 })
    expect(onSelect).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('destroy removes event listeners and detaches primitive', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.destroy()
    expect(series.detachPrimitive).toHaveBeenCalledOnce()
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    selector.setEnabled(true)
    fireMouseDown(chart.el, 10)
    fireMouseMove(50)
    fireMouseUp(50)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('touch drag fires onSelect', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.setEnabled(true)
    const onSelect = vi.fn()
    selector.onSelect = onSelect

    const el = chart.el
    el.dispatchEvent(createTouchEvent('touchstart', 100, 50, el))
    document.dispatchEvent(createTouchEvent('touchmove', 200, 50, el))
    document.dispatchEvent(createTouchEvent('touchend', 200, 50, el))

    expect(onSelect).toHaveBeenCalled()
  })

  it('sets touch-action none when enabled', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.setEnabled(true)
    expect(chart.el.style.touchAction).toBe('none')
  })

  it('removes touch-action when disabled', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.setEnabled(true)
    selector.setEnabled(false)
    expect(chart.el.style.touchAction).toBe('')
  })
})
