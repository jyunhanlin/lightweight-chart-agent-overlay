// src/providers/parse-response.test.ts
import { extractJsonFromText } from './parse-response'
import { parseStreamedResponse } from './parse-response'

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

describe('parseStreamedResponse', () => {
  it('extracts explanation text and JSON overlays from text + ```json block', () => {
    const input =
      'The chart shows an uptrend.\n\n```json\n{"priceLines":[{"price":150,"title":"Support"}],"markers":[]}\n```'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('The chart shows an uptrend.')
    expect(result.overlays.priceLines).toEqual([{ price: 150, title: 'Support' }])
    expect(result.overlays.markers).toEqual([])
  })

  it('returns explanation-only when no JSON fence (overlays = {})', () => {
    const input = 'No structured data here, just text analysis.'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('No structured data here, just text analysis.')
    expect(result.overlays).toEqual({})
  })

  it('returns empty explanation when text starts with JSON fence', () => {
    const input = '```json\n{"priceLines":[],"markers":[]}\n```'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('')
    expect(result.overlays.priceLines).toEqual([])
    expect(result.overlays.markers).toEqual([])
  })

  it('uses last JSON fence when multiple exist', () => {
    const input =
      'First attempt:\n```json\n{"priceLines":[{"price":100,"title":"Old"}]}\n```\n\nRevised:\n```json\n{"priceLines":[{"price":200,"title":"New"}]}\n```'
    const result = parseStreamedResponse(input)
    expect(result.overlays.priceLines).toEqual([{ price: 200, title: 'New' }])
  })

  it('handles malformed JSON gracefully (returns explanation, empty overlays)', () => {
    const input = 'Some analysis.\n\n```json\n{invalid json here}\n```'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('Some analysis.')
    expect(result.overlays).toEqual({})
  })

  it('handles unclosed JSON fence (returns explanation, empty overlays)', () => {
    const input = 'Some analysis.\n\n```json\n{"priceLines":[{"price":150}]'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('Some analysis.')
    expect(result.overlays).toEqual({})
  })

  it('handles empty input', () => {
    const result = parseStreamedResponse('')
    expect(result.explanation).toBe('')
    expect(result.overlays).toEqual({})
  })

  it('handles JSON fence with only markers (no priceLines)', () => {
    const input =
      'Analysis text.\n\n```json\n{"markers":[{"time":1710720000,"position":"belowBar","shape":"arrowUp","color":"#22c55e","text":"Signal"}]}\n```'
    const result = parseStreamedResponse(input)
    expect(result.explanation).toBe('Analysis text.')
    expect(result.overlays.priceLines).toBeUndefined()
    expect(result.overlays.markers).toEqual([
      {
        time: 1710720000,
        position: 'belowBar',
        shape: 'arrowUp',
        color: '#22c55e',
        text: 'Signal',
      },
    ])
  })
})
