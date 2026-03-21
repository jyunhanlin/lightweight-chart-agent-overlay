// src/core/agent-overlay.ts

import type {
  AgentOverlay,
  AgentOverlayEventMap,
  AgentOverlayOptions,
  AnalyzeOptions,
  ChartContext,
  ChatMessage,
  ChatTurn,
  HistoryEntry,
  LLMProvider,
  NormalizedAnalysisResult,
  TimeValue,
} from './types'
import { createEventEmitter } from './event-emitter'
import { validateResult } from './validate-result'
import { defaultPromptBuilder } from './prompt-builder'
import { RangeSelector } from './selection/range-selector'
import { buildChartContext } from './selection/context-builder'
import { OverlayRenderer } from './overlay/overlay-renderer'
import { ChatPanel } from './ui/chat-panel'
import { calculateSmartPosition } from './ui/calculate-position'
import { applyThemeVars } from './ui/theme'
import { DEFAULT_PRESETS } from './default-presets'
import { createHistoryStore } from './history-store'
import { HistoryButton } from './ui/history-button'
import { parseStreamedResponse } from '../providers/parse-response'

async function resolveHeaders(provider: {
  headers?: LLMProvider['headers']
}): Promise<Readonly<Record<string, string>> | undefined> {
  if (!provider.headers) return undefined
  if (typeof provider.headers === 'function') {
    return provider.headers()
  }
  return { ...provider.headers }
}

interface ChartLike {
  timeScale(): {
    coordinateToTime(x: number): unknown
    timeToCoordinate(time: unknown): number | null
  }
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
  data(): readonly Record<string, unknown>[]
  priceToCoordinate(price: number): number | null
}

export function createAgentOverlay(
  chart: ChartLike,
  series: SeriesLike,
  options: AgentOverlayOptions,
): AgentOverlay {
  // ── Initialization ─────────────────────────────────────────────────────────

  const emitter = createEventEmitter<AgentOverlayEventMap>()
  const chartEl = chart.chartElement()
  let theme: 'light' | 'dark' = options.theme ?? 'dark'
  const promptBuilder = options.promptBuilder ?? defaultPromptBuilder
  const presets = options.presets ?? DEFAULT_PRESETS

  if (getComputedStyle(chartEl).position === 'static') {
    chartEl.style.position = 'relative'
  }
  applyThemeVars(chartEl, theme)

  const rangeSelector = new RangeSelector(chart as never, series as never)
  const renderer = new OverlayRenderer(series as never)
  const historyStore = createHistoryStore()
  const historyButton = new HistoryButton(chartEl)
  historyButton.setCount(0)

  const chatPanel = new ChatPanel(chartEl, {
    availableModels: options.provider.availableModels,
    presets,
    requiresApiKey: options.provider.requiresApiKey,
    apiKeyStorageKey: options.apiKeyStorageKey,
  })

  const COMPACT_BREAKPOINT = 480
  let isCompact = false

  const resizeObserver = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry) return
    const width = entry.contentRect.width
    const shouldBeCompact = width < COMPACT_BREAKPOINT
    if (shouldBeCompact !== isCompact) {
      isCompact = shouldBeCompact
      chatPanel.setCompact(isCompact)
    }
  })
  resizeObserver.observe(chartEl)

  // Synchronous initial check — ResizeObserver callback is async
  const initialWidth = chartEl.getBoundingClientRect().width
  if (initialWidth > 0 && initialWidth < COMPACT_BREAKPOINT) {
    isCompact = true
    chatPanel.setCompact(true)
  }

  let abortController: AbortController | null = null
  let currentHistoryIndex = -1
  let currentTurns: ChatTurn[] = []
  let currentRange: { from: TimeValue; to: TimeValue } | null = null

  // ── Core logic ─────────────────────────────────────────────────────────────

  function getSmartPosition(range: { from: TimeValue; to: TimeValue }) {
    return calculateSmartPosition({
      chartEl,
      timeToCoordinate: (time) => chart.timeScale().timeToCoordinate(time),
      priceToCoordinate: (price) => series.priceToCoordinate(price),
      range,
      seriesData: series.data(),
    })
  }

  function cancelInFlight(): void {
    abortController?.abort()
    abortController = null
  }

  function buildChatMessages(
    context: ChartContext,
    turns: readonly ChatTurn[],
    currentUserMessage: string,
  ): ChatMessage[] {
    const messages: ChatMessage[] = []
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]
      if (i === 0) {
        messages.push({
          role: 'user',
          content: `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${turn.userMessage}`,
        })
      } else {
        messages.push({ role: 'user', content: turn.userMessage })
      }
      messages.push({ role: 'assistant', content: turn.rawResponse })
    }
    // Current question
    if (turns.length === 0) {
      messages.push({
        role: 'user',
        content: `Chart data (${context.data.length} candles, from ${context.timeRange.from} to ${context.timeRange.to}):\n${JSON.stringify(context.data)}\n\nUser question: ${currentUserMessage}`,
      })
    } else {
      messages.push({ role: 'user', content: currentUserMessage })
    }
    return messages
  }

  async function runAnalysis(
    context: ChartContext,
    userMessage: string,
    additionalSystemPrompt: string | undefined,
  ): Promise<void> {
    const storageKey = options.apiKeyStorageKey ?? 'agent-overlay-api-key'
    const storedApiKey = options.provider.requiresApiKey
      ? (localStorage.getItem(storageKey) ?? undefined)
      : undefined

    if (options.provider.requiresApiKey && !storedApiKey) {
      chatPanel.openSettings('Please enter your API key to continue.')
      return
    }

    chatPanel.setLoading(true)
    emitter.emit('analyze-start')
    abortController = new AbortController()
    const { signal } = abortController

    try {
      const resolvedHeaders = await resolveHeaders(options.provider)
      const selectedModel = chatPanel.getSelectedModel()
      const selectedPresets = chatPanel.getSelectedPresets()
      const chatMessages = buildChatMessages(context, currentTurns, userMessage)

      const analyzeOptions: AnalyzeOptions = {
        model: selectedModel,
        additionalSystemPrompt: additionalSystemPrompt || undefined,
        apiKey: storedApiKey,
        headers: resolvedHeaders,
        chatMessages,
      }

      let rawResponse = ''
      let result: NormalizedAnalysisResult

      if (options.provider.analyzeStream) {
        // ── Streaming path ──────────────────────────────────
        chatPanel.startStreaming(userMessage, selectedModel, selectedPresets)

        // eslint-disable-next-line no-await-in-loop
        for await (const chunk of options.provider.analyzeStream(
          context,
          userMessage,
          signal,
          analyzeOptions,
        )) {
          rawResponse += chunk

          const fenceIdx = rawResponse.indexOf('```json')
          let safeEnd: number
          if (fenceIdx !== -1) {
            safeEnd = fenceIdx
          } else {
            safeEnd = rawResponse.length
            if (rawResponse.endsWith('```')) safeEnd -= 3
            else if (rawResponse.endsWith('``')) safeEnd -= 2
            else if (rawResponse.endsWith('`')) safeEnd -= 1
          }
          chatPanel.setStreamText(rawResponse.slice(0, safeEnd).trimEnd())
        }

        const parsed = parseStreamedResponse(rawResponse)
        result = validateResult({
          explanation: parsed.explanation || undefined,
          priceLines: parsed.overlays.priceLines,
          markers: parsed.overlays.markers,
        })
      } else {
        // ── Fallback path (non-streaming) ───────────────────
        const rawResult = await options.provider.analyze(
          context,
          userMessage,
          signal,
          analyzeOptions,
        )
        result = validateResult(rawResult)
      }

      const turn: ChatTurn = {
        userMessage,
        rawResponse,
        result,
        model: selectedModel,
        presets: [...selectedPresets],
      }

      currentTurns = [...currentTurns, turn]

      if (options.provider.analyzeStream) {
        chatPanel.finalizeTurn(turn)
      } else {
        chatPanel.addTurn(turn)
      }

      // Update overlays
      renderer.clear()
      renderer.render(result)
      chatPanel.setActiveTurn(currentTurns.length - 1)

      // Update history
      const entry: HistoryEntry = {
        turns: currentTurns,
        range: currentRange!,
      }
      if (currentTurns.length === 1) {
        historyStore.push(entry)
      } else {
        historyStore.updateLatest(entry)
      }
      historyButton.setCount(historyStore.size())
      currentHistoryIndex = historyStore.size() - 1
      chatPanel.updateNav(currentHistoryIndex, historyStore.size())

      emitter.emit('analyze-complete', result)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = err instanceof Error ? err.message : String(err)
        const isAuthError = /\b(401|403)\b/.test(message)

        if (isAuthError && options.provider.requiresApiKey) {
          chatPanel.openSettings('Invalid API key. Please check your key in Settings.')
        } else {
          chatPanel.showError(message)
        }
        emitter.emit('error', err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      abortController = null
      chatPanel.setLoading(false)
    }
  }

  function showHistoryEntry(index: number): void {
    const entry = historyStore.get(index)
    if (!entry) return

    currentHistoryIndex = index
    currentTurns = [...entry.turns]
    currentRange = entry.range

    chatPanel.show({
      position: getSmartPosition(entry.range),
      currentIndex: index,
      totalCount: historyStore.size(),
    })

    for (const turn of entry.turns) {
      chatPanel.addTurn(turn)
    }

    const lastTurn = entry.turns[entry.turns.length - 1]
    if (lastTurn) {
      renderer.clear()
      renderer.render(lastTurn.result)
      chatPanel.setActiveTurn(entry.turns.length - 1)
    }

    rangeSelector.setRange(entry.range as { from: never; to: never })
  }

  // ── Event wiring: Selection ────────────────────────────────────────────────

  rangeSelector.onSelect = (range) => {
    cancelInFlight()
    // Reset multi-turn state for new selection
    currentTurns = []
    currentRange = range

    // show() internally tears down any existing panel without triggering onClose
    const position = getSmartPosition(range)
    chatPanel.show({
      position,
      currentIndex: historyStore.size(),
      totalCount: historyStore.size() + 1, // +1 for the current new chat
    })
    chatPanel.focusInput()
  }

  rangeSelector.onDismiss = () => {
    cancelInFlight()
    chatPanel.hide()
  }

  // ── Event wiring: ChatPanel ────────────────────────────────────────────────

  chatPanel.onSubmit = async (userMessage: string) => {
    if (!currentRange) return
    const seriesData = series.data() as never[]
    const context = buildChartContext(seriesData, currentRange as never, options.dataAccessor)
    const selectedPresets = chatPanel.getSelectedPresets()
    const { additionalSystemPrompt } = promptBuilder.build({
      userPrompt: userMessage,
      selectedPresets,
      isQuickRun: false,
    })
    await runAnalysis(context, userMessage, additionalSystemPrompt || undefined)
  }

  chatPanel.onTurnClick = (index: number) => {
    const turn = currentTurns[index]
    if (!turn) return
    renderer.clear()
    renderer.render(turn.result)
    chatPanel.setActiveTurn(index)
  }

  chatPanel.onClose = () => {
    renderer.clear()
    rangeSelector.clearSelection()
    currentTurns = []
    currentRange = null
  }

  chatPanel.onAbort = () => {
    cancelInFlight()
  }

  chatPanel.onNavigate = (direction: -1 | 1) => {
    const targetIndex = currentHistoryIndex + direction
    if (targetIndex >= 0 && targetIndex < historyStore.size()) {
      showHistoryEntry(targetIndex)
    }
  }

  historyButton.onClick = () => {
    if (chatPanel.isVisible()) return
    const latestIndex = historyStore.size() - 1
    if (latestIndex >= 0) {
      showHistoryEntry(latestIndex)
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    destroy() {
      resizeObserver.disconnect()
      cancelInFlight()
      rangeSelector.destroy()
      chatPanel.destroy()
      historyButton.destroy()
      historyStore.clear()
      renderer.clear()
      emitter.removeAll()
    },

    clearOverlays() {
      renderer.clear()
      chatPanel.hide()
    },

    setSelectionEnabled(enabled: boolean) {
      rangeSelector.setEnabled(enabled)
      emitter.emit('selection-mode-change', enabled)
    },

    setTheme(newTheme: 'light' | 'dark') {
      if (theme === newTheme) return
      theme = newTheme
      applyThemeVars(chartEl, newTheme)
    },

    on<K extends keyof AgentOverlayEventMap>(
      event: K,
      handler: AgentOverlayEventMap[K],
    ): () => void {
      return emitter.on(event, handler)
    },
  }
}
