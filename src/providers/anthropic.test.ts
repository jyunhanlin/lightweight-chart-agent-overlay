// src/providers/anthropic.test.ts
import { createAnthropicProvider } from './anthropic'
import type { ChartContext } from '../core/types'

const MOCK_CONTEXT: ChartContext = {
  timeRange: { from: 1000, to: 3000 },
  data: [
    { time: 1000, open: 100, high: 110, low: 90, close: 105 },
    { time: 2000, open: 105, high: 115, low: 95, close: 110 },
  ],
}

const MODELS = [{ id: 'claude-haiku-4-5', label: 'Haiku 4.5' }]

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('should expose availableModels', () => {
    const provider = createAnthropicProvider({ apiKey: 'test', availableModels: MODELS })
    expect(provider.availableModels).toEqual(MODELS)
  })

  it('throws when availableModels is empty', () => {
    expect(() => createAnthropicProvider({ apiKey: 'test', availableModels: [] })).toThrow(
      'availableModels must contain at least one model',
    )
  })

  it('calls fetch with correct Anthropic API shape', async () => {
    const mockResponse = {
      explanation: 'Support at 100',
      priceLines: [{ price: 100, title: 'Support' }],
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
        }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    const result = await provider.analyze(MOCK_CONTEXT, 'Find support levels')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        }),
      }),
    )

    expect(result.priceLines).toHaveLength(1)
    expect(result.priceLines![0].price).toBe(100)
  })

  it('should use analyzeOptions.model when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
    })
    const provider = createAnthropicProvider({ apiKey: 'test', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { model: 'claude-sonnet-4-6' })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe('claude-sonnet-4-6')
  })

  it('should append additionalSystemPrompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
    })
    const provider = createAnthropicProvider({ apiKey: 'test', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, {
      additionalSystemPrompt: 'Extra instructions',
    })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.system).toContain('Extra instructions')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    })

    const provider = createAnthropicProvider({ apiKey: 'bad-key', availableModels: MODELS })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Anthropic API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: '{}' }],
        }),
    })

    const controller = new AbortController()
    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('handles malformed JSON from LLM gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: 'text', text: 'not valid json {{{' }],
        }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Failed to parse')
  })

  it('allows creating provider without apiKey (BYOK mode)', () => {
    const provider = createAnthropicProvider({ availableModels: MODELS })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('sets requiresApiKey to true when apiKey is omitted', () => {
    const provider = createAnthropicProvider({ availableModels: MODELS })
    expect(provider.requiresApiKey).toBe(true)
  })

  it('sets requiresApiKey to false when apiKey is provided', () => {
    const provider = createAnthropicProvider({ apiKey: 'sk-test', availableModels: MODELS })
    expect(provider.requiresApiKey).toBe(false)
  })

  it('uses options.apiKey when constructor apiKey is omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
    })
    const provider = createAnthropicProvider({ availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['x-api-key']).toBe('sk-byok')
  })

  it('prefers constructor apiKey over options.apiKey', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
    })
    const provider = createAnthropicProvider({ apiKey: 'sk-constructor', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['x-api-key']).toBe('sk-constructor')
  })

  it('throws when no apiKey from constructor or options', async () => {
    const provider = createAnthropicProvider({ availableModels: MODELS })
    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('API key is required')
  })

  it('includes anthropic-dangerous-direct-browser-access header in BYOK mode', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ text: '{"explanation":"test"}' }] }),
    })
    const provider = createAnthropicProvider({ availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })
})
