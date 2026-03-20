// src/providers/parse-response.ts

import type { PriceLineAction, MarkerAction } from '../core/types'

export interface ParsedStreamResponse {
  readonly explanation: string
  readonly overlays: {
    readonly priceLines?: readonly PriceLineAction[]
    readonly markers?: readonly MarkerAction[]
  }
}

export function parseStreamedResponse(fullText: string): ParsedStreamResponse {
  const fencePattern = /```json\s*\n/g
  let lastFenceStart = -1
  let lastFenceEnd = -1
  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(fullText)) !== null) {
    lastFenceStart = match.index
    lastFenceEnd = match.index + match[0].length
  }

  if (lastFenceStart === -1) {
    return { explanation: fullText.trim(), overlays: {} }
  }

  const explanation = fullText.slice(0, lastFenceStart).trim()
  const afterFenceOpen = fullText.slice(lastFenceEnd)

  const braceStart = afterFenceOpen.indexOf('{')
  if (braceStart === -1) {
    return { explanation, overlays: {} }
  }

  let depth = 0
  let inString = false
  let escaped = false
  let jsonEnd = -1

  for (let i = braceStart; i < afterFenceOpen.length; i++) {
    const ch = afterFenceOpen[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) {
      jsonEnd = i
      break
    }
  }

  if (jsonEnd === -1) {
    return { explanation, overlays: {} }
  }

  const jsonStr = afterFenceOpen.slice(braceStart, jsonEnd + 1)

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      explanation,
      overlays: {
        ...(Array.isArray(parsed.priceLines) && { priceLines: parsed.priceLines }),
        ...(Array.isArray(parsed.markers) && { markers: parsed.markers }),
      },
    }
  } catch {
    return { explanation, overlays: {} }
  }
}

/**
 * Extract a JSON object from LLM response text.
 *
 * Handles common LLM quirks:
 *  - Clean JSON (direct parse)
 *  - Markdown code fences (```json ... ```)
 *  - Extra text before/after the JSON object
 *  - Arbitrarily deep nesting (brace-counting, not regex)
 */
export function extractJsonFromText(text: string): unknown {
  // Strip markdown code fences if present
  const stripped = text
    .replace(/^```(?:json)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim()

  // Try direct parse first (covers clean JSON)
  try {
    return JSON.parse(stripped)
  } catch {
    // Fall back: find the outermost { … } using brace counting
    const start = stripped.indexOf('{')
    if (start !== -1) {
      let depth = 0
      for (let i = start; i < stripped.length; i++) {
        if (stripped[i] === '{') depth++
        if (stripped[i] === '}') depth--
        if (depth === 0) {
          try {
            return JSON.parse(stripped.slice(start, i + 1))
          } catch {
            break
          }
        }
      }
    }

    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 100)}`)
  }
}
