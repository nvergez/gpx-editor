import { lazy, Suspense, useMemo } from 'react'
import type { LapHandle } from '~/utils/dom-model'
import { getTrackPointsFromElement } from '~/utils/dom-operations'
import { simplifyTrack } from '~/utils/simplify-track'
import { Map as MapIcon } from 'lucide-react'
import { useIsClient } from '~/hooks/use-is-client'

// Lazy-load to avoid Leaflet SSR crash (it accesses `window` at import time)
const MapInner = lazy(() => import('./activity-map-inner'))

export interface LapTrack {
  lapId: string
  coords: [number, number][]
}

interface ActivityMapProps {
  laps: LapHandle[]
  sourceFormat: 'gpx' | 'tcx'
  revision: number
  hoveredLapId: string | null
  onHoverLap: (lapId: string | null) => void
}

export function ActivityMap({
  laps,
  sourceFormat,
  revision,
  hoveredLapId,
  onHoverLap,
}: ActivityMapProps) {
  const isClient = useIsClient()

  const lapTracks = useMemo((): LapTrack[] => {
    void revision
    return laps
      .map((lap) => {
        const points = getTrackPointsFromElement(lap.element, sourceFormat)
        if (points.length === 0) return null
        const raw: [number, number][] = points.map((p) => [p.lat, p.lon])
        return {
          lapId: lap.id,
          coords: simplifyTrack(raw),
        }
      })
      .filter((t): t is LapTrack => t !== null)
  }, [laps, sourceFormat, revision])

  // No GPS data at all
  if (lapTracks.length === 0) return null

  if (!isClient) {
    return <MapSkeleton />
  }

  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapInner lapTracks={lapTracks} hoveredLapId={hoveredLapId} onHoverLap={onHoverLap} />
    </Suspense>
  )
}

function MapSkeleton() {
  return (
    <div className="h-[280px] sm:h-[400px] rounded-xl border border-border/60 bg-card/80 flex items-center justify-center text-muted-foreground">
      <MapIcon className="size-5 animate-pulse" />
    </div>
  )
}
