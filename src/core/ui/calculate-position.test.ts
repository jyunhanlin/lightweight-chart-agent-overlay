import { describe, it, expect } from 'vitest'
import { calculateSmartPosition } from './calculate-position'

function createContext(overrides: {
  chartHeight?: number
  chartWidth?: number
  range?: { from: number; to: number }
  seriesData?: Record<string, unknown>[]
  highCoord?: number | null
  lowCoord?: number | null
}) {
  const chartHeight = overrides.chartHeight ?? 600
  const chartWidth = overrides.chartWidth ?? 800

  return {
    chartEl: {
      clientHeight: chartHeight,
      clientWidth: chartWidth,
    } as HTMLElement,
    timeToCoordinate: (_time: unknown) => 100 as number | null,
    priceToCoordinate: (price: number) => {
      if (overrides.highCoord !== undefined && price === 200) return overrides.highCoord
      if (overrides.lowCoord !== undefined && price === 100) return overrides.lowCoord
      // Linear mapping: price 200 = top (100px), price 100 = bottom (500px)
      return chartHeight - ((price - 50) / 200) * chartHeight
    },
    range: overrides.range ?? { from: 10, to: 20 },
    seriesData: overrides.seriesData ?? [
      { time: 10, open: 120, high: 200, low: 100, close: 150 },
      { time: 15, open: 150, high: 180, low: 110, close: 160 },
      { time: 20, open: 160, high: 190, low: 120, close: 140 },
    ],
  }
}

describe('calculateSmartPosition', () => {
  it('should return a position with left and top', () => {
    const pos = calculateSmartPosition(createContext({}))
    expect(pos).toHaveProperty('left')
    expect(pos).toHaveProperty('top')
    expect(typeof pos.left).toBe('number')
    expect(typeof pos.top).toBe('number')
  })

  it('should place above candles when more space above', () => {
    // High at 200 -> coord 150 (lots of space above)
    // Low at 100 -> coord 450 (less space below in 600px chart)
    const pos = calculateSmartPosition(createContext({ highCoord: 150, lowCoord: 450 }))
    // Should be above candles: top < highCoord
    expect(pos.top).toBeLessThan(150)
  })

  it('should place below candles when more space below', () => {
    // High at 200 -> coord 50 (less space above)
    // Low at 100 -> coord 200 (lots of space below in 600px chart)
    const pos = calculateSmartPosition(createContext({ highCoord: 50, lowCoord: 200 }))
    // Should be below candles: top > lowCoord
    expect(pos.top).toBeGreaterThan(200)
  })

  it('should fallback to center when no data in range', () => {
    const pos = calculateSmartPosition(createContext({ seriesData: [] }))
    expect(pos.top).toBeCloseTo(600 / 2 - 48 / 2, 0)
  })

  it('should handle reversed range (right-to-left drag)', () => {
    const pos = calculateSmartPosition(createContext({ range: { from: 20, to: 10 } }))
    expect(pos).toHaveProperty('left')
    expect(pos).toHaveProperty('top')
  })

  it('should clamp left to not overflow chart width', () => {
    const ctx = createContext({})
    ctx.timeToCoordinate = () => 750 // near right edge of 800px chart
    const pos = calculateSmartPosition(ctx)
    // Should be clamped: left + 320 (ui width) <= 800 - 12 (padding)
    expect(pos.left + 320).toBeLessThanOrEqual(800)
  })

  it('should clamp left to minimum padding', () => {
    const ctx = createContext({})
    ctx.timeToCoordinate = () => -50 // off-screen left
    const pos = calculateSmartPosition(ctx)
    expect(pos.left).toBeGreaterThanOrEqual(12)
  })

  it('should fallback when priceToCoordinate returns null', () => {
    const pos = calculateSmartPosition(createContext({ highCoord: null, lowCoord: null }))
    // Should fallback to center
    expect(pos.top).toBeCloseTo(600 / 2 - 48 / 2, 0)
  })
})
