// src/core/ui/calculate-position.ts

import type { TimeValue } from '../types'

export interface UIPosition {
  readonly left: number
  readonly top: number
}

export const UI_PADDING = 12
export const ESTIMATED_UI_HEIGHT = 48
export const ESTIMATED_UI_WIDTH = 320

interface PositionContext {
  readonly chartEl: HTMLElement
  readonly timeToCoordinate: (time: TimeValue) => number | null
  readonly priceToCoordinate: (price: number) => number | null
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
  readonly seriesData: readonly Record<string, unknown>[]
}

function compareTime(a: TimeValue, b: TimeValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

/**
 * Calculate smart UI position that avoids covering K-lines.
 * Places the element above or below the candles, anchored to the left edge of the selection.
 */
export function calculateSmartPosition(ctx: PositionContext): UIPosition {
  const { chartEl, timeToCoordinate, priceToCoordinate, range, seriesData } = ctx
  const chartHeight = chartEl.clientHeight
  const chartWidth = chartEl.clientWidth

  // Normalize range (user might drag right-to-left)
  const from = compareTime(range.from, range.to) <= 0 ? range.from : range.to
  const to = compareTime(range.from, range.to) <= 0 ? range.to : range.from

  // Horizontal: anchor to left edge of selection
  const fromCoord = timeToCoordinate(from)
  let left = fromCoord ?? 0

  // Clamp to chart bounds with padding
  if (left + ESTIMATED_UI_WIDTH > chartWidth - UI_PADDING) {
    left = chartWidth - ESTIMATED_UI_WIDTH - UI_PADDING
  }
  left = Math.max(UI_PADDING, left)

  // Find high/low of candles in selection range
  const rangeData = seriesData.filter((d) => {
    const t = d.time as TimeValue
    return compareTime(t, from) >= 0 && compareTime(t, to) <= 0
  })

  if (rangeData.length === 0) {
    // Fallback: center vertically
    return { left, top: chartHeight / 2 - ESTIMATED_UI_HEIGHT / 2 }
  }

  const highs = rangeData.map((d) => d.high as number).filter((v) => typeof v === 'number')
  const lows = rangeData.map((d) => d.low as number).filter((v) => typeof v === 'number')

  if (highs.length === 0 || lows.length === 0) {
    return { left, top: chartHeight / 2 - ESTIMATED_UI_HEIGHT / 2 }
  }

  const highestHigh = Math.max(...highs)
  const lowestLow = Math.min(...lows)

  const highCoord = priceToCoordinate(highestHigh)
  const lowCoord = priceToCoordinate(lowestLow)

  if (highCoord === null || lowCoord === null) {
    return { left, top: chartHeight / 2 - ESTIMATED_UI_HEIGHT / 2 }
  }

  // In pixel coords: highCoord < lowCoord (higher price = smaller y)
  const spaceAbove = highCoord
  const spaceBelow = chartHeight - lowCoord

  let top: number
  if (spaceAbove >= spaceBelow) {
    // Place above candles
    top = highCoord - ESTIMATED_UI_HEIGHT - UI_PADDING
  } else {
    // Place below candles
    top = lowCoord + UI_PADDING
  }

  // Clamp vertically
  top = Math.max(UI_PADDING, Math.min(top, chartHeight - ESTIMATED_UI_HEIGHT - UI_PADDING))

  return { left, top }
}

/**
 * Adjust an absolutely-positioned element so it stays within the viewport.
 * Call after the element is appended to the DOM.
 */
export function clampToViewport(element: HTMLElement): void {
  const rect = element.getBoundingClientRect()
  // Skip if layout hasn't been computed (e.g., JSDOM)
  if (rect.width === 0 && rect.height === 0) return

  const vw = window.innerWidth
  const vh = window.innerHeight

  let adjustLeft = 0
  let adjustTop = 0

  if (rect.right > vw - UI_PADDING) {
    adjustLeft = vw - UI_PADDING - rect.right
  }
  if (rect.bottom > vh - UI_PADDING) {
    adjustTop = vh - UI_PADDING - rect.bottom
  }
  if (rect.left < UI_PADDING) {
    adjustLeft = UI_PADDING - rect.left
  }
  if (rect.top < UI_PADDING) {
    adjustTop = UI_PADDING - rect.top
  }

  if (adjustLeft !== 0 || adjustTop !== 0) {
    const currentLeft = parseFloat(element.style.left) || 0
    const currentTop = parseFloat(element.style.top) || 0
    element.style.left = `${currentLeft + adjustLeft}px`
    element.style.top = `${currentTop + adjustTop}px`
  }
}
