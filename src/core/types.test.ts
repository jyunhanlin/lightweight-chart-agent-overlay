// src/core/types.test.ts
import type { TimeValue, OHLCData, AnalysisResult, PriceLineAction, MarkerAction } from './types'

describe('types', () => {
  it('TimeValue accepts number and string', () => {
    const a: TimeValue = 1234567890
    const b: TimeValue = '2024-01-01'
    expect(typeof a).toBe('number')
    expect(typeof b).toBe('string')
  })

  it('OHLCData has required and optional fields', () => {
    const data: OHLCData = {
      time: 1234567890,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
    }
    expect(data.volume).toBeUndefined()

    const dataWithVolume: OHLCData = { ...data, volume: 1000 }
    expect(dataWithVolume.volume).toBe(1000)
  })

  it('AnalysisResult fields are all optional', () => {
    const empty: AnalysisResult = {}
    expect(empty.explanation).toBeUndefined()
    expect(empty.priceLines).toBeUndefined()
    expect(empty.markers).toBeUndefined()
  })

  it('PriceLineAction requires price, rest optional', () => {
    const line: PriceLineAction = { price: 100 }
    expect(line.price).toBe(100)

    const full: PriceLineAction = {
      price: 100,
      color: 'red',
      lineWidth: 2,
      lineStyle: 'dashed',
      title: 'Support',
    }
    expect(full.lineStyle).toBe('dashed')
  })

  it('MarkerAction uses correct position values', () => {
    const marker: MarkerAction = {
      time: '2024-01-01',
      position: 'aboveBar',
      shape: 'arrowDown',
      color: 'red',
      text: 'Sell',
    }
    expect(marker.position).toBe('aboveBar')
  })
})
