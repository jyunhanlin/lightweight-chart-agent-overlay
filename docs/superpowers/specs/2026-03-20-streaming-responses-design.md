# Streaming Responses Design

## Problem

Currently, `analyze()` returns a complete `AnalysisResult` in one shot. For typical LLM responses (3-8 seconds), the user sees only a loading bar with no feedback. Streaming the explanation text as it generates makes the experience feel significantly more responsive.

## Goals

1. **Stream explanation text** — display analysis text progressively as LLM generates it
2. **Non-breaking** — existing providers and `analyze()` continue to work unchanged
3. **Overlays after completion** — price lines and markers render only after the full response is parsed

## Non-Goals

- Progressive overlay rendering (streaming partial JSON for price lines/markers)
- Streaming JSON parser
- New event types (`analyze-chunk` etc.) — keep API surface minimal
- Multiple API calls per analysis

## Design

### 1. Provider Interface

Add an optional `analyzeStream()` method to `LLMProvider`:

```ts
interface LLMProvider {
  // Existing — unchanged
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>

  // NEW — optional streaming method
  analyzeStream?(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): AsyncIterable<string>
}
```

- `analyzeStream` is **optional**. The overlay checks for its presence at call time.
- Returns `AsyncIterable<string>` — each yield is a text chunk (token or group of tokens).
- Iterator completion = stream done.
- Both built-in and custom providers can implement either or both methods.

**Resolution order:**

```
provider.analyzeStream exists?
  → Yes: use streaming path
  → No:  fallback to provider.analyze() (current behavior)
```

### 2. Response Format Change

Current system prompt asks the LLM to respond with a single JSON object (`CRITICAL: respond with ONLY a valid JSON object`). This doesn't work for streaming because raw JSON fragments aren't human-readable.

**New format:** The system prompt instructs the LLM to:

1. First, write the analysis in natural language (this is what gets streamed to the user)
2. Then, append a ```` ```json ```` code block with **only** the structured overlay data (priceLines, markers — NO explanation field)

Example LLM output:

```
The selected range shows a clear uptrend with higher highs and higher lows.
Key support at $150 with resistance at $165. RSI is approaching overbought
territory at 68. Volume has been declining on recent green candles, suggesting
weakening momentum...

​```json
{
  "priceLines": [
    { "price": 150, "color": "#22c55e", "title": "Support" },
    { "price": 165, "color": "#ef4444", "title": "Resistance" }
  ],
  "markers": [
    { "time": 1710720000, "position": "belowBar", "shape": "arrowUp", "color": "#22c55e", "text": "Higher Low" }
  ]
}
​```
```

**Important:** The response format changes apply to **both** `analyze()` and `analyzeStream()`. The system prompt is shared — both paths receive text + JSON. This means a new parse function is needed (see Section 7).

### 3. Parsing Strategy: `parseStreamedResponse`

The current `extractJsonFromText` returns only the parsed JSON object and discards surrounding text. A new function handles the text+JSON format:

```ts
interface ParsedStreamResponse {
  readonly explanation: string    // natural language text before the JSON block
  readonly overlays: {
    readonly priceLines?: readonly PriceLineAction[]
    readonly markers?: readonly MarkerAction[]
  }
}

function parseStreamedResponse(fullText: string): ParsedStreamResponse
```

**Algorithm:**
1. Find the last ```` ```json ```` fence in the text
2. Extract the JSON block using existing brace-counting logic
3. Everything before the fence = explanation text (trimmed)
4. Parse the JSON block → `{ priceLines, markers }`
5. If no JSON fence found → entire text is explanation, overlays are empty (explanation-only result)

**Both paths use this function:**
- `analyzeStream`: concatenate all chunks → `parseStreamedResponse(fullText)`
- `analyze`: receive full response text → `parseStreamedResponse(fullText)`

The existing `extractJsonFromText` remains unchanged for backward compatibility, but is no longer used by built-in providers. Custom providers returning `AnalysisResult` directly from `analyze()` are unaffected.

**Edge cases:**
- No JSON block → explanation-only, no overlays (valid result)
- No text before JSON → empty explanation (overlays still render)
- Multiple JSON fences → last one wins (most likely to be the structured output)

### 4. Streaming Flow

```
User submits prompt
  │
  ├─ provider has analyzeStream()?
  │   │
  │   ├─ Yes: STREAMING PATH
  │   │   1. Emit 'analyze-start'
  │   │   2. Hide loading bar, open explanation popup in streaming mode
  │   │   3. Call provider.analyzeStream(context, prompt, signal, options)
  │   │   4. for await (chunk of stream):
  │   │      - Append chunk to popup text (typewriter effect)
  │   │      - Accumulate chunks into fullText
  │   │      - Use requestAnimationFrame to batch DOM updates
  │   │   5. Stream complete:
  │   │      - parseStreamedResponse(fullText) → { explanation, overlays }
  │   │      - Render overlays (priceLines, markers) on chart
  │   │      - Transition popup to structured view
  │   │      - Store in history
  │   │      - Emit 'analyze-complete'
  │   │
  │   └─ No: FALLBACK PATH (current behavior, updated for new format)
  │       1. Emit 'analyze-start'
  │       2. Show loading bar
  │       3. const responseText = await provider.analyze(...)
  │       4. parseStreamedResponse(responseText) → { explanation, overlays }
  │       5. Render overlays + explanation popup
  │       6. Store in history + emit 'analyze-complete'
  │
  └─ Error at any point → emit 'error', show error message
```

**Loading state transitions (streaming path):**
1. Submit → `promptInput.setLoading(true)` (shows loading indicator briefly)
2. First chunk arrives → dismiss loading bar, show streaming popup
3. Stream complete or error → `promptInput.setLoading(false)`

### 5. Cancellation

- User clicks X during streaming → `AbortController.abort()`
- The `AbortSignal` is passed to `analyzeStream()`, provider implementations must respect it
- On abort: clear partial text from popup, clean up UI state
- Same pattern as current cancel logic, extended to streaming

### 6. Explanation Popup Changes

New capabilities for streaming mode:

- **`showStreaming()`** — open popup in streaming mode: empty content area with a blinking cursor indicator. Does NOT call `this.hide()` internally to avoid triggering `onClose` (which clears overlays from previous analysis). Instead, resets content directly.
- **`appendStreamText(chunk: string)`** — append text chunk, auto-scroll to bottom. Batches DOM updates via `requestAnimationFrame` to avoid layout thrashing from rapid chunk delivery.
- **`finalizeStream(result: NormalizedAnalysisResult)`** — transition from raw text to structured sections view, render overlays

During streaming:
- Display raw text as it arrives
- Blinking cursor at end of text (CSS animation)
- History nav disabled (no result yet)
- Close button (X) triggers abort

After completion:
- Smooth transition to current structured sections layout
- History nav enabled
- Overlays rendered on chart

### 7. Built-in Provider Implementation

Both Anthropic and OpenAI providers implement `analyzeStream()`.

**Important:** `analyzeStream` implementations must resolve auth via `options.headers` and `options.apiKey`, matching the existing `analyze()` pattern. The overlay resolves `ProviderHeaders` before calling `analyzeStream()` and passes them via `AnalyzeOptions`, just as it does for `analyze()`.

**Anthropic:**
```ts
async *analyzeStream(context, prompt, signal, options) {
  const apiKey = this.apiKey ?? options?.apiKey
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      ...options?.headers,
    },
    body: JSON.stringify({
      model: options?.model ?? this.defaultModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
    signal,
  })

  for await (const event of parseSSE(response.body)) {
    if (event.type === 'content_block_delta') {
      yield event.delta.text
    }
  }
}
```

**OpenAI:**
```ts
async *analyzeStream(context, prompt, signal, options) {
  const apiKey = this.apiKey ?? options?.apiKey
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...options?.headers,
    },
    body: JSON.stringify({
      model: options?.model ?? this.defaultModel,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: true,
    }),
    signal,
  })

  for await (const event of parseSSE(response.body)) {
    if (event.choices?.[0]?.delta?.content) {
      yield event.choices[0].delta.content
    }
  }
}
```

### 8. SSE Parser (`parseSSE`)

A shared `parseSSE(body: ReadableStream)` utility handles the SSE line protocol, used by both providers.

```ts
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncIterable<SSEEvent> {
  // Read stream line-by-line, parse "data: ..." lines
  // Handle incomplete lines from network chunking (buffer partial lines)
  // Yield parsed JSON objects from data lines
}
```

**Error handling:**
- **OpenAI `[DONE]` sentinel:** When `data: [DONE]` is received, stop iteration (return)
- **Anthropic `message_stop` event:** Stop iteration on `event: message_stop`
- **Error events:** If `event: error` (Anthropic) or an error object in the stream, throw an `Error` with the message
- **Incomplete lines:** Buffer partial data across chunks, only parse complete `\n\n`-delimited events
- **Connection drop:** If the stream ends without a proper termination event, the `for await` loop exits naturally. The caller should check if any data was received and handle accordingly.

### 9. AnalysisResult & History

After streaming or non-streaming response completes:

1. `parseStreamedResponse(fullText)` → `{ explanation, overlays }`
2. Build `NormalizedAnalysisResult`:
   - `explanation.sections` = single section with the natural language text (v1)
   - `priceLines` and `markers` from the parsed JSON block
3. Store in `HistoryStore` as before

**`validateResult` changes:** The JSON block no longer contains an `explanation` field. `validateResult` receives a pre-assembled `AnalysisResult` where explanation is already set from the free text. No changes needed to `validateResult` itself — the assembly happens before validation.

### 10. React Wrapper

No changes needed to `useAgentOverlay`. The React hook wraps the core `AgentOverlay` which handles streaming internally. The existing `isAnalyzing` state and `analyze-start`/`analyze-complete` events cover the streaming lifecycle. If a streaming-specific state is needed later (e.g., `isStreaming`), it can be added as a non-breaking enhancement.

## Files Affected

- `src/core/types.ts` — add `analyzeStream?` to `LLMProvider`
- `src/providers/anthropic.ts` — implement `analyzeStream()`, use shared SSE parser
- `src/providers/openai.ts` — implement `analyzeStream()`, use shared SSE parser
- `src/providers/parse-response.ts` — add `parseStreamedResponse()`, keep `extractJsonFromText` for backward compat
- `src/providers/parse-sse.ts` — NEW: shared SSE stream parser utility
- `src/providers/default-system-prompt.ts` — update prompt for text-first, JSON-last format
- `src/core/agent-overlay.ts` — streaming path orchestration, loading state transitions, `ProviderHeaders` resolution for streaming
- `src/core/ui/explanation-popup.ts` — streaming mode: `showStreaming()`, `appendStreamText()`, `finalizeStream()`
- `src/core/validate-result.ts` — no changes (explanation assembled before validation)
- Tests for all modified/new files

## Test Scenarios

### Provider resolution
- Provider with `analyzeStream` → streaming path used
- Provider without `analyzeStream` → fallback to `analyze()` (no regression)
- Provider with both methods → `analyzeStream` takes priority

### Streaming UI
- Streaming text appears progressively in popup
- Stream completion triggers overlay rendering and structured view transition
- Loading bar dismissed when streaming popup opens
- Cancel during streaming aborts and cleans up UI
- `showStreaming()` does not trigger `onClose` callback

### Parsing
- `parseStreamedResponse` extracts explanation + JSON correctly
- No JSON block → explanation-only result, empty overlays
- No text before JSON → empty explanation, overlays still render
- Multiple JSON fences → last one wins
- Malformed JSON → error with explanation text preserved

### SSE
- SSE parsing handles Anthropic event format (content_block_delta, message_stop)
- SSE parsing handles OpenAI event format (choices delta, [DONE])
- SSE handles error events from both providers
- SSE handles incomplete lines (partial network chunks)
- Connection drop mid-stream handled gracefully

### Integration
- History stores complete result after streaming finishes
- Error during streaming shows error message and cleans up
- AbortSignal respected by stream implementation
- `ProviderHeaders` and `apiKey` correctly forwarded to `analyzeStream`
- Network timeout mid-stream (distinct from user abort)
