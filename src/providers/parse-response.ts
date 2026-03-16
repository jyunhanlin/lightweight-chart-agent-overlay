// src/providers/parse-response.ts

export function extractJsonFromText(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text)
  } catch {
    // Try to find JSON object in the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw new Error(`Failed to parse LLM response as JSON: ${text.slice(0, 100)}`)
  }
}
