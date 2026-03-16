// src/core/overlay/overlay-renderer.ts
import { createSeriesMarkers, LineStyle } from 'lightweight-charts'
import type { AnalysisResult, PriceLineAction, MarkerAction } from '../types'

interface SeriesLike {
  createPriceLine(options: Record<string, unknown>): unknown
  removePriceLine(line: unknown): void
}

const LINE_STYLE_MAP: Record<string, number> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.Dotted,
}

function mapPriceLineOptions(action: PriceLineAction): Record<string, unknown> {
  return {
    price: action.price,
    ...(action.color != null && { color: action.color }),
    ...(action.lineWidth != null && { lineWidth: action.lineWidth }),
    ...(action.lineStyle != null && {
      lineStyle: LINE_STYLE_MAP[action.lineStyle] ?? LineStyle.Solid,
    }),
    ...(action.title != null && { title: action.title }),
    axisLabelVisible: true,
  }
}

export class OverlayRenderer {
  private readonly series: SeriesLike
  private priceLineRefs: readonly unknown[] = []
  private markersPlugin: { setMarkers: (m: unknown[]) => void; detach: () => void } | null = null

  constructor(series: SeriesLike) {
    this.series = series
  }

  render(result: AnalysisResult): void {
    if (result.priceLines && result.priceLines.length > 0) {
      const newRefs = result.priceLines.map((line) =>
        this.series.createPriceLine(mapPriceLineOptions(line)),
      )
      this.priceLineRefs = [...this.priceLineRefs, ...newRefs]
    }
    if (result.markers && result.markers.length > 0) {
      const markerData = result.markers.map((m: MarkerAction) => ({
        time: m.time,
        position: m.position,
        shape: m.shape,
        ...(m.color != null && { color: m.color }),
        ...(m.text != null && { text: m.text }),
      }))
      if (!this.markersPlugin) {
        this.markersPlugin = createSeriesMarkers(this.series as never, []) as never
      }
      this.markersPlugin.setMarkers(markerData)
    }
  }

  clear(): void {
    for (const ref of this.priceLineRefs) {
      this.series.removePriceLine(ref)
    }
    this.priceLineRefs = []
    if (this.markersPlugin) {
      this.markersPlugin.detach()
      this.markersPlugin = null
    }
  }
}
