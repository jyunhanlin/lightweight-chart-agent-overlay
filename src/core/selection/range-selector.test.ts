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

  it('emits onSelect after mousedown → mousemove → mouseup', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).toHaveBeenCalledWith({ from: 100, to: 500 })
  })

  it('does not emit onSelect for click without drag (same position)', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mouseup', 10)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('destroy removes event listeners and detaches primitive', () => {
    const chart = createMockChart()
    const series = createMockSeries()
    const selector = new RangeSelector(chart as never, series as never)
    selector.destroy()
    expect(series.detachPrimitive).toHaveBeenCalledOnce()
    const onSelect = vi.fn()
    selector.onSelect = onSelect
    fireMouseEvent(chart.el, 'mousedown', 10)
    fireMouseEvent(chart.el, 'mousemove', 50)
    fireMouseEvent(chart.el, 'mouseup', 50)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
