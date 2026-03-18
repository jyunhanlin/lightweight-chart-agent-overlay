// src/core/types.ts

// --- Time ---

/** Matches Lightweight Charts HorzScaleItem — supports both formats */
export type TimeValue = number | string

// --- Data ---

export interface OHLCData {
  readonly time: TimeValue
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume?: number
}

// --- LLM Context & Result ---

export interface ChartContext {
  readonly timeRange: { readonly from: TimeValue; readonly to: TimeValue }
  readonly data: readonly OHLCData[]
}

export interface PriceLineAction {
  readonly price: number
  readonly color?: string
  readonly lineWidth?: number
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted'
  readonly title?: string
}

export interface MarkerAction {
  readonly time: TimeValue
  readonly position: 'aboveBar' | 'belowBar'
  readonly shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown'
  readonly color?: string
  readonly text?: string
}

export interface AnalysisResult {
  readonly explanation?: string
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}

// --- Provider ---

export interface LLMProvider {
  analyze(context: ChartContext, prompt: string, signal?: AbortSignal): Promise<AnalysisResult>
}

// --- Data Accessor ---

export type DataAccessor = (timeRange: { from: TimeValue; to: TimeValue }) => OHLCData[]

// --- Options ---

export interface AgentOverlayUIOptions {
  readonly theme?: 'light' | 'dark'
}

export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly dataAccessor?: DataAccessor
  readonly ui?: AgentOverlayUIOptions
}

// --- Event Map ---

export interface AgentOverlayEventMap {
  'analyze-start': () => void
  'analyze-complete': (result: AnalysisResult) => void
  'selection-mode-change': (enabled: boolean) => void
  error: (error: Error) => void
}

// --- Return Value ---

export interface AgentOverlay {
  destroy(): void
  clearOverlays(): void
  setSelectionEnabled(enabled: boolean): void
  on<K extends keyof AgentOverlayEventMap>(event: K, handler: AgentOverlayEventMap[K]): () => void
}
