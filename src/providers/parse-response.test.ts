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

  it('handles deeply nested JSON in code fences', () => {
    const json = {
      explanation: { sections: [{ label: 'Technical', content: 'analysis text' }] },
      priceLines: [{ price: 100, title: 'Support' }],
      markers: [{ time: 123, position: 'aboveBar', shape: 'circle' }],
    }
    const result = extractJsonFromText('```json\n' + JSON.stringify(json) + '\n```')
    expect(result).toEqual(json)
  })

  it('handles 4-level nested JSON with surrounding text', () => {
    const json = {
      explanation: { sections: [{ label: 'A', content: 'text' }] },
      markers: [{ time: 1, position: 'aboveBar', shape: 'circle', color: '#fff' }],
    }
    const text = 'Here is my analysis:\n' + JSON.stringify(json) + '\n\nHope this helps!'
    const result = extractJsonFromText(text)
    expect(result).toEqual(json)
  })

  it('throws on completely invalid input', () => {
    expect(() => extractJsonFromText('no json here')).toThrow('Failed to parse')
  })

  it('throws on empty string', () => {
    expect(() => extractJsonFromText('')).toThrow('Failed to parse')
  })
})
