// src/core/selection/context-builder.ts
import type { ChartContext, DataAccessor, OHLCData, TimeValue } from '../types'

function compareTime(a: TimeValue, b: TimeValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function normalizeRange(from: TimeValue, to: TimeValue): { from: TimeValue; to: TimeValue } {
  if (compareTime(from, to) > 0) return { from: to, to: from }
  return { from, to }
}

export function buildChartContext(
  seriesData: readonly OHLCData[],
  range: { from: TimeValue; to: TimeValue },
  dataAccessor?: DataAccessor,
): ChartContext {
  const timeRange = normalizeRange(range.from, range.to)
  if (dataAccessor) {
    return { timeRange, data: dataAccessor(timeRange) }
  }
  const data = seriesData.filter(
    (d) => compareTime(d.time, timeRange.from) >= 0 && compareTime(d.time, timeRange.to) <= 0,
  )
  return { timeRange, data }
}
