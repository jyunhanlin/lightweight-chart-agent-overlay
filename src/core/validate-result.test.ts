import { describe, it, expect } from 'vitest'
import { validateResult } from './validate-result'

describe('validateResult', () => {
  it('should wrap string explanation in sections', () => {
    const result = validateResult({ explanation: 'hello' })
    expect(result.explanation).toEqual({
      sections: [{ label: 'Analysis', content: 'hello' }],
    })
  })

  it('should pass through valid structured sections', () => {
    const result = validateResult({
      explanation: { sections: [{ label: 'Tech', content: 'support at 100' }] },
    })
    expect(result.explanation?.sections).toHaveLength(1)
    expect(result.explanation?.sections[0].label).toBe('Tech')
  })

  it('should filter out sections missing label or content', () => {
    const result = validateResult({
      explanation: {
        sections: [{ label: 'Good', content: 'valid' }, { label: 'Bad' }, { content: 'no label' }],
      },
    })
    expect(result.explanation?.sections).toHaveLength(1)
  })

  it('should return undefined for empty sections array', () => {
    const result = validateResult({ explanation: { sections: [] } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for null explanation', () => {
    const result = validateResult({ explanation: null })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for numeric explanation', () => {
    const result = validateResult({ explanation: 123 })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for sections that is not an array', () => {
    const result = validateResult({ explanation: { sections: 'not array' } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for object without sections key', () => {
    const result = validateResult({ explanation: { other: 'value' } })
    expect(result.explanation).toBeUndefined()
  })

  it('should return undefined for empty string explanation', () => {
    const result = validateResult({ explanation: '' })
    expect(result.explanation).toBeUndefined()
  })

  it('should still validate priceLines and markers', () => {
    const result = validateResult({
      priceLines: [{ price: 100 }, { notPrice: true }],
      markers: [{ time: 1, position: 'aboveBar', shape: 'circle' }],
    })
    expect(result.priceLines).toHaveLength(1)
    expect(result.markers).toHaveLength(1)
  })

  it('should throw for non-object input', () => {
    expect(() => validateResult(null)).toThrow()
    expect(() => validateResult('string')).toThrow()
  })
})
