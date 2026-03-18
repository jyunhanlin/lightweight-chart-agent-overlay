// src/providers/anthropic.ts

import type {
  LLMProvider,
  ChartContext,
  AnalysisResult,
  ModelOption,
  AnalyzeOptions,
} from '../core/types'
import { extractJsonFromText } from './parse-response'

const API_URL = 'https://api.anthropic.com/v1/messages'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

CRITICAL: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no extra text.

The JSON object MUST have this exact top-level structure:
{
  "explanation": ...,
  "priceLines": [...],
  "markers": [...]
}

"explanation" is REQUIRED. It can be either:
- A string: "your analysis text"
- Structured sections: { "sections": [{ "label": "Section Name", "content": "analysis text" }] }
  Use sections when multiple analysis perspectives are requested.

"priceLines" is an array of price level indicators (can be empty []):
  [{ "price": number, "title": "string", "color": "#hex", "lineStyle": "solid"|"dashed"|"dotted" }]

"markers" is an array of chart markers (can be empty []):
  [{ "time": unix_timestamp, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": "string", "color": "#hex" }]

IMPORTANT: Always wrap your response in the top-level { "explanation", "priceLines", "markers" } structure. Never return a bare marker or price line object without the wrapper.`

interface AnthropicProviderOptions {
  readonly apiKey: string
  readonly systemPrompt?: string
  readonly availableModels: readonly ModelOption[]
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  if (options.availableModels.length === 0) {
    throw new Error('availableModels must contain at least one model')
  }
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return {
    availableModels: options.availableModels,
    async analyze(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
      analyzeOptions?: AnalyzeOptions,
    ): Promise<AnalysisResult> {
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
        ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
        : systemPrompt

      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': options.apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: requestModel,
          max_tokens: 4096,
          system: finalSystemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text ?? ''

      return extractJsonFromText(text) as AnalysisResult
    },
  }
}
