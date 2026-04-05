import { useMemo, useCallback, useRef, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { MouseHandlerDataParam } from 'recharts'
import type { LapHandle } from '~/utils/dom-model'
import { formatPace, formatAvgSpeed, formatDistance, formatDuration } from '~/utils/gpx-parser'
import * as m from '~/paraglide/messages.js'

interface LapPaceChartProps {
  laps: LapHandle[]
  usePace: boolean
  hoveredLapId: string | null
  onHoverLap: (lapId: string | null) => void
}

interface BarData {
  index: number
  lapId: string
  name: string
  pace: number // seconds per km (real value for tooltip)
  speed: number // m/s (real value for tooltip in speed mode)
  barValue: number // rendering value (higher = faster/higher)
  distance: number
  duration: number
  avgHr?: number
  elevationGain?: number
}

function paceTickFormatter(value: number): string {
  const mins = Math.floor(value / 60)
  const secs = Math.round(value % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function CustomTooltip({
  active,
  payload,
  usePace,
}: {
  active?: boolean
  payload?: Array<{ payload: BarData }>
  usePace: boolean
}) {
  if (!active || !payload?.[0]) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{data.name}</p>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        <p>
          <span className="text-foreground tabular-nums">
            {usePace
              ? formatPace(data.distance, data.duration)
              : formatAvgSpeed(data.distance, data.duration)}
          </span>{' '}
          {usePace ? m.chart_pace() : m.chart_speed()}
        </p>
        <p>
          <span className="text-foreground tabular-nums">{formatDistance(data.distance)}</span>{' '}
          {m.chart_distance()}
        </p>
        <p>
          <span className="text-foreground tabular-nums">{formatDuration(data.duration)}</span>{' '}
          {m.chart_time()}
        </p>
        {data.avgHr != null && (
          <p>
            <span className="text-foreground tabular-nums">{Math.round(data.avgHr)}</span>{' '}
            {m.chart_bpm()}
          </p>
        )}
        {data.elevationGain != null && (
          <p>
            <span className="text-foreground tabular-nums">{data.elevationGain}</span>
            {m.chart_elev_gain()}
          </p>
        )}
      </div>
    </div>
  )
}

export function LapPaceChart({ laps, usePace, hoveredLapId, onHoverLap }: LapPaceChartProps) {
  // Pace mode: ceiling = slowest pace + padding, barValue = ceiling - pace (faster = taller)
  // Speed mode: barValue = speed directly (faster = taller)
  const { barData, ceiling } = useMemo(() => {
    const raw = laps
      .map((lap, i) => {
        const { distance, duration, avgHr, elevationGain } = lap.stats
        const pace = distance > 0 && duration > 0 ? duration / (distance / 1000) : 0
        const speed = distance > 0 && duration > 0 ? (distance / duration) * 3.6 : 0 // km/h
        return {
          index: i + 1,
          lapId: lap.id,
          name: lap.name,
          pace,
          speed,
          distance,
          duration,
          avgHr,
          elevationGain,
        }
      })
      .filter((d) => d.pace > 0)

    if (raw.length === 0) return { barData: raw as BarData[], ceiling: 600 }

    if (usePace) {
      let minPace = Infinity
      let maxPace = -Infinity
      for (const d of raw) {
        if (d.pace < minPace) minPace = d.pace
        if (d.pace > maxPace) maxPace = d.pace
      }
      const padding = (maxPace - minPace) * 0.15 || 30
      const ceil = maxPace + padding
      return {
        barData: raw.map((d) => ({ ...d, barValue: ceil - d.pace })),
        ceiling: ceil,
      }
    } else {
      return {
        barData: raw.map((d) => ({ ...d, barValue: d.speed })),
        ceiling: 0, // not used in speed mode
      }
    }
  }, [laps, usePace])

  const hoveredLapIdRef = useRef(hoveredLapId)
  useEffect(() => {
    hoveredLapIdRef.current = hoveredLapId
  }, [hoveredLapId])

  const handleMouseMove = useCallback(
    (state: MouseHandlerDataParam) => {
      const idx = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : -1
      if (idx >= 0 && barData[idx]) {
        const lapId = barData[idx].lapId
        if (lapId !== hoveredLapIdRef.current) onHoverLap(lapId)
      }
    },
    [barData, onHoverLap],
  )

  const handleMouseLeave = useCallback(() => {
    onHoverLap(null)
  }, [onHoverLap])

  if (barData.length < 2) return null

  const chartMinWidth = barData.length * 48 + 60

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 p-3 sm:p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {usePace ? m.chart_pace_per_lap() : m.chart_speed_per_lap()}
      </p>
      <div className="-mx-3 sm:-mx-4 overflow-x-auto px-3 sm:px-4">
        <div style={{ minWidth: chartMinWidth }}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart
              data={barData}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <XAxis
                dataKey="index"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 'dataMax']}
                tickFormatter={
                  usePace
                    ? (value: number) => paceTickFormatter(ceiling - value)
                    : (value: number) => `${value.toFixed(0)}`
                }
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<CustomTooltip usePace={usePace} />} cursor={false} />
              <Bar dataKey="barValue" radius={[3, 3, 0, 0]} maxBarSize={64}>
                {barData.map((entry) => (
                  <Cell
                    key={entry.lapId}
                    fill="var(--chart-2)"
                    fillOpacity={
                      hoveredLapId === null ? 0.85 : entry.lapId === hoveredLapId ? 1 : 0.3
                    }
                    className="transition-[fill-opacity] duration-150"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
