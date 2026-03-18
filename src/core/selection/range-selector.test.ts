// src/core/selection/range-selector.test.ts
import { RangeSelector } from './range-selector'

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

function fireMouseEvent(el: HTMLElement, type: string, clientX: number) {
  const event = new MouseEvent(type, { clientX, clientY: 50, bubbles: true })
  el.dispatchEvent(event)
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
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).toHaveBeenCalledWith({ from: 100, to: 500 })
  })

  it('ignores drag when not enabled', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    // not enabled by default
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('does not emit onSelect for click without drag (same position)', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    selector.setEnabled(true)
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mouseup', 10)
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
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)

    // Disable, then click to dismiss
    selector.setEnabled(false)
    fireMouseEvent(chart.el, 'mousedown', 30)
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
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
