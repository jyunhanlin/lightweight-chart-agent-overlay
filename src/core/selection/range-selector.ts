// src/core/selection/range-selector.ts
import type { TimeValue } from '../types'
import { SelectionPrimitive } from './selection-primitive'

const MIN_DRAG_PX = 5

interface ChartLike {
  timeScale(): { coordinateToTime(x: number): TimeValue | null }
  chartElement(): HTMLElement
  applyOptions(options: Record<string, unknown>): void
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
  private startTime: TimeValue | null = null
  private isDragging = false
  private _enabled = false

  onSelect: ((range: { from: TimeValue; to: TimeValue }) => void) | null = null
  onDismiss: (() => void) | null = null

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
      if (!this._enabled) {
        if (this.primitive.getRange()) {
          this.primitive.clearRange()
          this.onDismiss?.()
        }
        return
      }
      const x = e.clientX - this.el.getBoundingClientRect().left
      const time = this.chart.timeScale().coordinateToTime(x)
      if (time === null) return
      this.startX = x
      this.startTime = time
      this.isDragging = false
      this.primitive.clearRange()
    }

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.startX === null || this.startTime === null) return
      const currentX = e.clientX - this.el.getBoundingClientRect().left
      if (!this.isDragging && Math.abs(currentX - this.startX) >= MIN_DRAG_PX) {
        this.isDragging = true
      }
      if (!this.isDragging) return
      const toTime = this.chart.timeScale().coordinateToTime(currentX)
      if (toTime !== null) {
        this.primitive.setRange({ from: this.startTime, to: toTime })
      }
    }

    this.handleMouseUp = (e: MouseEvent) => {
      if (this.startX === null || this.startTime === null) return
      if (this.isDragging) {
        const endX = e.clientX - this.el.getBoundingClientRect().left
        const toTime = this.chart.timeScale().coordinateToTime(endX)
        if (toTime !== null) {
          this.onSelect?.({ from: this.startTime, to: toTime })
        }
      }
      this.startX = null
      this.startTime = null
      this.isDragging = false
    }

    this.el.addEventListener('mousedown', this.handleMouseDown)
    this.el.addEventListener('mousemove', this.handleMouseMove)
    this.el.addEventListener('mouseup', this.handleMouseUp)
  }

  get enabled(): boolean {
    return this._enabled
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled
    this.chart.applyOptions({
      handleScroll: !enabled,
      handleScale: !enabled,
    })
    if (!enabled) {
      this.startX = null
      this.startTime = null
      this.isDragging = false
    }
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
