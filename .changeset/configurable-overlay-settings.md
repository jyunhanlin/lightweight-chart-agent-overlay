---
"lightweight-chart-agent-overlay": minor
---

Add configurable overlay settings: end-users can now override the analyst **system prompt (persona)**, **temperature**, and **max tokens** at runtime via the settings panel (persisted to localStorage), while developers set defaults through provider options (`systemPrompt`, `temperature`, `maxTokens`). The settings gear is now always available, not just in BYOK mode.

The system prompt is split into an editable persona and a library-owned overlay contract that providers auto-inject (`injectOverlayContract`, default `true`), so editing the persona never breaks overlay rendering.

**Migration (minor breaking):** the provider `systemPrompt` option now means the *persona* and the JSON overlay contract is appended automatically. If you previously passed a full prompt that already included your own JSON contract, set `injectOverlayContract: false` to avoid a duplicated contract.
