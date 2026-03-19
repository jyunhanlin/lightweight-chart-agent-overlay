import { createChart, CandlestickSeries } from 'lightweight-charts'
import { createAgentOverlay } from '../../src/index'
import { createAnthropicProvider } from '../../src/providers/anthropic'

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

const provider = createAnthropicProvider({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  availableModels: [
    { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  ],
})

// Load data then init
fetchBTCData().then((data) => {
  series.setData(data as never[])
  chart.timeScale().fitContent()

  const agent = createAgentOverlay(chart as never, series as never, {
    provider,
  })

  // Expose for console testing
  ;(window as never as Record<string, unknown>).agent = agent

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
