import { renderHook } from '@testing-library/react'
import { useAgentOverlay } from './use-agent-overlay'
import { createAgentOverlay } from '../core/agent-overlay'
import type { LLMProvider } from '../core/types'

vi.mock('../core/agent-overlay', () => ({
  createAgentOverlay: vi.fn(() => ({
    destroy: vi.fn(),
    clearOverlays: vi.fn(),
    on: vi.fn((_event: string, _handler: Function) => {
      return () => {}
    }),
  })),
}))

const mockCreateAgentOverlay = vi.mocked(createAgentOverlay)

const mockProvider: LLMProvider = {
  analyze: vi.fn().mockResolvedValue({}),
}

describe('useAgentOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns expected shape', () => {
    const { result } = renderHook(() => useAgentOverlay(null, null, { provider: mockProvider }))
    expect(result.current.clearOverlays).toBeInstanceOf(Function)
    expect(result.current.isAnalyzing).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.lastResult).toBeNull()
  })

  it('does not create agent when chart is null', () => {
    renderHook(() => useAgentOverlay(null, null, { provider: mockProvider }))
    expect(mockCreateAgentOverlay).not.toHaveBeenCalled()
  })

  it('creates agent when chart and series are provided', () => {
    const mockChart = {} as never
    const mockSeries = {} as never
    renderHook(() => useAgentOverlay(mockChart, mockSeries, { provider: mockProvider }))
    expect(mockCreateAgentOverlay).toHaveBeenCalledOnce()
  })

  it('cleans up on unmount', () => {
    const mockChart = {} as never
    const mockSeries = {} as never
    const { unmount } = renderHook(() =>
      useAgentOverlay(mockChart, mockSeries, { provider: mockProvider }),
    )
    const agent = mockCreateAgentOverlay.mock.results[0]?.value
    unmount()
    expect(agent?.destroy).toHaveBeenCalled()
  })
})
