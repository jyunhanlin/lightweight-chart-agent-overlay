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

// --- Explanation (structured) ---

export interface ExplanationSection {
  readonly label: string
  readonly content: string
}

export interface NormalizedExplanation {
  readonly sections: readonly ExplanationSection[]
}

export interface NormalizedAnalysisResult {
  readonly explanation?: NormalizedExplanation
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}

export interface AnalysisResult {
  readonly explanation?: string | { sections: readonly ExplanationSection[] }
  readonly priceLines?: readonly PriceLineAction[]
  readonly markers?: readonly MarkerAction[]
}

// --- Model ---

export interface ModelOption {
  readonly id: string
  readonly label: string
}

// --- Analyze Options ---

export interface AnalyzeOptions {
  readonly model?: string
  readonly additionalSystemPrompt?: string
}

// --- Provider ---

export interface LLMProvider {
  readonly models?: readonly ModelOption[]
  analyze(
    context: ChartContext,
    prompt: string,
    signal?: AbortSignal,
    options?: AnalyzeOptions,
  ): Promise<AnalysisResult>
}

// --- Data Accessor ---

export type DataAccessor = (timeRange: { from: TimeValue; to: TimeValue }) => OHLCData[]

// --- Options ---

export interface AgentOverlayUIOptions {
  readonly theme?: 'light' | 'dark'
}

// --- Presets ---

export interface AnalysisPreset {
  readonly label: string
  readonly systemPrompt: string
  readonly defaultPrompt: string
}

// --- Prompt Builder ---

export interface PromptBuildParams {
  readonly userPrompt: string
  readonly selectedPresets: readonly AnalysisPreset[]
  readonly isQuickRun: boolean
}

export interface PromptBuildResult {
  readonly prompt: string
  readonly additionalSystemPrompt: string
}

export interface PromptBuilder {
  build(params: PromptBuildParams): PromptBuildResult
}

// --- History ---

export interface HistoryEntry {
  readonly prompt: string
  readonly isQuickRun: boolean
  readonly model?: string
  readonly presets: readonly AnalysisPreset[]
  readonly result: NormalizedAnalysisResult
  readonly range: { readonly from: TimeValue; readonly to: TimeValue }
}

export interface AgentOverlayOptions {
  readonly provider: LLMProvider
  readonly dataAccessor?: DataAccessor
  readonly presets?: readonly AnalysisPreset[]
  readonly promptBuilder?: PromptBuilder
  readonly ui?: AgentOverlayUIOptions
}

// --- Event Map ---

export interface AgentOverlayEventMap {
  'analyze-start': () => void
  'analyze-complete': (result: NormalizedAnalysisResult) => void
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
