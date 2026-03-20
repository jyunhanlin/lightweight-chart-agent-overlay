// src/providers/openai.test.ts
import { createOpenAIProvider } from './openai'
import type { ChartContext } from '../core/types'

function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event))
      }
      controller.close()
    },
  })
}

const MOCK_CONTEXT: ChartContext = {
  timeRange: { from: 1000, to: 3000 },
  data: [{ time: 1000, open: 100, high: 110, low: 90, close: 105 }],
}

const MODELS = [{ id: 'gpt-4o-mini', label: 'GPT-4o Mini' }]

describe('createOpenAIProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an object with analyze method', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('should expose availableModels', () => {
    const provider = createOpenAIProvider({ apiKey: 'test', availableModels: MODELS })
    expect(provider.availableModels).toEqual(MODELS)
  })

  it('throws when availableModels is empty', () => {
    expect(() => createOpenAIProvider({ apiKey: 'test', availableModels: [] })).toThrow(
      'availableModels must contain at least one model',
    )
  })

  it('calls OpenAI chat completions API', async () => {
    const responseText = 'Bearish trend'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: responseText } }],
        }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
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

  it('should use analyzeOptions.model when provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'test' } }],
        }),
    })
    const provider = createOpenAIProvider({ apiKey: 'test', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { model: 'gpt-4o' })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe('gpt-4o')
  })

  it('should append additionalSystemPrompt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'test' } }],
        }),
    })
    const provider = createOpenAIProvider({ apiKey: 'test', availableModels: MODELS })
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

    const provider = createOpenAIProvider({ apiKey: 'bad-key', availableModels: MODELS })

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
    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', controller.signal)

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('handles malformed text from LLM gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    const result = await provider.analyze(MOCK_CONTEXT, 'test')
    expect(result.explanation).toBe('not valid json {{{')
    expect(result.priceLines).toBeUndefined()
  })

  it('allows creating provider without apiKey (BYOK mode)', () => {
    const provider = createOpenAIProvider({ availableModels: MODELS })
    expect(provider.analyze).toBeInstanceOf(Function)
  })

  it('sets requiresApiKey to true when apiKey is omitted', () => {
    const provider = createOpenAIProvider({ availableModels: MODELS })
    expect(provider.requiresApiKey).toBe(true)
  })

  it('sets requiresApiKey to false when apiKey is provided', () => {
    const provider = createOpenAIProvider({ apiKey: 'sk-test', availableModels: MODELS })
    expect(provider.requiresApiKey).toBe(false)
  })

  it('uses options.apiKey when constructor apiKey is omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
    })
    const provider = createOpenAIProvider({ availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer sk-byok')
  })

  it('prefers constructor apiKey over options.apiKey', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'test' } }] }),
    })
    const provider = createOpenAIProvider({ apiKey: 'sk-constructor', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer sk-constructor')
  })

  it('throws when no apiKey from constructor or options', async () => {
    const provider = createOpenAIProvider({ availableModels: MODELS })
    await expect(provider.analyze(MOCK_CONTEXT, 'test')).rejects.toThrow('API key is required')
  })

  it('uses chatMessages when provided in analyze options', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
    })
    const provider = createOpenAIProvider({ apiKey: 'key', availableModels: MODELS })
    await provider.analyze(MOCK_CONTEXT, 'ignored', undefined, {
      chatMessages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'follow up' },
      ],
    })
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    // OpenAI prepends system message
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].content).toBe('first question')
    expect(body.messages[3].content).toBe('follow up')
    expect(body.messages).toHaveLength(4)
  })
})

describe('analyzeStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an async iterable of text chunks', async () => {
    const sseEvents = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: createSSEStream(sseEvents) })
    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    const chunks: string[] = []
    for await (const chunk of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('sends stream: true in request body', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, body: createSSEStream(['data: [DONE]\n\n']) })
    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
    }
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.stream).toBe(true)
  })

  it('uses options.apiKey when constructor apiKey is omitted', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, body: createSSEStream(['data: [DONE]\n\n']) })
    const provider = createOpenAIProvider({ availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test', undefined, {
      apiKey: 'sk-byok',
    })) {
    }
    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Bearer sk-byok')
  })

  it('throws when no apiKey available', async () => {
    const provider = createOpenAIProvider({ availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      }
    }).rejects.toThrow('API key is required')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: () => Promise.resolve('Unauthorized') })
    const provider = createOpenAIProvider({ apiKey: 'bad-key', availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      }
    }).rejects.toThrow('OpenAI API error')
  })

  it('uses custom baseURL for streaming', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, body: createSSEStream(['data: [DONE]\n\n']) })
    const provider = createOpenAIProvider({
      apiKey: 'test-key',
      availableModels: MODELS,
      baseURL: 'https://custom.api.com/v1/chat/completions',
    })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
    }
    expect(fetch).toHaveBeenCalledWith(
      'https://custom.api.com/v1/chat/completions',
      expect.any(Object),
    )
  })

  it('skips delta events without content', async () => {
    const sseEvents = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"text"}}]}\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, body: createSSEStream(sseEvents) })
    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    const chunks: string[] = []
    for await (const chunk of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      chunks.push(chunk)
    }
    expect(chunks).toEqual(['text'])
  })

  it('uses chatMessages when provided in analyzeStream options', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, body: createSSEStream(['data: [DONE]\n\n']) })
    const provider = createOpenAIProvider({ apiKey: 'key', availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'ignored', undefined, {
      chatMessages: [
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'follow up' },
      ],
    })) {
    }
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    // OpenAI prepends system message
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[1].content).toBe('first question')
    expect(body.messages[3].content).toBe('follow up')
    expect(body.messages).toHaveLength(4)
  })
})
