// src/providers/parse-response.ts

export function extractJsonFromText(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Find all potential JSON objects and try each (last valid one wins,
    // since LLM responses typically put the result at the end)
    const candidates = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
    if (candidates) {
      for (let i = candidates.length - 1; i >= 0; i--) {
        try {
          return JSON.parse(candidates[i])
        } catch {
          continue
        }
      }
    }
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 100)}`)
  }
}
