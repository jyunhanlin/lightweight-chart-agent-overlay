import { createChart, CandlestickSeries } from 'lightweight-charts'
import { createAgentOverlay } from '../../src/index'
import { createAnthropicProvider } from '../../src/providers/anthropic'
import type { LLMProvider, ChartContext, AnalysisResult } from '../../src/core/types'

const container = document.getElementById('chart')!

const chart = createChart(container, {
  layout: {
    background: { color: '#131722' },
    textColor: '#d1d4dc',
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
})

const series = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
})

// Fetch real BTC daily data from Binance
async function fetchBTCData() {
  try {
    const response = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=200',
    )
    const klines = await response.json()
    return klines.map((k: (string | number)[]) => ({
      time: Math.floor((k[0] as number) / 1000),
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
    }))
  } catch (err) {
    console.warn('Failed to fetch BTC data, using generated data:', err)
    return generateFallbackData()
  }
}

function generateFallbackData() {
  const data = []
  let time = new Date('2024-01-01').getTime() / 1000
  let close = 100
  for (let i = 0; i < 200; i++) {
    const open = close + (Math.random() - 0.5) * 5
    const high = Math.max(open, close) + Math.random() * 3
    const low = Math.min(open, close) - Math.random() * 3
    close = open + (Math.random() - 0.5) * 8
    data.push({ time: time + i * 86400, open, high, low, close })
  }
  return data
}

// Mock provider: simulates 1.5s delay, returns support/resistance based on actual data
const mockProvider: LLMProvider = {
  async analyze(context: ChartContext, _prompt: string, signal?: AbortSignal) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1500)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        const err = new Error('Aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })

    const prices = context.data.map((d) => d.close)
    const low = Math.min(...prices)
    const high = Math.max(...prices)

    return {
      explanation: {
        sections: [
          { label: 'Technical', content: `Analyzed ${context.data.length} candles. Support found at ${low.toFixed(2)} (range low). Resistance at ${high.toFixed(2)} (range high).` },
          { label: 'Sentiment', content: 'The price action shows consolidation between these levels with neutral sentiment.' },
        ],
      },
      priceLines: [
        { price: low, title: 'Support', color: '#26a69a', lineStyle: 'dashed' as const },
        { price: high, title: 'Resistance', color: '#ef5350', lineStyle: 'dashed' as const },
      ],
      markers: [
        {
          time: context.data[0].time,
          position: 'belowBar' as const,
          shape: 'arrowUp' as const,
          color: '#26a69a',
          text: 'Range Start',
        },
        {
          time: context.data[context.data.length - 1].time,
          position: 'aboveBar' as const,
          shape: 'arrowDown' as const,
          color: '#ef5350',
          text: 'Range End',
        },
      ],
    } satisfies AnalysisResult
  },
}

// Use real provider if API key is set, otherwise mock
const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
const provider = apiKey
  ? createAnthropicProvider({
      apiKey,
      models: [
        { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
        { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      ],
    })
  : mockProvider

if (!apiKey) {
  console.log('Using mock provider (set VITE_ANTHROPIC_API_KEY for real AI)')
}

// Load data then init
fetchBTCData().then((data) => {
  series.setData(data as never[])
  chart.timeScale().fitContent()

  const agent = createAgentOverlay(chart as never, series as never, {
    provider,
    presets: [
      {
        label: 'Technical',
        systemPrompt: 'Focus on technical analysis: support/resistance, patterns, indicators. Always include explanation with your analysis. Include priceLines and markers.',
        defaultPrompt: 'Analyze the technical aspects of this range',
      },
      {
        label: 'Fundamental',
        systemPrompt: 'Focus on macroeconomic context, news events, and fundamental factors. Always include explanation with your analysis. No priceLines or markers needed.',
        defaultPrompt: 'Analyze relevant macro events and fundamentals',
      },
      {
        label: 'Smart Money',
        systemPrompt: 'Analyze volume patterns, unusual activity, and institutional behavior. Always include explanation with your analysis. Include markers for anomalies.',
        defaultPrompt: 'Analyze smart money signals in this range',
      },
      {
        label: 'Sentiment',
        systemPrompt: 'Assess market sentiment from price action patterns. Always include explanation with your analysis. No priceLines or markers needed.',
        defaultPrompt: 'What is the market sentiment in this range?',
      },
    ],
    defaultPresetIndices: [0],
  })

  agent.on('analyze-start', () => console.log('Analysis started...'))
  agent.on('analyze-complete', (result) => console.log('Analysis complete:', result))
  agent.on('error', (err) => console.error('Analysis error:', err))

  // Update UI badge when selection mode changes
  const badge = document.getElementById('mode-badge')!
  agent.on('selection-mode-change', (enabled) => {
    badge.textContent = `Selection: ${enabled ? 'ON' : 'OFF'}`
    badge.className = `mode-badge ${enabled ? 'on' : 'off'}`
  })

  // Toggle selection mode with 'S' key (skip when typing in inputs)
  let selectionEnabled = false
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return
    if (e.key === 's' || e.key === 'S') {
      selectionEnabled = !selectionEnabled
      agent.setSelectionEnabled(selectionEnabled)
    }
  })
})
