// src/providers/openai.ts

import type {
  LLMProvider,
  ChartContext,
  AnalysisResult,
  ModelOption,
  AnalyzeOptions,
} from '../core/types'
import { extractJsonFromText } from './parse-response'

const DEFAULT_MODEL = 'gpt-4o-mini'
const API_URL = 'https://api.openai.com/v1/chat/completions'

const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

Analyze the data from both technical and macro perspectives:
- Technical: key support/resistance levels, patterns, volume trends, or signals relevant to the question.
- Macro context: if you know of significant macroeconomic events, policy changes, or major news that occurred during this time range and could explain the price action, briefly mention them.

You MUST respond with ONLY a JSON object (no markdown, no code fences) matching this schema:
{
  "explanation": "string - brief analysis covering both technical and macro context, in the user's language",
  "priceLines": [{ "price": number, "title": string, "color": string, "lineStyle": "solid"|"dashed"|"dotted" }],
  "markers": [{ "time": number_or_string, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": string, "color": string }]
}

"explanation" can be a string OR structured sections:
  { "sections": [{ "label": "section name", "content": "analysis text" }] }
Use sections when multiple analysis perspectives are requested.

Only include priceLines and markers that are relevant to the user's request. All fields except "price" (for priceLines) and "time"/"position"/"shape" (for markers) are optional.`

interface OpenAIProviderOptions {
  readonly apiKey: string
  readonly model?: string
  readonly systemPrompt?: string
  readonly baseURL?: string
  readonly models?: readonly ModelOption[]
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const model = options.model ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL

  return {
    models: options.models,
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

      const response = await fetch(baseURL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: requestModel,
          messages: [
            { role: 'system', content: finalSystemPrompt },
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
