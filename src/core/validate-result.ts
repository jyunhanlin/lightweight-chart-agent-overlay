import type { NormalizedAnalysisResult, NormalizedExplanation } from './types'

function isValidPriceLine(item: unknown): boolean {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Record<string, unknown>).price === 'number'
  )
}

function isValidMarker(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const m = item as Record<string, unknown>
  return m.time != null && typeof m.position === 'string' && typeof m.shape === 'string'
}

function normalizeExplanation(raw: unknown): NormalizedExplanation | undefined {
  if (typeof raw === 'string') {
    return raw.trim() ? { sections: [{ label: 'Analysis', content: raw }] } : undefined
  }

  if (typeof raw !== 'object' || raw === null) return undefined

  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.sections)) return undefined

  const validSections = obj.sections.filter(
    (s: unknown) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as Record<string, unknown>).label === 'string' &&
      typeof (s as Record<string, unknown>).content === 'string',
  )

  return validSections.length > 0 ? { sections: validSections } : undefined
}

/**
 * If the LLM returned a bare marker or priceLine instead of the full
 * AnalysisResult wrapper, try to detect and wrap it.
 */
function tryWrapBareResult(obj: Record<string, unknown>): Record<string, unknown> {
  // Has at least one top-level AnalysisResult key → already wrapped
  if (obj.explanation !== undefined || obj.priceLines !== undefined || obj.markers !== undefined) {
    return obj
  }

  // Looks like a bare marker
  if (isValidMarker(obj)) {
    return { markers: [obj] }
  }

  // Looks like a bare priceLine
  if (isValidPriceLine(obj)) {
    return { priceLines: [obj] }
  }

  return obj
}

export function validateResult(raw: unknown): NormalizedAnalysisResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid analysis result: expected an object')
  }
  const obj = tryWrapBareResult(raw as Record<string, unknown>)

  const explanation = normalizeExplanation(obj.explanation)
  const priceLines = Array.isArray(obj.priceLines)
    ? obj.priceLines.filter(isValidPriceLine)
    : undefined
  const markers = Array.isArray(obj.markers) ? obj.markers.filter(isValidMarker) : undefined

  return {
    ...(explanation && { explanation }),
    ...(priceLines && priceLines.length > 0 && { priceLines }),
    ...(markers && markers.length > 0 && { markers }),
  }
}
