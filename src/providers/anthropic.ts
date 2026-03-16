// src/providers/anthropic.ts

import type { LLMProvider, ChartContext, AnalysisResult } from '../core/types'
import { extractJsonFromText } from './parse-response'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const API_URL = 'https://api.anthropic.com/v1/messages'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

You MUST respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "explanation": "string - brief analysis in the user's language",
  "priceLines": [{ "price": number, "title": string, "color": string, "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": number_or_string, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": string, "color": string }]
}

Only include priceLines and markers that are relevant to the user's request. All fields except "price" (for priceLines) and "time"/"position"/"shape" (for markers) are optional.`

interface AnthropicProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return {
    async analyze(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
    ): Promise<AnalysisResult> {
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
          model,
          max_tokens: 1024,
          system: systemPrompt,
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
