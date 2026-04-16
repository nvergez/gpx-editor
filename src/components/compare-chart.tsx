import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '~/components/ui/chart'
import type { ComparisonActivityPoint } from '../../convex/comparisons'
import * as m from '~/paraglide/messages.js'

export type Aggregation = 'median' | 'mean' | 'min' | 'max'

export function getAggregationLabel(aggregation: Aggregation): string {
  switch (aggregation) {
    case 'median':
      return m.compare_aggregation_median()
    case 'mean':
      return m.compare_aggregation_mean()
    case 'min':
      return m.compare_aggregation_min()
    case 'max':
      return m.compare_aggregation_max()
  }
}

interface CompareChartProps {
  points: ComparisonActivityPoint[]
  aggregation: Aggregation
  showBand: boolean
  columnName: string
}

interface ChartDatum {
  label: string
  fullLabel: string
  aggregate: number
  band: [number, number]
  min: number
  max: number
  lapCount: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function aggregate(values: number[], kind: Aggregation): number {
  if (values.length === 0) return 0
  switch (kind) {
    case 'median':
      return median(values)
    case 'mean':
      return mean(values)
    case 'min':
      return Math.min(...values)
    case 'max':
      return Math.max(...values)
  }
}

function formatShortDate(iso?: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const chartConfig = {
  aggregate: {
    label: 'Aggregate',
    color: 'var(--chart-1)',
  },
  band: {
    label: 'Min–Max',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

function formatNumber(value: number): string {
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function CompareChart({ points, aggregation, showBand, columnName }: CompareChartProps) {
  const data: ChartDatum[] = useMemo(() => {
    return points.map((p) => {
      const min = Math.min(...p.values)
      const max = Math.max(...p.values)
      const agg = aggregate(p.values, aggregation)
      const short = formatShortDate(p.activity.activityDate)
      return {
        label: short ?? p.activity.name,
        fullLabel: p.activity.name,
        aggregate: agg,
        band: [min, max],
        min,
        max,
        lapCount: p.values.length,
      }
    })
  }, [points, aggregation])

  if (data.length < 2) {
    return null
  }

  const aggregationLabel = getAggregationLabel(aggregation)

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg tracking-tight">{columnName}</h2>
          <p className="text-xs text-muted-foreground">
            {aggregationLabel} · {points.length} {m.compare_activities_count()}
          </p>
        </div>
      </div>

      <ChartContainer config={chartConfig} className="aspect-auto h-[320px] w-full">
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => formatNumber(v)}
          />
          <ChartTooltip
            cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
            content={<CustomTooltip aggregationLabel={aggregationLabel} />}
          />
          {showBand && (
            <Area
              type="monotone"
              dataKey="band"
              stroke="none"
              fill="var(--color-band)"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
          )}
          <Line
            type="monotone"
            dataKey="aggregate"
            stroke="var(--color-aggregate)"
            strokeWidth={2.5}
            dot={{
              fill: 'var(--color-aggregate)',
              r: 4,
              strokeWidth: 0,
            }}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function CustomTooltip({
  active,
  payload,
  aggregationLabel,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
  aggregationLabel: string
}) {
  if (!active || !payload?.[0]) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{datum.fullLabel}</p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        <p>
          <span className="text-foreground tabular-nums">{formatNumber(datum.aggregate)}</span>{' '}
          {aggregationLabel}
        </p>
        <p>
          <span className="text-foreground tabular-nums">
            {formatNumber(datum.min)} – {formatNumber(datum.max)}
          </span>{' '}
          {m.compare_tooltip_range()}
        </p>
        <p>
          <span className="text-foreground tabular-nums">{datum.lapCount}</span>{' '}
          {datum.lapCount === 1 ? m.compare_tooltip_lap() : m.compare_tooltip_laps()}
        </p>
      </div>
    </div>
  )
}
