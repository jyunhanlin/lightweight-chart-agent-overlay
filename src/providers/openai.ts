// src/providers/openai.ts

import type { LLMProvider, ChartContext, AnalysisResult } from '../core/types'
import { extractJsonFromText } from './parse-response'

const DEFAULT_MODEL = 'gpt-4o-mini'
const API_URL = 'https://api.openai.com/v1/chat/completions'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

You MUST respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "explanation": "string - brief analysis in the user's language",
  "priceLines": [{ "price": number, "title": string, "color": string, "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": number_or_string, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": string, "color": string }]
}

Only include priceLines and markers that are relevant to the user's request.`

interface OpenAIProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
  readonly baseURL?: string
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL

  return {
    async analyze(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
    ): Promise<AnalysisResult> {
      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(baseURL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 1024,
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content ?? ''

      return extractJsonFromText(text) as AnalysisResult
    },
  }
}
