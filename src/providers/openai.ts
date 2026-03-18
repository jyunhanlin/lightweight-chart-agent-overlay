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

interface OpenAIProviderOptions {
  readonly apiKey: string
  readonly defaultModel?: string
  readonly systemPrompt?: string
  readonly baseURL?: string
  readonly availableModels?: readonly ModelOption[]
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  const model = options.defaultModel ?? DEFAULT_MODEL
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL

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
          max_tokens: 4096,
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
