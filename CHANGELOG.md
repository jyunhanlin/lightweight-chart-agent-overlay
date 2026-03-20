# lightweight-chart-agent-overlay

## 0.2.0

### Minor Changes

- Add streaming LLM response support

  - Add optional `analyzeStream()` method to `LLMProvider` for streaming responses
  - Explanation text displays progressively with real-time markdown rendering via `marked`
  - Overlays (price lines, markers) render after stream completion
  - Add shared SSE parser utility (`parseSSE`)
  - Add `parseStreamedResponse()` for text + JSON fence format
  - Add `maxTokens` option to built-in providers (default: 8192)
  - Sanitize rendered HTML with DOMPurify
  - System prompt simplified for markdown-native output

## 0.1.0

### Minor Changes

- Initial release: AI-powered analysis overlay for TradingView Lightweight Charts
