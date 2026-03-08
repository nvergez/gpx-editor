import { useMemo, useCallback, useRef, useState, useEffect } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  CartesianGrid,
} from 'recharts'
import type { MouseHandlerDataParam } from 'recharts'
import type { LapHandle } from '~/utils/dom-model'
import { getTrackPointsFromElement } from '~/utils/dom-operations'
import { haversineDistance } from '~/utils/gpx-parser'
import { getLapColor } from '~/utils/lap-colors'
import { useDarkMode } from '~/hooks/use-dark-mode'

interface ElevationChartInnerProps {
  laps: LapHandle[]
  sourceFormat: 'gpx' | 'tcx'
  revision: number
  hoveredLapId: string | null
  onHoverLap: (lapId: string | null) => void
}

interface ChartPoint {
  distance: number // km cumulative
  elevation: number | null
  hr: number | null
  pace: number | null // min/km
  lapIndex: number
  lapId: string
}

type SeriesKey = 'elevation' | 'hr' | 'pace'

const SERIES_CONFIG: Record<SeriesKey, { label: string; unit: string; color: string }> = {
  elevation: { label: 'Elevation', unit: 'm', color: 'var(--chart-2)' },
  hr: { label: 'Heart Rate', unit: 'bpm', color: 'var(--chart-1)' },
  pace: { label: 'Pace', unit: 'min/km', color: 'var(--chart-4)' },
}

const MAX_CHART_POINTS = 800
const MAX_PACE_MIN_PER_KM = 30

function buildChartData(
  laps: LapHandle[],
  sourceFormat: 'gpx' | 'tcx',
): { points: ChartPoint[]; hasElevation: boolean; hasHr: boolean; hasPace: boolean } {
  const points: ChartPoint[] = []
  let cumulativeDistance = 0
  let hasElevation = false
  let hasHr = false
  let hasPace = false

  for (let li = 0; li < laps.length; li++) {
    const lap = laps[li]
    const trackPoints = getTrackPointsFromElement(lap.element, sourceFormat)
    if (trackPoints.length === 0) continue

    for (let i = 0; i < trackPoints.length; i++) {
      const tp = trackPoints[i]
      let segmentDistance = 0
      if (i > 0) {
        segmentDistance = haversineDistance(trackPoints[i - 1], tp)
        cumulativeDistance += segmentDistance
      }

      const ele = tp.ele ?? null
      const hr = tp.hr ?? null
      if (ele !== null) hasElevation = true
      if (hr !== null) hasHr = true

      // Compute pace from speed or from point-to-point time/distance
      let pace: number | null = null
      if (tp.speed != null && tp.speed > 0) {
        pace = 1000 / 60 / tp.speed // min/km from m/s
        hasPace = true
      } else if (i > 0 && tp.time && trackPoints[i - 1].time) {
        const dt =
          (new Date(tp.time).getTime() - new Date(trackPoints[i - 1].time!).getTime()) / 1000
        if (segmentDistance > 0.5 && dt > 0) {
          pace = (dt / segmentDistance) * (1000 / 60) // min/km
          if (pace > MAX_PACE_MIN_PER_KM) pace = null
          else hasPace = true
        }
      }

      points.push({
        distance: cumulativeDistance / 1000,
        elevation: ele,
        hr,
        pace,
        lapIndex: li,
        lapId: lap.id,
      })
    }
  }

  return { points, hasElevation, hasHr, hasPace }
}

// Downsample points via uniform sampling for smooth chart rendering
function downsample(points: ChartPoint[], maxPoints: number): ChartPoint[] {
  if (points.length <= maxPoints) return points
  const step = points.length / maxPoints
  const result: ChartPoint[] = []
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.round(i * step)])
  }
  // Always include the last point
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1])
  }
  return result
}

function formatPace(value: number): string {
  const mins = Math.floor(value)
  const secs = Math.round((value - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function ElevationChartInner({
  laps,
  sourceFormat,
  revision,
  hoveredLapId,
  onHoverLap,
}: ElevationChartInnerProps) {
  const isDark = useDarkMode()

  // Track which series the user has explicitly hidden (default: show all available)
  const [hiddenSeries, setHiddenSeries] = useState<Set<SeriesKey>>(new Set())

  const { points, hasElevation, hasHr, hasPace } = useMemo(() => {
    // revision is a cache-bust signal; laps are mutated in place
    void revision
    return buildChartData(laps, sourceFormat)
  }, [laps, sourceFormat, revision])

  const chartData = useMemo(() => downsample(points, MAX_CHART_POINTS), [points])

  const availableSeries = useMemo(
    () =>
      [hasElevation ? 'elevation' : null, hasHr ? 'hr' : null, hasPace ? 'pace' : null].filter(
        (s): s is SeriesKey => s !== null,
      ),
    [hasElevation, hasHr, hasPace],
  )

  const activeSeries = useMemo(() => {
    const active = new Set(availableSeries.filter((s) => !hiddenSeries.has(s)))
    // Ensure at least one series is always visible
    if (active.size === 0 && availableSeries.length > 0) {
      active.add(availableSeries[0])
    }
    return active
  }, [availableSeries, hiddenSeries])

  // Compute lap boundary distances for ReferenceAreas
  const lapBoundaries = useMemo(() => {
    const boundaries: { lapId: string; lapIndex: number; start: number; end: number }[] = []
    let currentLapId = chartData[0]?.lapId
    let startDist = chartData[0]?.distance ?? 0

    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].lapId !== currentLapId) {
        boundaries.push({
          lapId: currentLapId!,
          lapIndex: chartData[i - 1].lapIndex,
          start: startDist,
          end: chartData[i - 1].distance,
        })
        currentLapId = chartData[i].lapId
        startDist = chartData[i].distance
      }
    }
    if (chartData.length > 0) {
      boundaries.push({
        lapId: currentLapId!,
        lapIndex: chartData[chartData.length - 1].lapIndex,
        start: startDist,
        end: chartData[chartData.length - 1].distance,
      })
    }
    return boundaries
  }, [chartData])

  // Use a ref so the callback doesn't recreate on every hover change
  const hoveredLapIdRef = useRef(hoveredLapId)
  useEffect(() => {
    hoveredLapIdRef.current = hoveredLapId
  }, [hoveredLapId])

  const handleMouseMove = useCallback(
    (state: MouseHandlerDataParam) => {
      const idx = state?.activeTooltipIndex
      if (typeof idx === 'number' && idx >= 0 && idx < chartData.length) {
        const lapId = chartData[idx].lapId
        if (lapId !== hoveredLapIdRef.current) onHoverLap(lapId)
      }
    },
    [chartData, onHoverLap],
  )

  const handleMouseLeave = useCallback(() => {
    onHoverLap(null)
  }, [onHoverLap])

  const toggleSeries = useCallback(
    (key: SeriesKey) => {
      setHiddenSeries((prev) => {
        const next = new Set(prev)
        if (next.has(key)) {
          next.delete(key)
        } else {
          // Don't allow hiding all series
          const wouldBeActive = availableSeries.filter((s) => s !== key && !next.has(s))
          if (wouldBeActive.length > 0) next.add(key)
        }
        return next
      })
    },
    [availableSeries],
  )

  if (chartData.length === 0 || availableSeries.length === 0) return null

  const showElevation = activeSeries.has('elevation')
  const showHr = activeSeries.has('hr')
  const showPace = activeSeries.has('pace')

  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-4">
      {/* Series toggles */}
      {availableSeries.length > 1 && (
        <div className="mb-3 flex items-center gap-1.5">
          {availableSeries.map((key) => {
            const active = activeSeries.has(key)
            const cfg = SERIES_CONFIG[key]
            return (
              <button
                key={key}
                onClick={() => toggleSeries(key)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{
                    backgroundColor: cfg.color,
                    opacity: active ? 1 : 0.3,
                  }}
                />
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Lap background bands */}
          {laps.length > 1 &&
            lapBoundaries.map((b) => (
              <ReferenceArea
                key={b.lapId}
                x1={b.start}
                x2={b.end}
                fill={getLapColor(b.lapIndex, isDark)}
                fillOpacity={hoveredLapId === b.lapId ? 0.12 : 0.04}
                strokeOpacity={0}
              />
            ))}

          <XAxis
            dataKey="distance"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={{ fontSize: 11, fill: textColor }}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
            axisLine={false}
            tickLine={false}
            label={{
              value: 'km',
              position: 'insideBottomRight',
              offset: -4,
              style: { fontSize: 10, fill: textColor },
            }}
          />

          {showElevation && (
            <YAxis
              yAxisId="elevation"
              orientation="left"
              tick={{ fontSize: 11, fill: textColor }}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              axisLine={false}
              tickLine={false}
              width={40}
              domain={['auto', 'auto']}
              label={{
                value: 'm',
                position: 'insideTopLeft',
                offset: 0,
                style: { fontSize: 10, fill: textColor },
              }}
            />
          )}

          {showHr && (
            <YAxis
              yAxisId="hr"
              orientation={showElevation ? 'right' : 'left'}
              tick={{ fontSize: 11, fill: textColor }}
              axisLine={false}
              tickLine={false}
              width={35}
              domain={['auto', 'auto']}
              label={{
                value: 'bpm',
                position: showElevation ? 'insideTopRight' : 'insideTopLeft',
                offset: 0,
                style: { fontSize: 10, fill: textColor },
              }}
            />
          )}

          {showPace && (
            <YAxis
              yAxisId="pace"
              orientation="right"
              tick={{ fontSize: 11, fill: textColor }}
              tickFormatter={(v: number) => formatPace(v)}
              axisLine={false}
              tickLine={false}
              reversed
              width={40}
              domain={['auto', 'auto']}
              label={{
                value: 'min/km',
                position: 'insideTopRight',
                offset: 0,
                style: { fontSize: 10, fill: textColor },
              }}
            />
          )}

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as ChartPoint
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="mb-1 font-medium text-foreground">{d.distance.toFixed(2)} km</div>
                  {d.elevation != null && (
                    <div className="text-muted-foreground">
                      Elevation:{' '}
                      <span className="text-foreground">{Math.round(d.elevation)} m</span>
                    </div>
                  )}
                  {d.hr != null && (
                    <div className="text-muted-foreground">
                      HR: <span className="text-foreground">{d.hr} bpm</span>
                    </div>
                  )}
                  {d.pace != null && (
                    <div className="text-muted-foreground">
                      Pace: <span className="text-foreground">{formatPace(d.pace)} /km</span>
                    </div>
                  )}
                </div>
              )
            }}
          />

          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />

          {showElevation && (
            <Area
              yAxisId="elevation"
              type="monotone"
              dataKey="elevation"
              stroke={SERIES_CONFIG.elevation.color}
              strokeWidth={1.5}
              fill={SERIES_CONFIG.elevation.color}
              fillOpacity={0.15}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}

          {showHr && (
            <Line
              yAxisId="hr"
              type="monotone"
              dataKey="hr"
              stroke={SERIES_CONFIG.hr.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}

          {showPace && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="pace"
              stroke={SERIES_CONFIG.pace.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
