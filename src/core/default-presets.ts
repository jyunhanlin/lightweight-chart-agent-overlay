// src/core/default-presets.ts

import type { AnalysisPreset } from './types'

export const DEFAULT_PRESETS: readonly AnalysisPreset[] = [
  {
    label: 'Technical',
    systemPrompt:
      'Focus on technical analysis: support/resistance, patterns, indicators. Always include explanation with your analysis. Include priceLines and markers.',
    quickPrompt: 'Analyze the technical aspects of this range',
  },
  {
    label: 'Fundamental',
    systemPrompt:
      'Focus on macroeconomic context, news events, and fundamental factors. Always include explanation with your analysis. No priceLines or markers needed.',
    quickPrompt: 'Analyze relevant macro events and fundamentals',
  },
  {
    label: 'Smart Money',
    systemPrompt:
      'Analyze volume patterns, unusual activity, and institutional behavior. Always include explanation with your analysis. Include markers for anomalies.',
    quickPrompt: 'Analyze smart money signals in this range',
  },
  {
    label: 'Sentiment',
    systemPrompt:
      'Assess market sentiment from price action patterns. Always include explanation with your analysis. No priceLines or markers needed.',
    quickPrompt: 'What is the market sentiment in this range?',
  },
]
