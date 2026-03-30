import { memo, useEffect, useMemo, useRef } from 'react'
import { MapContainer, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LapTrack } from './activity-map'
import { getLapColor } from '~/utils/lap-colors'
import { useDarkMode } from '~/hooks/use-dark-mode'

const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const TILE_DARK = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const FIT_OPTIONS = { padding: [40, 40] as [number, number], maxZoom: 16 }

interface MapInnerProps {
  lapTracks: LapTrack[]
  hoveredLapId: string | null
  onHoverLap: (lapId: string | null) => void
}

// --- Helpers ---

function computeBounds(lapTracks: LapTrack[]): L.LatLngBounds | null {
  const allCoords = lapTracks.flatMap((t) => t.coords)
  if (allCoords.length === 0) return null
  return L.latLngBounds(allCoords as L.LatLngExpression[])
}

/** Fits the map to the given bounds whenever they change. */
function BoundsController({ bounds }: { bounds: L.LatLngBounds }) {
  const map = useMap()

  useEffect(() => {
    map.fitBounds(bounds, FIT_OPTIONS)
  }, [map, bounds])

  return null
}

/** Switches tile layer when theme changes. */
function TileController({ isDark }: { isDark: boolean }) {
  const map = useMap()
  const layerRef = useRef<L.TileLayer | null>(null)

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
    }
    const layer = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: ATTRIBUTION })
    layer.addTo(map)
    layerRef.current = layer
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, isDark])

  return null
}

// --- Main component ---

export default function MapInner({ lapTracks, hoveredLapId, onHoverLap }: MapInnerProps) {
  const isDark = useDarkMode()
  const bounds = useMemo(() => computeBounds(lapTracks), [lapTracks])

  if (!bounds) return null

  return (
    <div className="h-[280px] sm:h-[400px] rounded-xl border border-border/60 overflow-hidden relative isolate z-0">
      <MapContainer
        bounds={bounds}
        boundsOptions={FIT_OPTIONS}
        className="h-full w-full"
        zoomControl={false}
        preferCanvas
      >
        <TileController isDark={isDark} />
        <BoundsController bounds={bounds} />

        {lapTracks.map((track, i) => (
          <LapPolyline
            key={track.lapId}
            track={track}
            index={i}
            isDark={isDark}
            isHovered={track.lapId === hoveredLapId}
            onHoverLap={onHoverLap}
          />
        ))}
      </MapContainer>

      {lapTracks.length > 1 && (
        <div className="absolute bottom-3 left-3 z-[1000] flex flex-col gap-0.5 rounded-lg bg-card/90 backdrop-blur-sm border border-border/60 px-1.5 py-1.5 text-xs">
          {lapTracks.map((track, i) => {
            const isHovered = track.lapId === hoveredLapId
            return (
              <div
                key={track.lapId}
                className={`flex items-center gap-2 cursor-pointer rounded-md px-1.5 py-0.5 transition-colors ${isHovered ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                onMouseEnter={() => onHoverLap(track.lapId)}
                onMouseLeave={() => onHoverLap(null)}
              >
                <span
                  className="inline-block size-2.5 rounded-full shrink-0 transition-transform"
                  style={{
                    backgroundColor: getLapColor(i, isDark),
                    transform: isHovered ? 'scale(1.3)' : undefined,
                  }}
                />
                <span
                  className={`transition-colors ${isHovered ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                >
                  Lap {i + 1}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// --- Lap polyline ---

interface LapPolylineProps {
  track: LapTrack
  index: number
  isDark: boolean
  isHovered: boolean
  onHoverLap: (lapId: string | null) => void
}

const LapPolyline = memo(function LapPolyline({
  track,
  index,
  isDark,
  isHovered,
  onHoverLap,
}: LapPolylineProps) {
  const color = getLapColor(index, isDark)

  const eventHandlers = useMemo(
    () => ({
      mouseover: () => onHoverLap(track.lapId),
      mouseout: () => onHoverLap(null),
    }),
    [track.lapId, onHoverLap],
  )

  const outlineOptions = useMemo(
    () => ({
      color: 'white',
      weight: isHovered ? 8 : 5,
      opacity: 0.7,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    }),
    [isHovered],
  )

  const trackOptions = useMemo(
    () => ({
      color,
      weight: isHovered ? 5 : 3,
      opacity: isHovered ? 1 : 0.85,
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    }),
    [color, isHovered],
  )

  return (
    <>
      {/* White outline for visibility on any tile background */}
      <Polyline positions={track.coords} pathOptions={outlineOptions} interactive={false} />
      <Polyline positions={track.coords} pathOptions={trackOptions} eventHandlers={eventHandlers} />
    </>
  )
})
