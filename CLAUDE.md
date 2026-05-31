# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`lightweight-chart-agent-overlay` — an AI analysis overlay for [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) v5. Users drag-select a candle range, ask a question, and get streaming LLM analysis rendered as chart overlays (price lines + markers) plus a multi-turn chat panel. Published to npm and GitHub Packages.

## Commands

Package manager is **pnpm** (enforced via `pnpm-lock.yaml` + CI `--frozen-lockfile`).

```bash
pnpm dev              # Vite dev server for examples/vanilla
pnpm test             # vitest run (jsdom)
pnpm test:watch       # vitest watch mode
pnpm build            # tsdown → dist (ESM + CJS + .d.ts)
pnpm check            # lint + format:check + typecheck — run before pushing
```

Run a single test file or test by name:

```bash
pnpm vitest run src/core/validate-result.test.ts
pnpm vitest run -t "wraps a bare marker"
```

Individual checks: `pnpm lint` (oxlint), `pnpm format` / `pnpm format:check` (oxfmt), `pnpm typecheck` (tsc --noEmit).

For real AI in the example, set `VITE_ANTHROPIC_API_KEY` in `examples/vanilla/.env.local`.

## Tooling notes (non-standard)

- Linter/formatter are the **oxc** tools, not ESLint/Prettier: `oxlint` (config `.oxlintrc.json`) and `oxfmt` (config `.oxfmtrc.json`). `correctness` is `error`; `suspicious`/`perf` are warnings.
- A `pre-push` git hook (simple-git-hooks) runs `pnpm check` automatically.
- Tests are **colocated** — every `foo.ts` has a `foo.test.ts` beside it. vitest runs with `globals: true`, so `describe`/`it`/`expect` need no import.
- Build is **multi-entry** (`tsdown.config.ts`): each public entry point (`index`, `react/index`, `providers/anthropic`, `providers/openai`) is a separate bundle exposed via `package.json` `exports` subpaths, so consumers tree-shake providers/React independently.

## Architecture

Layered, framework-agnostic core with thin adapters. Source lives in `src/`:

- `src/core/` — the engine (vanilla, no React).
- `src/providers/` — LLM adapters (Anthropic, OpenAI) + response parsing. Each is a separately-published entry point.
- `src/react/` — `useAgentOverlay` hook wrapping the core; bridges events to React state.
- `src/index.ts` — public API surface (re-exports + all public types).

### Orchestration

`createAgentOverlay(chart, series, options)` in `src/core/agent-overlay.ts` is the central wiring. It owns no rendering itself — it composes collaborators and routes events between them:

```
RangeSelector ──onSelect──► ChatPanel ──onSubmit──► runAnalysis()
                                                         │
                              LLMProvider.analyzeStream/analyze
                                                         │
                                    parseStreamedResponse → validateResult
                                                         │
                              OverlayRenderer (price lines + markers)
                                                         │
                                            HistoryStore (per-selection)
```

`chart`/`series` are **structurally typed** (`ChartLike`/`SeriesLike` interfaces inside the files), not imported from `lightweight-charts` — that library is a peer dependency, kept loosely coupled.

### Key data-flow contracts (these require reading several files together)

1. **LLM response is a hybrid format**, defined by `src/providers/default-system-prompt.ts`: markdown prose, then a single trailing ` ```json ` block containing `{priceLines, markers}`. `parseStreamedResponse` (`src/providers/parse-response.ts`) separates the two using **brace-counting, not regex** (survives nested JSON) and keys off the *last* fence.

2. **Two result types** — keep them distinct:
   - `AnalysisResult` (loose, provider-facing): `explanation` may be a `string` or `{sections}`; arrays optional.
   - `NormalizedAnalysisResult` (canonical, internal): produced by `validateResult` (`src/core/validate-result.ts`). It coerces explanation into `{sections}`, drops empty arrays, filters malformed items, and even rewraps a bare marker/priceLine the LLM returned without the wrapper. Everything downstream of `validateResult` assumes the normalized shape.

3. **Streaming vs non-streaming dual path** (`runAnalysis` in `agent-overlay.ts`): if a provider implements `analyzeStream` it is preferred; otherwise `analyze` is used. While streaming, the live text view **hides the ` ```json ` fence and everything after it** so users never see raw overlay JSON; the overlays render only once the stream completes and is parsed.

4. **Multi-turn chat**: `buildChatMessages` assembles the `ChatMessage[]` conversation. The **first** user message embeds the full chart-data JSON; later turns are plain text. Built-in providers consume `options.chatMessages`; custom providers may read it from `AnalyzeOptions`. Selecting a new range resets turn state.

5. **BYOK (bring-your-own-key)**: omit `apiKey` when constructing a provider → it sets `requiresApiKey: true` → a settings gear appears, the key is stored in `localStorage` under `apiKeyStorageKey` (default `agent-overlay-api-key`). A `401`/`403` from the provider re-opens the settings panel with an error.

### UI internals

`src/core/ui/` holds the vanilla DOM panel and its behaviors: `ChatPanel` (composes header/messages/input), `make-draggable` / `make-resizable` (window-like panel), `dropdown*` (model/preset pickers), `settings-panel` (BYOK key entry), `calculate-position` (smart placement near the selection), `theme` (CSS-var theming). Layout switches to a compact mode below a 480px container width via a `ResizeObserver`.

`HistoryStore` (`src/core/history-store.ts`) keeps an in-memory ring of recent selections (one entry per range, holding all its turns); the `HistoryButton` and panel nav arrows page through it.

## Releases

Version bumps use **Changesets** (`.changeset/`, `pnpm changeset`). Publishing is **tag-driven**: pushing a `v*` tag triggers the `release` job in `.github/workflows/pipeline.yml`, which builds and publishes to both npm (as `lightweight-chart-agent-overlay`) and GitHub Packages (as `@jyunhanlin/lightweight-chart-agent-overlay`). Tags containing a hyphen (e.g. `v0.4.0-beta.1`) publish under the `next` dist-tag. CI must pass before release runs.

## Design docs

Specs and implementation plans for each feature live in `docs/superpowers/specs/` and `docs/superpowers/plans/` — useful background when changing the chat panel, streaming, provider auth, or responsive layout.
