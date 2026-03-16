// src/core/selection/selection-primitive.ts
import type { TimeValue } from '../types'

interface TimeRange {
  readonly from: TimeValue
  readonly to: TimeValue
}

interface AttachedParams {
  chart: {
    timeScale: () => {
      timeToCoordinate: (time: TimeValue) => number | null
    }
  }
  requestUpdate: () => void
}

interface PaneRenderer {
  draw(target: {
    context: CanvasRenderingContext2D
    mediaSize: { width: number; height: number }
  }): void
}

interface PaneView {
  renderer: PaneRenderer
}

const HIGHLIGHT_COLOR = 'rgba(33, 150, 243, 0.15)'

export class SelectionPrimitive {
  private range: TimeRange | null = null
  private params: AttachedParams | null = null
  private cachedViews: PaneView[] = []
  private x1: number | null = null
  private x2: number | null = null

  getRange(): TimeRange | null {
    return this.range
  }

  setRange(range: TimeRange): void {
    this.range = range
    this.params?.requestUpdate()
  }

  clearRange(): void {
    this.range = null
    this.cachedViews = []
    this.x1 = null
    this.x2 = null
    this.params?.requestUpdate()
  }

  attached(params: AttachedParams): void {
    this.params = params
  }

  detached(): void {
    this.params = null
  }

  updateAllViews(): void {
    if (!this.range || !this.params) {
      this.cachedViews = []
      return
    }
    const timeScale = this.params.chart.timeScale()
    const fromX = timeScale.timeToCoordinate(this.range.from)
    const toX = timeScale.timeToCoordinate(this.range.to)
    if (fromX === null || toX === null) {
      this.cachedViews = []
      return
    }
    this.x1 = Math.min(fromX, toX)
    this.x2 = Math.max(fromX, toX)
    const x1 = this.x1
    const x2 = this.x2
    this.cachedViews = [
      {
        renderer: {
          draw(target) {
            const ctx = target.context
            const height = target.mediaSize.height
            ctx.fillStyle = HIGHLIGHT_COLOR
            ctx.fillRect(x1, 0, x2 - x1, height)
          },
        },
      },
    ]
  }

  paneViews(): readonly PaneView[] {
    return this.cachedViews
  }
}
