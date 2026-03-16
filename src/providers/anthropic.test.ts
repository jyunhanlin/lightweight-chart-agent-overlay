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

describe('createAnthropicProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('calls fetch with correct Anthropic API shape', async () => {
    const mockResponse = {
      explanation: 'Support at 100',
      priceLines: [{ price: 100, title: 'Support' }],
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: JSON.stringify(mockResponse) }],
      }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key' })
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

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    })

    const provider = createAnthropicProvider({ apiKey: 'bad-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Anthropic API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: '{}' }],
      }),
    })

    const controller = new AbortController()
    const provider = createAnthropicProvider({ apiKey: 'test-key' })
    await provider.analyze(MOCK_CONTEXT, 'test', controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('handles malformed JSON from LLM gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      }),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Failed to parse')
  })
})
