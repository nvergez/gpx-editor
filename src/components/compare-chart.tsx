import { useMemo } from 'react'
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '~/components/ui/chart'
import type { ComparisonActivityPoint } from '../../convex/comparisons'
import type { FormulaOperatorSymbol } from '~/utils/custom-columns'
import * as m from '~/paraglide/messages.js'

export type Aggregation =
  | 'median'
  | 'mean'
  | 'min'
  | 'max'
  | 'weighted_distance'
  | 'weighted_duration'
export type ViewMode = 'aggregate' | 'distribution'

export const BASIC_AGGREGATIONS: Aggregation[] = ['median', 'mean', 'min', 'max']
export const WEIGHTED_AGGREGATIONS: Aggregation[] = ['weighted_distance', 'weighted_duration']
export const ALL_AGGREGATIONS: Aggregation[] = [...BASIC_AGGREGATIONS, ...WEIGHTED_AGGREGATIONS]

export function isWeightedAggregation(a: Aggregation): boolean {
  return a === 'weighted_distance' || a === 'weighted_duration'
}

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
    case 'weighted_distance':
      return m.compare_aggregation_weighted_distance()
    case 'weighted_duration':
      return m.compare_aggregation_weighted_duration()
  }
}

export interface OperandDisplay {
  operator: FormulaOperatorSymbol
  leftLabel: string
  rightLabel: string
}

interface CompareChartProps {
  points: ComparisonActivityPoint[]
  aggregation: Aggregation
  showBand: boolean
  columnName: string
  viewMode: ViewMode
  operandDisplay?: OperandDisplay
}

interface ChartDatum {
  label: string
  fullLabel: string
  aggregate: number
  band: [number, number]
  iqr: [number, number]
  min: number
  max: number
  p25: number
  p50: number
  p75: number
  lapCount: number
  leftAgg?: number
  rightAgg?: number
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

interface DistributionStats {
  min: number
  max: number
  p25: number
  p50: number
  p75: number
}

function distributionStats(sorted: number[]): DistributionStats {
  if (sorted.length === 0) return { min: 0, max: 0, p25: 0, p50: 0, p75: 0 }
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p25: quantile(sorted, 25),
    p50: quantile(sorted, 50),
    p75: quantile(sorted, 75),
  }
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)
}

function weightedMean(values: number[], weights: number[]): number {
  let sum = 0
  let totalWeight = 0
  const n = Math.min(values.length, weights.length)
  for (let i = 0; i < n; i++) {
    const w = weights[i]
    if (!Number.isFinite(w) || w <= 0) continue
    sum += values[i] * w
    totalWeight += w
  }
  return totalWeight > 0 ? sum / totalWeight : 0
}

function aggregate(
  point: ComparisonActivityPoint,
  stats: DistributionStats,
  kind: Aggregation,
): number {
  const values = point.values
  if (values.length === 0) return 0
  switch (kind) {
    case 'median':
      return stats.p50
    case 'mean':
      return mean(values)
    case 'min':
      return stats.min
    case 'max':
      return stats.max
    case 'weighted_distance': {
      const w = point.weights?.distance
      return w ? weightedMean(values, w) : mean(values)
    }
    case 'weighted_duration': {
      const w = point.weights?.duration
      return w ? weightedMean(values, w) : mean(values)
    }
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
  iqr: {
    label: 'p25–p75',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 100) return value.toFixed(0)
  if (Math.abs(value) >= 10) return value.toFixed(1)
  return value.toFixed(2)
}

export function CompareChart({
  points,
  aggregation,
  showBand,
  columnName,
  viewMode,
  operandDisplay,
}: CompareChartProps) {
  const data: ChartDatum[] = useMemo(() => {
    return points.map((p) => {
      const sorted = p.values.length > 0 ? [...p.values].sort((a, b) => a - b) : []
      const stats = distributionStats(sorted)
      const agg = aggregate(p, stats, aggregation)
      const short = formatShortDate(p.activity.activityDate)
      const leftAgg = p.operandValues ? meanOfFinite(p.operandValues.left) : undefined
      const rightAgg = p.operandValues ? meanOfFinite(p.operandValues.right) : undefined
      return {
        label: short ?? p.activity.name,
        fullLabel: p.activity.name,
        aggregate: agg,
        band: [stats.min, stats.max],
        iqr: [stats.p25, stats.p75],
        min: stats.min,
        max: stats.max,
        p25: stats.p25,
        p50: stats.p50,
        p75: stats.p75,
        lapCount: p.values.length,
        leftAgg,
        rightAgg,
      }
    })
  }, [points, aggregation])

  if (data.length < 2) {
    return null
  }

  const aggregationLabel = getAggregationLabel(aggregation)
  const isDistribution = viewMode === 'distribution'

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4 sm:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg tracking-tight">{columnName}</h2>
          <p className="text-xs text-muted-foreground">
            {isDistribution ? m.compare_view_distribution() : aggregationLabel} · {points.length}{' '}
            {m.compare_activities_count()}
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
            content={
              <CustomTooltip
                aggregationLabel={aggregationLabel}
                viewMode={viewMode}
                operandDisplay={operandDisplay}
              />
            }
          />
          {isDistribution ? (
            <>
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--color-band)"
                fillOpacity={0.12}
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="iqr"
                stroke="none"
                fill="var(--color-iqr)"
                fillOpacity={0.28}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="p50"
                stroke="var(--color-aggregate)"
                strokeWidth={2.5}
                dot={{
                  fill: 'var(--color-aggregate)',
                  r: 3.5,
                  strokeWidth: 0,
                }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
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
            </>
          )}
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}

function meanOfFinite(values: number[]): number | undefined {
  let sum = 0
  let count = 0
  for (const v of values) {
    if (Number.isFinite(v)) {
      sum += v
      count += 1
    }
  }
  return count > 0 ? sum / count : undefined
}

function CustomTooltip({
  active,
  payload,
  aggregationLabel,
  viewMode,
  operandDisplay,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDatum }>
  aggregationLabel: string
  viewMode: ViewMode
  operandDisplay?: OperandDisplay
}) {
  if (!active || !payload?.[0]) return null
  const datum = payload[0].payload
  const isDistribution = viewMode === 'distribution'
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-foreground">{datum.fullLabel}</p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {isDistribution ? (
          <>
            <p>
              <span className="text-foreground tabular-nums">{formatNumber(datum.p50)}</span>{' '}
              {m.compare_tooltip_median()}
            </p>
            <p>
              <span className="text-foreground tabular-nums">
                {formatNumber(datum.p25)} – {formatNumber(datum.p75)}
              </span>{' '}
              {m.compare_tooltip_iqr()}
            </p>
            <p>
              <span className="text-foreground tabular-nums">
                {formatNumber(datum.min)} – {formatNumber(datum.max)}
              </span>{' '}
              {m.compare_tooltip_range()}
            </p>
          </>
        ) : (
          <>
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
          </>
        )}
        {operandDisplay && datum.leftAgg != null && datum.rightAgg != null && (
          <p className="border-t border-border/60 pt-1 mt-1">
            <span className="text-[10px] uppercase tracking-wide">
              {m.compare_tooltip_formula()}
            </span>
            <br />
            <span className="text-foreground tabular-nums">{formatNumber(datum.leftAgg)}</span>{' '}
            {operandDisplay.leftLabel} {operandDisplay.operator}{' '}
            <span className="text-foreground tabular-nums">{formatNumber(datum.rightAgg)}</span>{' '}
            {operandDisplay.rightLabel}
          </p>
        )}
        <p>
          <span className="text-foreground tabular-nums">{datum.lapCount}</span>{' '}
          {datum.lapCount === 1 ? m.compare_tooltip_lap() : m.compare_tooltip_laps()}
        </p>
      </div>
    </div>
  )
}
