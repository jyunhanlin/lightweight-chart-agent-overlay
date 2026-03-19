// src/providers/openai.ts

import type {
  LLMProvider,
  ChartContext,
  AnalysisResult,
  ModelOption,
  AnalyzeOptions,
} from '../core/types'
import { extractJsonFromText } from './parse-response'
import { DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'

const API_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAIProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string
  readonly baseURL?: string
  readonly availableModels: readonly ModelOption[]
}

export function createOpenAIProvider(options: OpenAIProviderOptions): LLMProvider {
  if (options.availableModels.length === 0) {
    throw new Error('availableModels must contain at least one model')
  }
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const baseURL = options.baseURL ?? API_URL

  return {
    availableModels: options.availableModels,
    requiresApiKey: !constructorApiKey,
    async analyze(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
      analyzeOptions?: AnalyzeOptions,
    ): Promise<AnalysisResult> {
      const apiKey = constructorApiKey ?? analyzeOptions?.apiKey
      if (!apiKey) {
        throw new Error('API key is required. Provide it via constructor or AnalyzeOptions.')
      }
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
        ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
        : systemPrompt

      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const response = await fetch(baseURL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
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
