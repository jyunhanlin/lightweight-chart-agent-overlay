// src/providers/parse-sse.ts

export interface SSEEvent {
  readonly event?: string
  readonly data: string
}

export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<SSEEvent> {
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
      buffer = lines.pop()!

      for (const line of lines) {
        if (line === '') {
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
      }
    }

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
