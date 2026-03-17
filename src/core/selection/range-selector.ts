// src/core/selection/range-selector.ts
import type { TimeValue } from '../types'
import { SelectionPrimitive } from './selection-primitive'

const MIN_DRAG_PX = 5

interface ChartLike {
  timeScale(): { coordinateToTime(x: number): TimeValue | null }
  chartElement(): HTMLElement
}

interface SeriesLike {
  attachPrimitive(primitive: unknown): void
  detachPrimitive(primitive: unknown): void
}

export class RangeSelector {
  private readonly primitive: SelectionPrimitive
  private readonly chart: ChartLike
  private readonly series: SeriesLike
  private readonly el: HTMLElement
  private startX: number | null = null
  private isDragging = false

  onSelect: ((range: { from: TimeValue; to: TimeValue }) => void) | null = null

  private readonly handleMouseDown: (e: MouseEvent) => void
  private readonly handleMouseMove: (e: MouseEvent) => void
  private readonly handleMouseUp: (e: MouseEvent) => void

  constructor(chart: ChartLike, series: SeriesLike) {
    this.chart = chart
    this.series = series
    this.el = chart.chartElement()
    this.primitive = new SelectionPrimitive()
    series.attachPrimitive(this.primitive)

    this.handleMouseDown = (e: MouseEvent) => {
      if (!e.shiftKey) return
      this.startX = e.clientX - this.el.getBoundingClientRect().left
      this.isDragging = false
      this.primitive.clearRange()
    }

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.startX === null || !e.shiftKey) return
      const currentX = e.clientX - this.el.getBoundingClientRect().left
      if (!this.isDragging && Math.abs(currentX - this.startX) >= MIN_DRAG_PX) {
        this.isDragging = true
      }
      if (!this.isDragging) return
      const fromTime = this.chart.timeScale().coordinateToTime(this.startX)
      const toTime = this.chart.timeScale().coordinateToTime(currentX)
      if (fromTime !== null && toTime !== null) {
        this.primitive.setRange({ from: fromTime, to: toTime })
      }
    }

    this.handleMouseUp = (e: MouseEvent) => {
      if (this.startX === null) return
      const endX = e.clientX - this.el.getBoundingClientRect().left
      if (this.isDragging) {
        const fromTime = this.chart.timeScale().coordinateToTime(this.startX)
        const toTime = this.chart.timeScale().coordinateToTime(endX)
        if (fromTime !== null && toTime !== null) {
          this.onSelect?.({ from: fromTime, to: toTime })
        }
      }
      this.startX = null
      this.isDragging = false
    }

    this.el.addEventListener('mousedown', this.handleMouseDown)
    this.el.addEventListener('mousemove', this.handleMouseMove)
    this.el.addEventListener('mouseup', this.handleMouseUp)
  }

  getRange(): { from: TimeValue; to: TimeValue } | null {
    return this.primitive.getRange()
  }

  clearSelection(): void {
    this.primitive.clearRange()
  }

  destroy(): void {
    this.el.removeEventListener('mousedown', this.handleMouseDown)
    this.el.removeEventListener('mousemove', this.handleMouseMove)
    this.el.removeEventListener('mouseup', this.handleMouseUp)
    this.series.detachPrimitive(this.primitive)
  }
}
