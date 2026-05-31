// src/providers/anthropic.ts

import type {
  LLMProvider,
  ChartContext,
  AnalysisResult,
  ModelOption,
  AnalyzeOptions,
} from '../core/types'
import { parseStreamedResponse } from './parse-response'
import { parseSSE } from './parse-sse'
import { DEFAULT_PERSONA, OVERLAY_CONTRACT } from './default-system-prompt'

const API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicProviderOptions {
  readonly apiKey?: string
  readonly systemPrompt?: string // persona (defaults to DEFAULT_PERSONA); contract is auto-injected
  readonly maxTokens?: number
  readonly temperature?: number
  readonly injectOverlayContract?: boolean // default true
  readonly availableModels: readonly ModelOption[]
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
  if (options.availableModels.length === 0) {
    throw new Error('availableModels must contain at least one model')
  }
  const constructorApiKey = options.apiKey
  const model = options.availableModels[0].id
  const persona = options.systemPrompt ?? DEFAULT_PERSONA
  const maxTokens = options.maxTokens ?? 8192
  const temperature = options.temperature
  const injectOverlayContract = options.injectOverlayContract ?? true

  function composeSystemPrompt(analyzeOptions?: AnalyzeOptions): string {
    return [
      analyzeOptions?.systemPrompt ?? persona,
      analyzeOptions?.additionalSystemPrompt,
      injectOverlayContract ? OVERLAY_CONTRACT : undefined,
    ]
      .filter(Boolean)
      .join('\n\n')
  }

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
      const finalSystemPrompt = composeSystemPrompt(analyzeOptions)
      const requestMaxTokens = analyzeOptions?.maxTokens ?? maxTokens
      const requestTemperature = analyzeOptions?.temperature ?? temperature

      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const messages = analyzeOptions?.chatMessages
        ? analyzeOptions.chatMessages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: 'user' as const, content: userMessage }]

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          ...analyzeOptions?.headers,
        },
        body: JSON.stringify({
          model: requestModel,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
          system: finalSystemPrompt,
          messages,
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

    async *analyzeStream(
      context: ChartContext,
      prompt: string,
      signal?: AbortSignal,
      analyzeOptions?: AnalyzeOptions,
    ): AsyncIterable<string> {
      const apiKey = constructorApiKey ?? analyzeOptions?.apiKey
      if (!apiKey) {
        throw new Error('API key is required. Provide it via constructor or AnalyzeOptions.')
      }
      const requestModel = analyzeOptions?.model ?? model
      const finalSystemPrompt = composeSystemPrompt(analyzeOptions)
      const requestMaxTokens = analyzeOptions?.maxTokens ?? maxTokens
      const requestTemperature = analyzeOptions?.temperature ?? temperature

      const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

      const messages = analyzeOptions?.chatMessages
        ? analyzeOptions.chatMessages.map((m) => ({ role: m.role, content: m.content }))
        : [{ role: 'user' as const, content: userMessage }]

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
          ...analyzeOptions?.headers,
        },
        body: JSON.stringify({
          model: requestModel,
          max_tokens: requestMaxTokens,
          ...(requestTemperature !== undefined ? { temperature: requestTemperature } : {}),
          system: finalSystemPrompt,
          messages,
          stream: true,
        }),
        signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic API error (${response.status}): ${errorText}`)
      }

      for await (const event of parseSSE(response.body!)) {
        if (event.event === 'content_block_delta') {
          const parsed = JSON.parse(event.data) as {
            delta?: { type?: string; text?: string }
          }
          if (parsed.delta?.text) {
            yield parsed.delta.text
          }
        }
      }
    },
  }
}
