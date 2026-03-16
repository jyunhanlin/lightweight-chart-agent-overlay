// src/core/overlay/overlay-renderer.test.ts
import { OverlayRenderer } from './overlay-renderer'
import type { AnalysisResult } from '../types'

function createMockSeries() {
  const priceLines: Array<{ options: unknown }> = []
  return {
    createPriceLine: vi.fn((opts: unknown) => {
      const line = { options: opts }
      priceLines.push(line)
      return line
    }),
    removePriceLine: vi.fn(),
    _priceLines: priceLines,
  }
}

const mockSetMarkers = vi.fn()
const mockDetach = vi.fn()
const mockMarkers = vi.fn().mockReturnValue([])

vi.mock('lightweight-charts', () => ({
  createSeriesMarkers: vi.fn(() => ({
    setMarkers: mockSetMarkers,
    detach: mockDetach,
    markers: mockMarkers,
  })),
  LineStyle: { Solid: 0, Dashed: 1, LargeDashed: 2, Dotted: 3 },
}))

describe('OverlayRenderer', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders price lines from AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)
    const result: AnalysisResult = {
      priceLines: [
        { price: 100, title: 'Support', color: 'green', lineStyle: 'dashed' },
        { price: 200, title: 'Resistance', color: 'red' },
      ],
    }
    renderer.render(result)
    expect(series.createPriceLine).toHaveBeenCalledTimes(2)
    expect(series.createPriceLine).toHaveBeenCalledWith(
      expect.objectContaining({ price: 100, title: 'Support', color: 'green', lineStyle: 1 }),
    )
  })

  it('renders markers from AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)
    const result: AnalysisResult = {
      markers: [{ time: 1000, position: 'aboveBar', shape: 'arrowDown', color: 'red', text: 'Sell' }],
    }
    renderer.render(result)
    expect(mockSetMarkers).toHaveBeenCalledWith([
      expect.objectContaining({ time: 1000, position: 'aboveBar', shape: 'arrowDown' }),
    ])
  })

  it('clear removes all price lines and markers', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)
    renderer.render({
      priceLines: [{ price: 100 }],
      markers: [{ time: 1000, position: 'aboveBar', shape: 'circle' }],
    })
    renderer.clear()
    expect(series.removePriceLine).toHaveBeenCalledOnce()
    expect(mockDetach).toHaveBeenCalledOnce()
  })

  it('maps lineStyle strings to LineStyle enum', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)
    renderer.render({
      priceLines: [
        { price: 100, lineStyle: 'solid' },
        { price: 200, lineStyle: 'dashed' },
        { price: 300, lineStyle: 'dotted' },
      ],
    })
    const calls = series.createPriceLine.mock.calls
    expect(calls[0][0].lineStyle).toBe(0)
    expect(calls[1][0].lineStyle).toBe(1)
    expect(calls[2][0].lineStyle).toBe(3)
  })

  it('handles empty AnalysisResult', () => {
    const series = createMockSeries()
    const renderer = new OverlayRenderer(series as never)
    renderer.render({})
    expect(series.createPriceLine).not.toHaveBeenCalled()
    expect(mockSetMarkers).not.toHaveBeenCalled()
  })
})
