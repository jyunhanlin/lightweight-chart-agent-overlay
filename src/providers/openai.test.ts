// src/providers/openai.test.ts
import { createOpenAIProvider } from './openai'
import type { ChartContext } from '../core/types'

const MOCK_CONTEXT: ChartContext = {
  timeRange: { from: 1000, to: 3000 },
  data: [{ time: 1000, open: 100, high: 110, low: 90, close: 105 }],
}

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key' })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('should expose availableModels when provided', () => {
    const provider = createOpenAIProvider({
      apiKey: 'test',
      availableModels: [{ id: 'gpt-4o', label: 'GPT-4o' }],
    })
    expect(provider.availableModels).toEqual([{ id: 'gpt-4o', label: 'GPT-4o' }])
  })

  it('should have undefined availableModels when not provided', () => {
    const provider = createOpenAIProvider({ apiKey: 'test' })
    expect(provider.availableModels).toBeUndefined()
  })

  it('calls OpenAI chat completions API', async () => {
    const mockResponse = { explanation: 'Bearish trend' }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key' })
    const result = await provider.analyze(MOCK_CONTEXT, 'Analyze trend')

    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      }),
    )

    expect(result.explanation).toBe('Bearish trend')
  })

  it('should use options.model when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"explanation":"test"}' } }],
        }),
    })
    const provider = createOpenAIProvider({ apiKey: 'test' })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { model: 'gpt-4o' })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe('gpt-4o')
  })

  it('should append additionalSystemPrompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"explanation":"test"}' } }],
        }),
    })
    const provider = createOpenAIProvider({ apiKey: 'test' })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, {
      additionalSystemPrompt: 'Extra instructions',
    })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    const systemMessage = body.messages.find((m: { role: string }) => m.role === 'system')
    expect(systemMessage.content).toContain('Extra instructions')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: () => Promise.resolve('Invalid API key'),
    })

    const provider = createOpenAIProvider({ apiKey: 'bad-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('OpenAI API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{}' } }],
        }),
    })

    const controller = new AbortController()
    const provider = createOpenAIProvider({ apiKey: 'test-key' })
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
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key' })

    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('Failed to parse')
  })
})
