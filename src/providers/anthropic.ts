// src/providers/anthropic.ts

import type {
  LLMProvider,
  ChartContext,
  AnalysisResult,
  ModelOption,
  AnalyzeOptions,
} from '../core/types'
import { parseStreamedResponse } from './parse-response'
import { DEFAULT_SYSTEM_PROMPT } from './default-system-prompt'

const API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string
  readonly availableModels: readonly ModelOption[]
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  if (options.availableModels.length === 0) {
    throw new Error('availableModels must contain at least one model')
  }
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

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

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
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
      const parsed = parseStreamedResponse(text)
      return {
        explanation: parsed.explanation || undefined,
        priceLines: parsed.overlays.priceLines,
        markers: parsed.overlays.markers,
      }
    },
  }
}
