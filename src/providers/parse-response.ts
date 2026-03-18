// src/providers/parse-response.ts

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
