export { createAgentOverlay } from './core/agent-overlay'
export { defaultPromptBuilder } from './core/prompt-builder'
export { DEFAULT_PRESETS } from './core/default-presets'
export { parseStreamedResponse } from './providers/parse-response'
export {
  DEFAULT_PERSONA,
  OVERLAY_CONTRACT,
  DEFAULT_SYSTEM_PROMPT,
} from './providers/default-system-prompt'
export type { ParsedStreamResponse } from './providers/parse-response'
export type { OverlaySettings } from './core/settings-store'
export type {
  AgentOverlay,
  AgentOverlayOptions,
  AgentOverlayEventMap,
  LLMProvider,
  ChartContext,
  AnalysisResult,
  OHLCData,
  TimeValue,
  PriceLineAction,
  MarkerAction,
  DataAccessor,
  ExplanationSection,
  ModelOption,
  AnalyzeOptions,
  ProviderHeaders,
  AnalysisPreset,
  PromptBuildParams,
  PromptBuildResult,
  PromptBuilder,
  HistoryEntry,
  ChatMessage,
  ChatTurn,
} from './core/types'
