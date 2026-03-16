// src/core/selection/context-builder.test.ts
import { buildChartContext } from './context-builder'
import type { OHLCData, DataAccessor } from '../types'

const SAMPLE_DATA: OHLCData[] = [
  { time: 1000, open: 100, high: 110, low: 90, close: 105 },
  { time: 2000, open: 105, high: 115, low: 95, close: 110 },
  { time: 3000, open: 110, high: 120, low: 100, close: 115 },
  { time: 4000, open: 115, high: 125, low: 105, close: 120 },
  { time: 5000, open: 120, high: 130, low: 110, close: 125 },
]

describe('buildChartContext', () => {
  it('filters data by time range (inclusive)', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 2000, to: 4000 })
    expect(ctx.timeRange).toEqual({ from: 2000, to: 4000 })
    expect(ctx.data).toHaveLength(3)
    expect(ctx.data[0].time).toBe(2000)
    expect(ctx.data[2].time).toBe(4000)
  })

  it('returns empty data when range has no matches', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 9000, to: 10000 })
    expect(ctx.data).toHaveLength(0)
    expect(ctx.timeRange).toEqual({ from: 9000, to: 10000 })
  })

  it('handles string time values', () => {
    const stringData: OHLCData[] = [
      { time: '2024-01-01', open: 100, high: 110, low: 90, close: 105 },
      { time: '2024-01-02', open: 105, high: 115, low: 95, close: 110 },
      { time: '2024-01-03', open: 110, high: 120, low: 100, close: 115 },
    ]
    const ctx = buildChartContext(stringData, { from: '2024-01-01', to: '2024-01-02' })
    expect(ctx.data).toHaveLength(2)
  })

  it('uses dataAccessor when provided', () => {
    const customData: OHLCData[] = [
      { time: 2000, open: 999, high: 999, low: 999, close: 999, volume: 50000 },
    ]
    const accessor: DataAccessor = vi.fn().mockReturnValue(customData)
    const ctx = buildChartContext(SAMPLE_DATA, { from: 2000, to: 4000 }, accessor)
    expect(accessor).toHaveBeenCalledWith({ from: 2000, to: 4000 })
    expect(ctx.data).toEqual(customData)
  })

  it('swaps from/to if from > to (numeric)', () => {
    const ctx = buildChartContext(SAMPLE_DATA, { from: 4000, to: 2000 })
    expect(ctx.timeRange).toEqual({ from: 2000, to: 4000 })
    expect(ctx.data).toHaveLength(3)
  })
})
