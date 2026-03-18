import { describe, it, expect } from 'vitest'
import { defaultPromptBuilder } from './prompt-builder'
import type { AnalysisPreset } from './types'

const PRESETS: readonly AnalysisPreset[] = [
  {
    label: 'Technical',
    systemPrompt: 'Focus on technical analysis.',
    quickPrompt: 'Analyze technicals',
  },
  {
    label: 'Fundamental',
    systemPrompt: 'Focus on fundamentals.',
    quickPrompt: 'Analyze fundamentals',
  },
]

describe('defaultPromptBuilder', () => {
  it('should return user prompt for custom prompt mode', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'What is the trend?',
      selectedPresets: PRESETS,
      isQuickRun: false,
    })
    expect(result.prompt).toBe('What is the trend?')
  })

  it('should merge preset systemPrompts with double newline', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'test',
      selectedPresets: PRESETS,
      isQuickRun: false,
    })
    expect(result.additionalSystemPrompt).toBe(
      'Focus on technical analysis.\n\nFocus on fundamentals.',
    )
  })

  it('should concatenate quickPrompts for quick run', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: PRESETS,
      isQuickRun: true,
    })
    expect(result.prompt).toBe('Analyze technicals\n\nAnalyze fundamentals')
  })

  it('should return empty strings when no presets selected', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: 'test',
      selectedPresets: [],
      isQuickRun: false,
    })
    expect(result.prompt).toBe('test')
    expect(result.additionalSystemPrompt).toBe('')
  })

  it('should return empty prompt for quick run with no presets', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: [],
      isQuickRun: true,
    })
    expect(result.prompt).toBe('')
    expect(result.additionalSystemPrompt).toBe('')
  })

  it('should handle single preset', () => {
    const result = defaultPromptBuilder.build({
      userPrompt: '',
      selectedPresets: [PRESETS[0]],
      isQuickRun: true,
    })
    expect(result.prompt).toBe('Analyze technicals')
    expect(result.additionalSystemPrompt).toBe('Focus on technical analysis.')
  })
})
