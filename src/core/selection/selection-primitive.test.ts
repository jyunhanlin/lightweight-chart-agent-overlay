// src/core/selection/selection-primitive.test.ts
import { SelectionPrimitive } from './selection-primitive'

function createMockAttachedParams() {
  return {
    chart: {
      timeScale: () => ({
        timeToCoordinate: vi.fn((time: number) => time / 10),
      }),
    },
    series: { priceToCoordinate: vi.fn() },
    requestUpdate: vi.fn(),
  }
}

describe('SelectionPrimitive', () => {
  it('starts with no selection', () => {
    const primitive = new SelectionPrimitive()
    expect(primitive.getRange()).toBeNull()
  })

  it('setRange stores the time range', () => {
    const primitive = new SelectionPrimitive()
    primitive.setRange({ from: 1000, to: 2000 })
    expect(primitive.getRange()).toEqual({ from: 1000, to: 2000 })
  })

  it('clearRange resets to null', () => {
    const primitive = new SelectionPrimitive()
    primitive.setRange({ from: 1000, to: 2000 })
    primitive.clearRange()
    expect(primitive.getRange()).toBeNull()
  })

  it('requestUpdate is called on setRange when attached', () => {
    const primitive = new SelectionPrimitive()
    const params = createMockAttachedParams()
    primitive.attached(params as never)
    primitive.setRange({ from: 1000, to: 2000 })
    expect(params.requestUpdate).toHaveBeenCalled()
  })

  it('paneViews returns empty array when no range', () => {
    const primitive = new SelectionPrimitive()
    expect(primitive.paneViews()).toEqual([])
  })

  it('paneViews returns a view when range is set', () => {
    const primitive = new SelectionPrimitive()
    const params = createMockAttachedParams()
    primitive.attached(params as never)
    primitive.setRange({ from: 1000, to: 2000 })
    primitive.updateAllViews()
    const views = primitive.paneViews()
    expect(views).toHaveLength(1)
    expect(views[0].renderer).toBeDefined()
  })
})
