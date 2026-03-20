// src/providers/parse-sse.test.ts
import { parseSSE } from './parse-sse'
import type { SSEEvent } from './parse-sse'

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

async function collectEvents(stream: ReadableStream<Uint8Array>): Promise<SSEEvent[]> {
  const events: SSEEvent[] = []
  for await (const event of parseSSE(stream)) {
    events.push(event)
  }
  return events
}

describe('parseSSE', () => {
  it('parses a single SSE event', async () => {
    const stream = createStream(['data: hello\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'hello' }])
  })

  it('parses multiple events', async () => {
    const stream = createStream(['data: first\n\ndata: second\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'first' }, { data: 'second' }])
  })

  it('parses event type field', async () => {
    const stream = createStream(['event: update\ndata: payload\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ event: 'update', data: 'payload' }])
  })

  it('handles chunks split mid-line (buffering)', async () => {
    const stream = createStream(['data: hel', 'lo\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'hello' }])
  })

  it('handles chunks split across event boundary', async () => {
    const stream = createStream(['data: first\n', '\ndata: second\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'first' }, { data: 'second' }])
  })

  it('stops on [DONE] sentinel', async () => {
    const stream = createStream(['data: first\n\ndata: [DONE]\n\ndata: after\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'first' }])
  })

  it('ignores comment lines (starting with :)', async () => {
    const stream = createStream([': this is a comment\ndata: hello\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'hello' }])
  })

  it('handles empty stream', async () => {
    const stream = createStream([])
    const events = await collectEvents(stream)
    expect(events).toEqual([])
  })

  it('handles data field with no space after colon', async () => {
    const stream = createStream(['data:nospace\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'nospace' }])
  })

  it('handles multiple data lines for one event (concatenated with newline)', async () => {
    const stream = createStream(['data: line1\ndata: line2\n\n'])
    const events = await collectEvents(stream)
    expect(events).toEqual([{ data: 'line1\nline2' }])
  })
})
