import { useState, useMemo } from 'react'
import type { LapHandle } from '~/utils/dom-model'
import { formatDistance, haversineDistance } from '~/utils/gpx-parser'
import { getTrackPointsFromElement } from '~/utils/dom-operations'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Label } from '~/components/ui/label'
import { Input } from '~/components/ui/input'
import { Scissors } from 'lucide-react'

type SplitMode = 'manual' | 'equal'

// Colors for segments (cycle through a palette)
const SEGMENT_COLORS = [
  'bg-primary/70',
  'bg-primary/35',
  'bg-chart-2/60',
  'bg-chart-3/60',
  'bg-chart-4/60',
  'bg-chart-5/60',
  'bg-primary/50',
  'bg-chart-2/40',
]

interface SplitDialogProps {
  lap: LapHandle
  sourceFormat: 'gpx' | 'tcx'
  onSplit: (pointIndices: number[]) => void
  onClose: () => void
}

export function SplitDialog({ lap, sourceFormat, onSplit, onClose }: SplitDialogProps) {
  const [mode, setMode] = useState<SplitMode>('equal')

  const points = useMemo(
    () => getTrackPointsFromElement(lap.element, sourceFormat),
    [lap.element, sourceFormat],
  )

  // Precompute cumulative distances so slider lookup is O(1)
  const cumulativeDistances = useMemo(() => {
    const cumDist = [0]
    for (let i = 1; i < points.length; i++) {
      cumDist.push(cumDist[i - 1] + haversineDistance(points[i - 1], points[i]))
    }
    return cumDist
  }, [points])

  const totalDistance = cumulativeDistances[cumulativeDistances.length - 1] ?? 0

  // --- Manual mode state ---
  const midpoint = Math.floor(points.length / 2)
  const [splitIndex, setSplitIndex] = useState(midpoint)
  const maxIndex = points.length - 1

  // --- Equal mode state ---
  const maxParts = Math.max(2, Math.min(Math.floor(points.length / 2), 50))
  const [numParts, setNumParts] = useState(2)

  // Compute split indices for equal-distance mode
  const equalSplitIndices = useMemo(() => {
    if (numParts < 2 || totalDistance === 0) return []
    const targetSegmentDist = totalDistance / numParts
    const indices: number[] = []

    for (let p = 1; p < numParts; p++) {
      const targetDist = targetSegmentDist * p
      // Find the trackpoint closest to this target distance
      let bestIdx = 1
      let bestDiff = Math.abs(cumulativeDistances[1] - targetDist)
      for (let i = 2; i < points.length - 1; i++) {
        const diff = Math.abs(cumulativeDistances[i] - targetDist)
        if (diff < bestDiff) {
          bestDiff = diff
          bestIdx = i
        }
      }
      // Avoid duplicate indices (can happen with very short segments)
      if (indices.length === 0 || bestIdx > indices[indices.length - 1]) {
        indices.push(bestIdx)
      }
    }

    return indices
  }, [numParts, totalDistance, cumulativeDistances, points.length])

  const activeIndices = useMemo(
    () => (mode === 'manual' ? [splitIndex] : equalSplitIndices),
    [mode, splitIndex, equalSplitIndices],
  )

  // Compute segment stats for the preview
  const segments = useMemo(() => {
    const boundaries = [0, ...activeIndices, points.length - 1]
    const result: { distance: number; pointCount: number }[] = []

    for (let i = 0; i < boundaries.length - 1; i++) {
      const start = boundaries[i]
      const end = boundaries[i + 1]
      const distance = cumulativeDistances[end] - cumulativeDistances[start]
      const pointCount = end - start + 1
      result.push({ distance, pointCount })
    }

    return result
  }, [activeIndices, cumulativeDistances, points.length])
  const canSplit = activeIndices.length > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split "{lap.name}"</DialogTitle>
          <DialogDescription>
            {points.length} points, {formatDistance(lap.stats.distance)}.
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'equal'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('equal')}
          >
            Equal split
          </button>
          <button
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === 'manual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
        </div>

        <div className="space-y-5">
          {mode === 'manual' ? (
            <div className="space-y-2">
              <Label
                htmlFor="split-point"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Split at point
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="split-point"
                  type="range"
                  min={1}
                  max={maxIndex - 1}
                  value={splitIndex}
                  onChange={(e) => setSplitIndex(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm tabular-nums font-medium w-20 text-right text-muted-foreground">
                  {splitIndex} / {maxIndex}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label
                htmlFor="num-parts"
                className="text-xs uppercase tracking-wider text-muted-foreground"
              >
                Number of equal laps
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="num-parts"
                  type="range"
                  min={2}
                  max={maxParts}
                  value={numParts}
                  onChange={(e) => setNumParts(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm tabular-nums font-medium w-12 text-right text-muted-foreground">
                  {numParts}
                </span>
              </div>
              {equalSplitIndices.length < numParts - 1 && (
                <p className="text-xs text-muted-foreground">
                  Not enough trackpoints for {numParts} distinct segments — reduced to{' '}
                  {equalSplitIndices.length + 1}.
                </p>
              )}
            </div>
          )}

          {/* Visual split bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            {segments.map((seg, i) => {
              const width =
                totalDistance > 0 ? (seg.distance / totalDistance) * 100 : 100 / segments.length
              const isFirst = i === 0
              const isLast = i === segments.length - 1
              return (
                <div
                  key={i}
                  className={`h-full transition-all duration-150 ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${isFirst ? 'rounded-l-full' : ''} ${isLast ? 'rounded-r-full' : ''}`}
                  style={{ width: `${width}%` }}
                />
              )
            })}
          </div>

          {/* Segment details */}
          <div
            className="grid gap-2 text-sm max-h-48 overflow-y-auto"
            style={{
              gridTemplateColumns: `repeat(${Math.min(segments.length, 4)}, minmax(0, 1fr))`,
            }}
          >
            {segments.map((seg, i) => (
              <div
                key={i}
                className="p-2.5 rounded-lg bg-muted/60 border border-border/40 space-y-0.5"
              >
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Part {i + 1}
                </p>
                <p className="font-medium tabular-nums text-sm">{formatDistance(seg.distance)}</p>
                <p className="text-xs text-muted-foreground tabular-nums">{seg.pointCount} pts</p>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSplit(activeIndices)} disabled={!canSplit}>
            <Scissors className="size-3.5" />
            Split into {segments.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
