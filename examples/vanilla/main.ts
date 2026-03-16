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

const provider = createAnthropicProvider({
  apiKey: 'YOUR_API_KEY_HERE',
})

const agent = createAgentOverlay(chart as never, series as never, {
  provider,
})

agent.on('analyze-start', () => console.log('Analysis started...'))
agent.on('analyze-complete', (result) => console.log('Analysis complete:', result))
agent.on('error', (err) => console.error('Analysis error:', err))
