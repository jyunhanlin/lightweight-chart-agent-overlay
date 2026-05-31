// src/providers/default-system-prompt.test.ts
import { DEFAULT_PERSONA, OVERLAY_CONTRACT, DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'

describe('default-system-prompt constants', () => {
  it('persona describes the analyst and contains no JSON fence', () => {
    expect(DEFAULT_PERSONA).toContain('financial chart analyst')
    expect(DEFAULT_PERSONA).not.toContain('```json')
  })

  it('overlay contract owns the JSON fence and overlay keys', () => {
    expect(OVERLAY_CONTRACT).toContain('```json')
    expect(OVERLAY_CONTRACT).toContain('priceLines')
    expect(OVERLAY_CONTRACT).toContain('markers')
    expect(OVERLAY_CONTRACT).toContain('Never put text after the JSON block.')
  })

  it('DEFAULT_SYSTEM_PROMPT equals persona + contract joined by a blank line', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBe(`${DEFAULT_PERSONA}\n\n${OVERLAY_CONTRACT}`)
  })
})
