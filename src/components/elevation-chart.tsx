import { lazy, Suspense } from 'react'
import type { LapHandle } from '~/utils/dom-model'
import { AreaChart } from 'lucide-react'
import { useIsClient } from '~/hooks/use-is-client'

const ChartInner = lazy(() => import('./elevation-chart-inner'))

interface ElevationChartProps {
  laps: LapHandle[]
  sourceFormat: 'gpx' | 'tcx'
  revision: number
  hoveredLapId: string | null
  onHoverLap: (lapId: string | null) => void
}

export function ElevationChart({
  laps,
  sourceFormat,
  revision,
  hoveredLapId,
  onHoverLap,
}: ElevationChartProps) {
  const isClient = useIsClient()

  if (!isClient) {
    return <ChartSkeleton />
  }

  return (
    <Suspense fallback={<ChartSkeleton />}>
      <ChartInner
        laps={laps}
        sourceFormat={sourceFormat}
        revision={revision}
        hoveredLapId={hoveredLapId}
        onHoverLap={onHoverLap}
      />
    </Suspense>
  )
}

function ChartSkeleton() {
  return (
    <div className="h-[300px] rounded-xl border border-border/60 bg-card/80 flex items-center justify-center text-muted-foreground">
      <AreaChart className="size-5 animate-pulse" />
    </div>
  )
}
