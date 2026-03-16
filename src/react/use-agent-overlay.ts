import { useEffect, useRef, useState, useCallback } from 'react'
import { createAgentOverlay } from '../core/agent-overlay'
import type { AgentOverlay, AgentOverlayOptions, AnalysisResult } from '../core/types'

interface ChartLike {
  timeScale(): unknown
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
  data(): readonly Record<string, unknown>[]
}

interface UseAgentOverlayReturn {
  clearOverlays: () => void
  isAnalyzing: boolean
  error: Error | null
  lastResult: AnalysisResult | null
}

export function useAgentOverlay(
  chart: ChartLike | null,
  series: SeriesLike | null,
  options: AgentOverlayOptions,
): UseAgentOverlayReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null)
  const agentRef = useRef<AgentOverlay | null>(null)

  useEffect(() => {
    if (!chart || !series) return
    const agent = createAgentOverlay(chart as never, series as never, options)
    agentRef.current = agent
    const unsubStart = agent.on('analyze-start', () => {
      setIsAnalyzing(true)
      setError(null)
    })
    const unsubComplete = agent.on('analyze-complete', (result) => {
      setIsAnalyzing(false)
      setLastResult(result)
    })
    const unsubError = agent.on('error', (err) => {
      setIsAnalyzing(false)
      setError(err)
    })
    return () => {
      unsubStart()
      unsubComplete()
      unsubError()
      agent.destroy()
      agentRef.current = null
    }
  }, [chart, series, options.provider])

  const clearOverlays = useCallback(() => {
    agentRef.current?.clearOverlays()
    setLastResult(null)
  }, [])

  return { clearOverlays, isAnalyzing, error, lastResult }
}
