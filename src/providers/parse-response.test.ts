// src/providers/parse-response.test.ts
import { extractJsonFromText } from './parse-response'

describe('extractJsonFromText', () => {
  it('parses clean JSON', () => {
    const result = extractJsonFromText('{"price": 100}')
    expect(result).toEqual({ price: 100 })
  })

  it('extracts JSON from surrounding text', () => {
    const result = extractJsonFromText('Here is the result: {"price": 100} hope that helps')
    expect(result).toEqual({ price: 100 })
  })

  it('handles JSON in markdown code fences', () => {
    const result = extractJsonFromText('```json\n{"price": 100}\n```')
    expect(result).toEqual({ price: 100 })
  })

  it('throws on completely invalid input', () => {
    expect(() => extractJsonFromText('no json here')).toThrow('Failed to parse')
  })

  it('throws on empty string', () => {
    expect(() => extractJsonFromText('')).toThrow('Failed to parse')
  })
})
