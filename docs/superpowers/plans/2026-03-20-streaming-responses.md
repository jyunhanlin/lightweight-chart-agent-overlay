# Streaming Responses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add streaming LLM response support so explanation text displays progressively (typewriter effect), with overlays rendering after stream completion.

**Architecture:** Optional `analyzeStream()` method on `LLMProvider` returns `AsyncIterable<string>`. System prompt changes to text-first, JSON-last format. New `parseStreamedResponse()` extracts explanation + overlay JSON. SSE parser shared between providers. ExplanationPopup gains streaming mode. Agent overlay orchestrates both paths.

**Tech Stack:** TypeScript, vitest, jsdom, ReadableStream, SSE protocol

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/types.ts` | Modify | Add `analyzeStream?` to `LLMProvider` |
| `src/providers/parse-response.ts` | Modify | Add `parseStreamedResponse()` alongside existing `extractJsonFromText` |
| `src/providers/default-system-prompt.ts` | Modify | Text-first, JSON-last format |
| `src/providers/parse-sse.ts` | Create | Shared SSE stream parser utility |
| `src/providers/anthropic.ts` | Modify | Implement `analyzeStream()`, update `analyze()` for new format |
| `src/providers/openai.ts` | Modify | Implement `analyzeStream()`, update `analyze()` for new format |
| `src/core/ui/explanation-popup.ts` | Modify | Add `showStreaming()`, `appendStreamText()`, `finalizeStream()` |
| `src/core/agent-overlay.ts` | Modify | Streaming path orchestration alongside fallback path |
| `src/index.ts` | Modify | Export new types (`ParsedStreamResponse`) |

---

### Task 1: Add `analyzeStream` to `LLMProvider` type

**Files:**
- Modify: `src/core/types.ts:87-97`
- Modify: `src/index.ts`

- [ ] **Step 1: Add `analyzeStream` method to `LLMProvider` interface**

In `src/core/types.ts`, add the optional method after `analyze`:

```ts
export interface LLMProvider {
  readonly availableModels?: readonly ModelOption[]
  readonly requiresApiKey?: boolean
  readonly headers?: ProviderHeaders
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
  analyzeStream?(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): AsyncIterable<string>
}
```

- [ ] **Step 2: Run typecheck to confirm no breakage**

Run: `pnpm typecheck`
Expected: PASS (method is optional, no existing code breaks)

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add analyzeStream to LLMProvider interface"
```

---

### Task 2: Create `parseStreamedResponse` (TDD)

**Files:**
- Modify: `src/providers/parse-response.ts`
- Modify: `src/providers/parse-response.test.ts`

The new function parses text+JSON responses. It finds the last ` ```json ` fence, extracts the JSON block for overlays, and returns everything before the fence as explanation text.

- [ ] **Step 1: Write failing tests for `parseStreamedResponse`**

Add to `src/providers/parse-response.test.ts`:

```ts
import { extractJsonFromText, parseStreamedResponse } from './parse-response'

// ... existing extractJsonFromText tests ...

describe('parseStreamedResponse', () => {
  it('extracts explanation text and JSON overlays', () => {
    const text = `Here is my analysis of the chart.
Support at $150 with resistance at $165.

\`\`\`json
{
  "priceLines": [{ "price": 150, "color": "#22c55e", "title": "Support" }],
  "markers": []
}
\`\`\``
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe(
      'Here is my analysis of the chart.\nSupport at $150 with resistance at $165.',
    )
    expect(result.overlays.priceLines).toEqual([
      { price: 150, color: '#22c55e', title: 'Support' },
    ])
    expect(result.overlays.markers).toEqual([])
  })

  it('returns explanation-only when no JSON fence', () => {
    const text = 'The chart shows a clear uptrend with no specific levels to mark.'
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe(text)
    expect(result.overlays).toEqual({})
  })

  it('returns empty explanation when text starts with JSON fence', () => {
    const text = `\`\`\`json
{ "priceLines": [{ "price": 100, "title": "Test" }] }
\`\`\``
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe('')
    expect(result.overlays.priceLines).toEqual([{ price: 100, title: 'Test' }])
  })

  it('uses last JSON fence when multiple exist', () => {
    const text = `Here is some analysis mentioning \`\`\`json in passing.

\`\`\`json
{ "priceLines": [{ "price": 200, "title": "Real" }] }
\`\`\``
    const result = parseStreamedResponse(text)
    expect(result.overlays.priceLines).toEqual([{ price: 200, title: 'Real' }])
  })

  it('handles malformed JSON gracefully — returns explanation, empty overlays', () => {
    const text = `Analysis text here.

\`\`\`json
{ invalid json }
\`\`\``
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe('Analysis text here.')
    expect(result.overlays).toEqual({})
  })

  it('handles unclosed JSON fence — returns explanation, empty overlays', () => {
    const text = `Analysis text here.

\`\`\`json
{ "priceLines": [{ "price": 100 }] }`
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe('Analysis text here.')
    expect(result.overlays).toEqual({})
  })

  it('handles empty input', () => {
    const result = parseStreamedResponse('')
    expect(result.explanation).toBe('')
    expect(result.overlays).toEqual({})
  })

  it('handles JSON fence with only markers', () => {
    const text = `Bullish pattern detected.

\`\`\`json
{
  "markers": [{ "time": 1710720000, "position": "belowBar", "shape": "arrowUp", "color": "#22c55e", "text": "Buy" }]
}
\`\`\``
    const result = parseStreamedResponse(text)
    expect(result.explanation).toBe('Bullish pattern detected.')
    expect(result.overlays.markers).toHaveLength(1)
    expect(result.overlays.priceLines).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/providers/parse-response.test.ts`
Expected: FAIL — `parseStreamedResponse` is not exported

- [ ] **Step 3: Implement `parseStreamedResponse`**

Add to `src/providers/parse-response.ts`:

```ts
import type { PriceLineAction, MarkerAction } from '../core/types'

export interface ParsedStreamResponse {
  readonly explanation: string
  readonly overlays: {
    readonly priceLines?: readonly PriceLineAction[]
    readonly markers?: readonly MarkerAction[]
  }
}

export function parseStreamedResponse(fullText: string): ParsedStreamResponse {
  // Find the last ```json fence
  const fencePattern = /```json\s*\n/g
  let lastFenceStart = -1
  let lastFenceEnd = -1
  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(fullText)) !== null) {
    lastFenceStart = match.index
    lastFenceEnd = match.index + match[0].length
  }

  if (lastFenceStart === -1) {
    // No JSON fence — entire text is explanation
    return { explanation: fullText.trim(), overlays: {} }
  }

  const explanation = fullText.slice(0, lastFenceStart).trim()
  const afterFenceOpen = fullText.slice(lastFenceEnd)

  // Use brace-counting to find the JSON object (robust against ``` inside JSON strings)
  const braceStart = afterFenceOpen.indexOf('{')
  if (braceStart === -1) {
    return { explanation, overlays: {} }
  }

  let depth = 0
  let inString = false
  let escaped = false
  let jsonEnd = -1

  for (let i = braceStart; i < afterFenceOpen.length; i++) {
    const ch = afterFenceOpen[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') depth--
    if (depth === 0) {
      jsonEnd = i
      break
    }
  }

  if (jsonEnd === -1) {
    // Unclosed JSON — return explanation only
    return { explanation, overlays: {} }
  }

  const jsonStr = afterFenceOpen.slice(braceStart, jsonEnd + 1)

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      explanation,
      overlays: {
        ...(Array.isArray(parsed.priceLines) && { priceLines: parsed.priceLines }),
        ...(Array.isArray(parsed.markers) && { markers: parsed.markers }),
      },
    }
  } catch {
    // Malformed JSON — return explanation, empty overlays
    return { explanation, overlays: {} }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/providers/parse-response.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/providers/parse-response.ts src/providers/parse-response.test.ts
git commit -m "feat: add parseStreamedResponse for text+JSON format"
```

---

### Task 3: Update system prompt to text-first, JSON-last format

**Files:**
- Modify: `src/providers/default-system-prompt.ts`

- [ ] **Step 1: Update `DEFAULT_SYSTEM_PROMPT`**

Replace content in `src/providers/default-system-prompt.ts`:

```ts
export const DEFAULT_SYSTEM_PROMPT = `You are a financial chart analyst. The user has selected a range of candlestick data and asked a question.

Respond in TWO parts:

PART 1 — ANALYSIS (natural language):
Write your analysis as clear, readable text. Cover the key observations, patterns, support/resistance levels, and any relevant insights. Use paragraphs for readability.

PART 2 — STRUCTURED DATA (JSON code block):
After your analysis text, include a JSON code block with chart overlay data. This MUST be the last thing in your response.

The JSON object can contain:
- "priceLines": array of price level indicators
  [{ "price": number, "title": "string", "color": "#hex", "lineStyle": "solid"|"dashed"|"dotted" }]
- "markers": array of chart markers
  [{ "time": unix_timestamp, "position": "aboveBar"|"belowBar", "shape": "circle"|"square"|"arrowUp"|"arrowDown", "text": "string", "color": "#hex" }]

If there are no overlays to add, use empty arrays.

Example response format:

The selected range shows a clear uptrend with higher highs and higher lows. Key support is at $150 with resistance at $165.

\`\`\`json
{
  "priceLines": [
    { "price": 150, "color": "#22c55e", "title": "Support" },
    { "price": 165, "color": "#ef4444", "title": "Resistance" }
  ],
  "markers": [
    { "time": 1710720000, "position": "belowBar", "shape": "arrowUp", "color": "#22c55e", "text": "Higher Low" }
  ]
}
\`\`\`

IMPORTANT: Always end your response with the JSON code block. Never put text after the JSON block.`
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/providers/default-system-prompt.ts
git commit -m "feat: update system prompt to text-first JSON-last format"
```

---

### Task 4: Update built-in providers' `analyze()` for new format

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/openai.ts`
- Modify: `src/providers/anthropic.test.ts`
- Modify: `src/providers/openai.test.ts`

Both providers currently do `extractJsonFromText(text) as AnalysisResult`. With the new text+JSON format, they need to use `parseStreamedResponse()` and assemble an `AnalysisResult` from the parsed parts.

- [ ] **Step 1: Update existing tests for new response format**

The mock API responses in tests currently return JSON-only text (`JSON.stringify(mockResponse)`). Update them to return text+JSON format.

In `src/providers/anthropic.test.ts`, update the `'calls fetch with correct Anthropic API shape'` test:

```ts
it('calls fetch with correct Anthropic API shape', async () => {
  const responseText = `Support at 100

\`\`\`json
{ "priceLines": [{ "price": 100, "title": "Support" }] }
\`\`\``

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: responseText }],
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
      }),
    }),
  )

  expect(result.explanation).toBe('Support at 100')
  expect(result.priceLines).toHaveLength(1)
  expect(result.priceLines![0].price).toBe(100)
})
```

Update other tests that mock API responses to use the text+JSON format. Tests that return `'{"explanation":"test"}'` should become text+JSON:

```ts
// Old format:
{ content: [{ text: '{"explanation":"test"}' }] }

// New format:
{ content: [{ text: 'test' }] }
```

Note: With the new format, when there's no JSON fence the entire text becomes the explanation, and overlays are empty. This is valid per the spec.

**IMPORTANT: Update ALL mock responses across both test files.** Every test that mocks `'{"explanation":"test"}'` should use plain text `'test'` instead. The `'handles malformed JSON from LLM gracefully'` test must be updated — it currently expects a thrown error, but `parseStreamedResponse` returns explanation-only instead of throwing. Change it to:

```ts
it('handles malformed text from LLM gracefully', async () => {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        content: [{ type: 'text', text: 'not valid json {{{' }],
      }),
  })

  const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
  const result = await provider.analyze(MOCK_CONTEXT, 'test')

  // With parseStreamedResponse, malformed text becomes explanation-only
  expect(result.explanation).toBe('not valid json {{{')
  expect(result.priceLines).toBeUndefined()
})
```

Apply the same pattern to `src/providers/openai.test.ts` (adjust for OpenAI response shape: `{ choices: [{ message: { content: '...' } }] }`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/providers/anthropic.test.ts src/providers/openai.test.ts`
Expected: FAIL — providers still use `extractJsonFromText`

- [ ] **Step 3: Update Anthropic provider `analyze()` to use `parseStreamedResponse`**

In `src/providers/anthropic.ts`, change the import and the return logic:

```ts
import { parseStreamedResponse } from './parse-response'
// Remove: import { extractJsonFromText } from './parse-response'

// In analyze(), replace the last two lines:
// Old:
//   const text = data.content?.[0]?.text ?? ''
//   return extractJsonFromText(text) as AnalysisResult

// New:
const text = data.content?.[0]?.text ?? ''
const parsed = parseStreamedResponse(text)
return {
  explanation: parsed.explanation || undefined,
  priceLines: parsed.overlays.priceLines,
  markers: parsed.overlays.markers,
}
```

- [ ] **Step 4: Update OpenAI provider `analyze()` the same way**

In `src/providers/openai.ts`:

```ts
import { parseStreamedResponse } from './parse-response'

// In analyze(), replace:
// Old:
//   const text = data.choices?.[0]?.message?.content ?? ''
//   return extractJsonFromText(text) as AnalysisResult

// New:
const text = data.choices?.[0]?.message?.content ?? ''
const parsed = parseStreamedResponse(text)
return {
  explanation: parsed.explanation || undefined,
  priceLines: parsed.overlays.priceLines,
  markers: parsed.overlays.markers,
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/providers/anthropic.test.ts src/providers/openai.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS (agent-overlay tests may need adjustment if they assert on explanation format)

- [ ] **Step 7: Commit**

```bash
git add src/providers/anthropic.ts src/providers/openai.ts src/providers/anthropic.test.ts src/providers/openai.test.ts
git commit -m "feat: update providers to use text+JSON response format"
```

---

### Task 5: Create SSE parser (TDD)

**Files:**
- Create: `src/providers/parse-sse.ts`
- Create: `src/providers/parse-sse.test.ts`

This utility parses Server-Sent Events from a `ReadableStream<Uint8Array>` and yields `SSEEvent` objects. It handles buffering of partial lines across network chunks.

- [ ] **Step 1: Write failing tests**

Create `src/providers/parse-sse.test.ts`:

```ts
import { parseSSE, type SSEEvent } from './parse-sse'

/** Helper: create a ReadableStream from an array of string chunks */
function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
}

/** Helper: collect all events from an async iterable */
async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const event of parseSSE(stream)) {
    events.push(event)
  }
  return events
}

describe('parseSSE', () => {
  it('parses a single SSE event', async () => {
    const stream = createStream(['data: {"text":"hello"}\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: '{"text":"hello"}' }])
  })

  it('parses multiple events', async () => {
    const stream = createStream([
      'data: {"a":1}\n\n',
      'data: {"b":2}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('{"a":1}')
    expect(events[1].data).toBe('{"b":2}')
  })

  it('parses event type field', async () => {
    const stream = createStream([
      'event: content_block_delta\ndata: {"delta":{"text":"hi"}}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events[0]).toEqual({
      event: 'content_block_delta',
      data: '{"delta":{"text":"hi"}}',
    })
  })

  it('handles chunks split mid-line', async () => {
    const stream = createStream([
      'data: {"te',
      'xt":"hello"}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('{"text":"hello"}')
  })

  it('handles chunks split across event boundary', async () => {
    const stream = createStream([
      'data: first\n',
      '\ndata: second\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('first')
    expect(events[1].data).toBe('second')
  })

  it('stops on [DONE] sentinel', async () => {
    const stream = createStream([
      'data: {"text":"hi"}\n\n',
      'data: [DONE]\n\n',
      'data: {"text":"should not appear"}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('{"text":"hi"}')
  })

  it('ignores comment lines (starting with :)', async () => {
    const stream = createStream([
      ': this is a comment\n',
      'data: {"text":"hello"}\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events).toHaveLength(1)
    expect(events[0].data).toBe('{"text":"hello"}')
  })

  it('handles empty stream', async () => {
    const stream = createStream([])
    const events = await collectEvents(stream)
    expect(events).toEqual([])
  })

  it('handles data field with no space after colon', async () => {
    const stream = createStream(['data:{"text":"hi"}\n\n'])
    const events = await collectEvents(stream)
    expect(events[0].data).toBe('{"text":"hi"}')
  })

  it('handles multiple data lines for one event (concatenated with newline)', async () => {
    const stream = createStream([
      'data: line1\ndata: line2\n\n',
    ])
    const events = await collectEvents(stream)
    expect(events[0].data).toBe('line1\nline2')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/providers/parse-sse.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `parseSSE`**

Create `src/providers/parse-sse.ts`:

```ts
export interface SSEEvent {
  readonly event?: string
  readonly data: string
}

export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<SSEEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  let currentEvent: string | undefined
  let currentData: string[] = []

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last incomplete line in the buffer
      buffer = lines.pop()!

      for (const line of lines) {
        if (line === '') {
          // Empty line = event boundary
          if (currentData.length > 0) {
            const data = currentData.join('\n')
            if (data === '[DONE]') return
            yield { ...(currentEvent && { event: currentEvent }), data }
          }
          currentEvent = undefined
          currentData = []
        } else if (line.startsWith(':')) {
          // Comment — skip
        } else if (line.startsWith('event:')) {
          currentEvent = line.slice(line.indexOf(':') + 1).trimStart()
        } else if (line.startsWith('data:')) {
          currentData.push(line.slice(line.indexOf(':') + 1).trimStart())
        }
        // Other fields (id:, retry:) are ignored
      }
    }

    // Flush any remaining event
    if (currentData.length > 0) {
      const data = currentData.join('\n')
      if (data !== '[DONE]') {
        yield { ...(currentEvent && { event: currentEvent }), data }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/providers/parse-sse.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/parse-sse.ts src/providers/parse-sse.test.ts
git commit -m "feat: add SSE stream parser utility"
```

---

### Task 6: Implement `analyzeStream` in Anthropic provider (TDD)

**Files:**
- Modify: `src/providers/anthropic.ts`
- Modify: `src/providers/anthropic.test.ts`

- [ ] **Step 1: Write failing tests for Anthropic `analyzeStream`**

Add to `src/providers/anthropic.test.ts`:

```ts
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

describe('analyzeStream', () => {
  it('returns an async iterable of text chunks', async () => {
    const sseEvents = [
      'event: message_start\ndata: {"type":"message_start"}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseEvents),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    const chunks: string[] = []
    for await (const chunk of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('sends stream: true in request body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    // Consume the iterable
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.stream).toBe(true)
  })

  it('uses options.apiKey when constructor apiKey is omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const provider = createAnthropicProvider({ availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })) { /* noop */ }

    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['x-api-key']).toBe('sk-byok')
  })

  it('throws when no apiKey available', async () => {
    const provider = createAnthropicProvider({ availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }
    }).rejects.toThrow('API key is required')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })

    const provider = createAnthropicProvider({ apiKey: 'bad-key', availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }
    }).rejects.toThrow('Anthropic API error')
  })

  it('forwards AbortSignal to fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const controller = new AbortController()
    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test', controller.signal)) { /* noop */ }

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    )
  })

  it('merges options.headers into request', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream([
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
    })

    const provider = createAnthropicProvider({ apiKey: 'test-key', availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test', undefined, {
      headers: { 'X-Custom': 'value' },
    })) { /* noop */ }

    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['X-Custom']).toBe('value')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/providers/anthropic.test.ts`
Expected: FAIL — `provider.analyzeStream` is undefined

- [ ] **Step 3: Implement `analyzeStream` in Anthropic provider**

In `src/providers/anthropic.ts`, add the `analyzeStream` method to the returned object and import `parseSSE`:

```ts
import { parseSSE } from './parse-sse'

// Inside the return object, after analyze():
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
      ...analyzeOptions?.headers,
    },
    body: JSON.stringify({
      model: requestModel,
      max_tokens: 4096,
      system: finalSystemPrompt,
      messages: [{ role: 'user', content: userMessage }],
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
      try {
        const parsed = JSON.parse(event.data)
        if (parsed.delta?.text) {
          yield parsed.delta.text
        }
      } catch {
        // Skip non-JSON events
      }
    }
  }
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/providers/anthropic.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/anthropic.ts src/providers/anthropic.test.ts
git commit -m "feat: implement analyzeStream in Anthropic provider"
```

---

### Task 7: Implement `analyzeStream` in OpenAI provider (TDD)

**Files:**
- Modify: `src/providers/openai.ts`
- Modify: `src/providers/openai.test.ts`

- [ ] **Step 1: Write failing tests for OpenAI `analyzeStream`**

Add to `src/providers/openai.test.ts` (same `createSSEStream` helper):

```ts
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

describe('analyzeStream', () => {
  it('returns an async iterable of text chunks', async () => {
    const sseEvents = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseEvents),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    const chunks: string[] = []
    for await (const chunk of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['Hello', ' world'])
  })

  it('sends stream: true in request body', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(['data: [DONE]\n\n']),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(body.stream).toBe(true)
  })

  it('uses options.apiKey when constructor apiKey is omitted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(['data: [DONE]\n\n']),
    })

    const provider = createOpenAIProvider({ availableModels: MODELS })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test', undefined, { apiKey: 'sk-byok' })) { /* noop */ }

    const headers = (globalThis.fetch as any).mock.calls[0][1].headers
    expect(headers['Authorization']).toBe('Bearer sk-byok')
  })

  it('throws when no apiKey available', async () => {
    const provider = createOpenAIProvider({ availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }
    }).rejects.toThrow('API key is required')
  })

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })

    const provider = createOpenAIProvider({ apiKey: 'bad-key', availableModels: MODELS })
    await expect(async () => {
      for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }
    }).rejects.toThrow('OpenAI API error')
  })

  it('uses custom baseURL for streaming', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(['data: [DONE]\n\n']),
    })

    const provider = createOpenAIProvider({
      apiKey: 'test-key',
      availableModels: MODELS,
      baseURL: 'https://custom.api.com/v1/chat/completions',
    })
    for await (const _ of provider.analyzeStream!(MOCK_CONTEXT, 'test')) { /* noop */ }

    expect(fetch).toHaveBeenCalledWith('https://custom.api.com/v1/chat/completions', expect.any(Object))
  })

  it('skips delta events without content', async () => {
    const sseEvents = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"text"}}]}\n\n',
      'data: {"choices":[{"delta":{}}]}\n\n',
      'data: [DONE]\n\n',
    ]

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createSSEStream(sseEvents),
    })

    const provider = createOpenAIProvider({ apiKey: 'test-key', availableModels: MODELS })
    const chunks: string[] = []
    for await (const chunk of provider.analyzeStream!(MOCK_CONTEXT, 'test')) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual(['text'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/providers/openai.test.ts`
Expected: FAIL — `provider.analyzeStream` is undefined

- [ ] **Step 3: Implement `analyzeStream` in OpenAI provider**

In `src/providers/openai.ts`, add `analyzeStream` and import `parseSSE`:

```ts
import { parseSSE } from './parse-sse'

// Inside the return object, after analyze():
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
  const finalSystemPrompt = analyzeOptions?.additionalSystemPrompt
    ? `${systemPrompt}\n\n${analyzeOptions.additionalSystemPrompt}`
    : systemPrompt

  const userMessage = `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${prompt}`

  const response = await fetch(baseURL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...analyzeOptions?.headers,
    },
    body: JSON.stringify({
      model: requestModel,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 4096,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
  }

  for await (const event of parseSSE(response.body!)) {
    try {
      const parsed = JSON.parse(event.data)
      const content = parsed.choices?.[0]?.delta?.content
      if (content) {
        yield content
      }
    } catch {
      // Skip non-JSON events
    }
  }
},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/providers/openai.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/providers/openai.ts src/providers/openai.test.ts
git commit -m "feat: implement analyzeStream in OpenAI provider"
```

---

### Task 8: Add streaming mode to ExplanationPopup (TDD)

**Files:**
- Modify: `src/core/ui/explanation-popup.ts`
- Modify: `src/core/ui/explanation-popup.test.ts`

Add three new methods: `showStreaming()`, `appendStreamText()`, `finalizeStream()`. Add an `onAbort` callback for cancellation during streaming.

- [ ] **Step 1: Write failing tests**

Add to `src/core/ui/explanation-popup.test.ts`.

**IMPORTANT:** `requestAnimationFrame` is not available in jsdom. Add this mock in the test setup:

```ts
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
```

Then add the streaming tests:

```ts
describe('Streaming mode', () => {
  it('showStreaming() creates popup with empty content and cursor', () => {
    const popup = new ExplanationPopup(container)
    popup.showStreaming()
    const el = container.querySelector('[data-agent-overlay-explanation]')
    expect(el).not.toBeNull()
    const streamArea = el!.querySelector('[data-agent-overlay-stream-text]')
    expect(streamArea).not.toBeNull()
    expect(streamArea!.textContent).toBe('')
    // Cursor indicator present
    const cursor = el!.querySelector('[data-agent-overlay-stream-cursor]')
    expect(cursor).not.toBeNull()
  })

  it('showStreaming() does NOT trigger onClose', () => {
    const popup = new ExplanationPopup(container)
    const onClose = vi.fn()
    popup.onClose = onClose
    // First show a normal popup
    popup.show({ entry: makeEntry(), currentIndex: 0, totalCount: 1 })
    // Then switch to streaming mode
    popup.showStreaming()
    // onClose should NOT have been called (no hide triggered)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('appendStreamText() adds text to the stream area', () => {
    const popup = new ExplanationPopup(container)
    popup.showStreaming()
    popup.appendStreamText('Hello ')
    popup.appendStreamText('world')
    const streamArea = container.querySelector('[data-agent-overlay-stream-text]')
    expect(streamArea!.textContent).toBe('Hello world')
  })

  it('close button during streaming fires onAbort', () => {
    const popup = new ExplanationPopup(container)
    const onAbort = vi.fn()
    popup.onAbort = onAbort
    popup.showStreaming()
    const closeBtn = container.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn.click()
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('Escape during streaming fires onAbort', () => {
    const popup = new ExplanationPopup(container)
    const onAbort = vi.fn()
    popup.onAbort = onAbort
    popup.showStreaming()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('history nav is hidden during streaming', () => {
    const popup = new ExplanationPopup(container)
    popup.showStreaming()
    const nav = container.querySelector('[data-agent-overlay-nav]')
    // Nav should either be absent or have hidden controls
    if (nav) {
      const navLeft = nav.firstElementChild as HTMLElement
      expect(navLeft.style.visibility).toBe('hidden')
    }
  })

  it('finalizeStream() transitions to structured view', () => {
    const popup = new ExplanationPopup(container)
    popup.showStreaming()
    popup.appendStreamText('Analysis text here')

    const entry = makeEntry()
    popup.finalizeStream({
      entry,
      currentIndex: 0,
      totalCount: 1,
    })

    // Stream text area should be gone
    expect(container.querySelector('[data-agent-overlay-stream-text]')).toBeNull()
    // Structured sections should be present
    expect(container.querySelectorAll('[data-agent-overlay-section-label]').length).toBeGreaterThan(0)
  })

  it('hide() cleans up streaming popup', () => {
    const popup = new ExplanationPopup(container)
    popup.showStreaming()
    popup.appendStreamText('partial text')
    popup.hide()
    expect(container.querySelector('[data-agent-overlay-explanation]')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/ui/explanation-popup.test.ts`
Expected: FAIL — `showStreaming`, `appendStreamText`, `finalizeStream`, `onAbort` do not exist

- [ ] **Step 3: Implement streaming mode in ExplanationPopup**

In `src/core/ui/explanation-popup.ts`, add the new methods and properties:

```ts
export class ExplanationPopup {
  // ... existing properties ...
  private isStreaming = false
  private streamTextEl: HTMLElement | null = null
  private pendingText = ''
  private rafId: number | null = null

  onClose: (() => void) | null = null
  onNavigate: ((direction: -1 | 1) => void) | null = null
  onAbort: (() => void) | null = null

  // ... existing constructor and show() ...

  showStreaming(position?: UIPosition): void {
    // Remove existing popup WITHOUT triggering onClose
    this.cleanupDrag?.()
    this.cleanupDrag = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }

    this.isStreaming = true

    const posLeft = position?.left ?? 0
    const posTop = position ? position.top + ESTIMATED_UI_HEIGHT : 0

    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-agent-overlay-explanation', '')
    wrapper.style.cssText = `
      position: absolute; z-index: 1000; background: var(--ao-bg); border: 1px solid var(--ao-border);
      border-radius: 6px; max-width: 360px; max-height: min(400px, calc(100vh - ${UI_PADDING * 2}px));
      overflow-y: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      color: var(--ao-text); font-size: 13px; cursor: grab;
    `
    wrapper.style.left = `${posLeft}px`
    wrapper.style.top = `${posTop}px`

    // Nav bar with close button only (no history nav during streaming)
    const handleClose = () => {
      if (this.isStreaming) {
        this.onAbort?.()
      } else {
        this.hide()
      }
    }

    const nav = buildNavBar(0, 1, () => {}, () => {}, handleClose)
    wrapper.appendChild(nav)

    // Stream text area
    const streamArea = document.createElement('div')
    streamArea.setAttribute('data-agent-overlay-stream-text', '')
    streamArea.style.cssText = `
      padding: 8px 12px; font-size: 13px; color: var(--ao-text);
      line-height: 1.5; white-space: pre-wrap; min-height: 40px;
    `
    wrapper.appendChild(streamArea)
    this.streamTextEl = streamArea

    // Blinking cursor
    const cursor = document.createElement('span')
    cursor.setAttribute('data-agent-overlay-stream-cursor', '')
    cursor.textContent = '\u258c'
    cursor.style.cssText = 'animation: ao-blink 1s step-end infinite; color: var(--ao-text);'
    streamArea.appendChild(cursor)

    // Add blink animation if not already present
    if (!document.querySelector('#ao-stream-keyframes')) {
      const style = document.createElement('style')
      style.id = 'ao-stream-keyframes'
      style.textContent = '@keyframes ao-blink { 50% { opacity: 0; } }'
      document.head.appendChild(style)
    }

    wrapper.addEventListener('mousedown', (e) => e.stopPropagation())
    this.container.appendChild(wrapper)
    this.wrapper = wrapper
    document.addEventListener('keydown', this.handleEscape)

    clampToViewport(wrapper)
    this.cleanupDrag = makeDraggable(wrapper, { exclude: 'button' })
  }

  appendStreamText(chunk: string): void {
    this.pendingText += chunk
    if (this.rafId !== null) return
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null
      if (!this.streamTextEl) return
      const cursor = this.streamTextEl.querySelector('[data-agent-overlay-stream-cursor]')
      // Insert text before cursor
      if (cursor) {
        cursor.before(this.pendingText)
      } else {
        this.streamTextEl.append(this.pendingText)
      }
      this.pendingText = ''
      // Auto-scroll
      if (this.wrapper) {
        this.wrapper.scrollTop = this.wrapper.scrollHeight
      }
    })
  }

  finalizeStream(options: ExplanationShowOptions): void {
    this.isStreaming = false
    this.streamTextEl = null
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.pendingText = ''
    // Re-render as structured view (reuses existing show())
    // But we need to avoid triggering onClose, so we clean up manually
    this.cleanupDrag?.()
    this.cleanupDrag = null
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
      document.removeEventListener('keydown', this.handleEscape)
    }
    // Show structured view without triggering onClose
    this.showInternal(options)
  }
}
```

Note: The existing `show()` method calls `this.hide()` which triggers `onClose`. For `finalizeStream`, we need to avoid that. Extract the rendering logic into a private `showInternal()` method that both `show()` and `finalizeStream()` use, with `show()` calling `this.hide()` first.

Update the `handleEscape` handler to check `isStreaming`:

```ts
this.handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (this.isStreaming) {
      this.onAbort?.()
    } else {
      this.hide()
    }
  }
}
```

Refactor: Extract the current `show()` body into `private showInternal(options)`, then `show()` becomes:

```ts
show(options: ExplanationShowOptions): void {
  this.hide()
  this.showInternal(options)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/ui/explanation-popup.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/ui/explanation-popup.ts src/core/ui/explanation-popup.test.ts
git commit -m "feat: add streaming mode to ExplanationPopup"
```

---

### Task 9: Wire streaming path in agent-overlay (TDD)

**Files:**
- Modify: `src/core/agent-overlay.ts`
- Modify: `src/core/agent-overlay.test.ts`

This is the orchestration task. The `runAnalysis` function checks for `analyzeStream`, runs the streaming path, and falls back to the (updated) non-streaming path.

- [ ] **Step 1: Write failing tests for streaming path**

Add to `src/core/agent-overlay.test.ts`:

```ts
function createStreamingProvider(
  chunks: string[],
  result: AnalysisResult = {},
): LLMProvider {
  return {
    analyze: vi.fn().mockResolvedValue(result),
    async *analyzeStream() {
      for (const chunk of chunks) {
        yield chunk
      }
    },
  }
}

describe('streaming path', () => {
  it('uses analyzeStream when provider has it', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider = createStreamingProvider(
      ['Analysis text.\n\n', '```json\n{"priceLines":[{"price":100,"title":"S"}]}\n```'],
    )

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    selectAndSubmit(agent, el, 'test')

    await vi.waitFor(() => {
      // Explanation popup should be present (streaming or finalized)
      const popup = el.querySelector('[data-agent-overlay-explanation]')
      expect(popup).not.toBeNull()
    })

    // analyze() should NOT have been called
    expect(provider.analyze).not.toHaveBeenCalled()
  })

  it('falls back to analyze when no analyzeStream', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const mockResult: AnalysisResult = {
      explanation: 'Fallback result',
      priceLines: [{ price: 100, title: 'Support' }],
    }
    const provider = createMockProvider(mockResult)

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    selectAndSubmit(agent, el, 'test')

    await vi.waitFor(() => {
      expect(provider.analyze).toHaveBeenCalled()
    })
  })

  it('emits analyze-start and analyze-complete for streaming', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()
    const provider = createStreamingProvider(
      ['Text.\n\n', '```json\n{"priceLines":[],"markers":[]}\n```'],
    )

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onStart = vi.fn()
    const onComplete = vi.fn()
    agent.on('analyze-start', onStart)
    agent.on('analyze-complete', onComplete)

    selectAndSubmit(agent, el, 'test')

    await vi.waitFor(() => {
      expect(onStart).toHaveBeenCalledTimes(1)
      expect(onComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('abort during streaming cleans up', async () => {
    const { chart, el } = createMockChart()
    const series = createMockSeries()

    // Create a provider that yields slowly (simulate streaming)
    let aborted = false
    const provider: LLMProvider = {
      analyze: vi.fn().mockResolvedValue({}),
      async *analyzeStream(_ctx, _prompt, signal) {
        yield 'chunk1'
        // Check if aborted
        if (signal?.aborted) {
          aborted = true
          return
        }
        yield 'chunk2'
      },
    }

    const agent = createAgentOverlay(chart as never, series as never, { provider })
    const onError = vi.fn()
    agent.on('error', onError)

    selectAndSubmit(agent, el, 'test')

    // Wait for streaming to start
    await vi.waitFor(() => {
      expect(el.querySelector('[data-agent-overlay-explanation]')).not.toBeNull()
    })

    // Cancel
    const closeBtn = el.querySelector('[data-agent-overlay-close]') as HTMLButtonElement
    closeBtn?.click()

    // Popup should be cleaned up
    await vi.waitFor(() => {
      expect(el.querySelector('[data-agent-overlay-explanation]')).toBeNull()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/core/agent-overlay.test.ts`
Expected: FAIL — streaming path not implemented in agent-overlay

- [ ] **Step 3: Implement streaming path in `runAnalysis`**

In `src/core/agent-overlay.ts`, import `parseStreamedResponse`:

```ts
import { parseStreamedResponse } from '../providers/parse-response'
```

Modify `runAnalysis` to check for `analyzeStream` and branch:

```ts
async function runAnalysis(
  context: ChartContext,
  prompt: string,
  additionalSystemPrompt: string | undefined,
  isQuickRun: boolean,
  analysisPresets: readonly AnalysisPreset[],
  currentRange: { readonly from: TimeValue; readonly to: TimeValue },
): Promise<void> {
  const storageKey = options.apiKeyStorageKey ?? 'agent-overlay-api-key'
  const storedApiKey = options.provider.requiresApiKey
    ? (localStorage.getItem(storageKey) ?? undefined)
    : undefined

  if (options.provider.requiresApiKey && !storedApiKey) {
    promptInput.openSettings('Please enter your API key to continue.')
    return
  }

  promptInput.setLoading(true)
  emitter.emit('analyze-start')
  abortController = new AbortController()
  const { signal } = abortController

  try {
    const resolvedHeaders = await resolveHeaders(options.provider)
    const analyzeOptions: AnalyzeOptions = {
      model: promptInput.getSelectedModel(),
      additionalSystemPrompt: additionalSystemPrompt || undefined,
      apiKey: storedApiKey,
      headers: resolvedHeaders,
    }

    let result: NormalizedAnalysisResult

    if (options.provider.analyzeStream) {
      // ── Streaming path ──────────────────────────────────────────
      const position = promptInput.getLastPosition() ?? undefined
      explanationPopup.showStreaming(position)
      promptInput.hide()

      let fullText = ''
      for await (const chunk of options.provider.analyzeStream(
        context,
        prompt,
        signal,
        analyzeOptions,
      )) {
        fullText += chunk
        explanationPopup.appendStreamText(chunk)
      }

      const parsed = parseStreamedResponse(fullText)
      result = validateResult({
        explanation: parsed.explanation || undefined,
        priceLines: parsed.overlays.priceLines,
        markers: parsed.overlays.markers,
      })
    } else {
      // ── Fallback path (non-streaming) ───────────────────────────
      const rawResult = await options.provider.analyze(
        context,
        prompt,
        signal,
        analyzeOptions,
      )
      result = validateResult(rawResult)
    }

    const entry = {
      prompt,
      isQuickRun,
      model: promptInput.getSelectedModel(),
      presets: analysisPresets,
      result,
      range: currentRange,
    }

    historyStore.push(entry)
    historyButton.setCount(historyStore.size())
    currentHistoryIndex = historyStore.size() - 1

    if (options.provider.analyzeStream) {
      // Finalize streaming popup → structured view
      explanationPopup.finalizeStream({
        entry,
        currentIndex: currentHistoryIndex,
        totalCount: historyStore.size(),
        position: promptInput.getLastPosition() ?? undefined,
      })
    } else {
      // Non-streaming: show popup
      if (result.explanation) {
        explanationPopup.show({
          entry,
          currentIndex: currentHistoryIndex,
          totalCount: historyStore.size(),
          position: promptInput.getLastPosition() ?? undefined,
        })
      }
      promptInput.hide()
    }

    renderer.clear()
    renderer.render(result)
    emitter.emit('analyze-complete', result)
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      const message = err instanceof Error ? err.message : String(err)
      const isAuthError = /\b(401|403)\b/.test(message)

      if (isAuthError && options.provider.requiresApiKey) {
        promptInput.setLoading(false)
        promptInput.openSettings('Invalid API key. Please check your key in Settings.')
      } else {
        promptInput.setLoading(false)
        promptInput.showError(message)
      }
      emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
    // On abort or error during streaming, clean up popup
    explanationPopup.hide()
  } finally {
    abortController = null
    promptInput.setLoading(false)
  }
}
```

Wire `onAbort` callback:

```ts
explanationPopup.onAbort = () => {
  cancelInFlight()
  explanationPopup.hide()
  rangeSelector.clearSelection()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/core/agent-overlay.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 6: Run typecheck and lint**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/agent-overlay.ts src/core/agent-overlay.test.ts
git commit -m "feat: wire streaming path in agent overlay"
```

---

### Task 10: Update exports and final verification

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Export new types**

Add to `src/index.ts`:

```ts
export type { ParsedStreamResponse } from './providers/parse-response'
```

Also export `parseStreamedResponse` if custom providers need it:

```ts
export { parseStreamedResponse } from './providers/parse-response'
```

- [ ] **Step 2: Run full quality gate**

Run: `pnpm check`
Expected: ALL PASS (lint + format + typecheck)

- [ ] **Step 3: Run full test suite with coverage**

Run: `pnpm test:coverage`
Expected: ALL PASS, coverage >= 80% on new files

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: PASS — dist/ contains updated exports

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: export streaming response types and utilities"
```

---

## Dependency Graph

```
Task 1 (types) ─────────────────────────────────┐
Task 2 (parseStreamedResponse) ──┬───────────────┤
Task 3 (system prompt) ──────────┤               │
Task 5 (SSE parser) ─────────────┤               │
                                  │               │
Task 4 (providers analyze) ──────┘ (needs 2+3)   │
Task 6 (Anthropic stream) ──── (needs 1+5) ─────┤
Task 7 (OpenAI stream) ─────── (needs 1+5) ─────┤
Task 8 (ExplanationPopup streaming) ─────────────┤
                                                  │
Task 9 (agent-overlay wiring) ───────────────────┘
Task 10 (exports + verify) ──────── after Task 9
```

**Parallelizable groups:**
- Tasks 1, 2, 3, 5 can run in parallel (no deps between them)
- Task 4 depends on Tasks 2 + 3; Tasks 6, 7 depend on Tasks 1 + 5; Task 8 has no upstream deps beyond types
- Tasks 4, 6, 7, 8 can run in parallel once their respective deps are done
- Task 9 depends on all previous tasks
- Task 10 depends on Task 9
