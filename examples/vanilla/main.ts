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

series.setData(data as never[])
chart.timeScale().fitContent()

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
if (!apiKey) {
  console.warn('Set VITE_ANTHROPIC_API_KEY in .env.local to enable AI analysis')
}

const provider = createAnthropicProvider({
  apiKey: apiKey ?? '',
})

const agent = createAgentOverlay(chart as never, series as never, {
  provider,
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

// Toggle selection mode with 'S' key
let selectionEnabled = false
document.addEventListener('keydown', (e) => {
  if (e.key === 's' || e.key === 'S') {
    selectionEnabled = !selectionEnabled
    agent.setSelectionEnabled(selectionEnabled)
  }
})
