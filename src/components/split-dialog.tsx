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

interface SplitDialogProps {
  lap: LapHandle
  sourceFormat: 'gpx' | 'tcx'
  onSplit: (pointIndex: number) => void
  onClose: () => void
}

export function SplitDialog({ lap, sourceFormat, onSplit, onClose }: SplitDialogProps) {
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

  const midpoint = Math.floor(points.length / 2)
  const [splitIndex, setSplitIndex] = useState(midpoint)

  const maxIndex = points.length - 1

  const firstDistance = cumulativeDistances[splitIndex] ?? 0
  const secondDistance = lap.stats.distance - firstDistance

  // Visual split ratio for the bar
  const ratio = lap.stats.distance > 0 ? firstDistance / lap.stats.distance : 0.5

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split "{lap.name}"</DialogTitle>
          <DialogDescription>
            Choose where to split this lap ({points.length} points,{' '}
            {formatDistance(lap.stats.distance)}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
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

          {/* Visual split bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div
              className="h-full bg-primary/70 transition-all duration-150 rounded-l-full"
              style={{ width: `${ratio * 100}%` }}
            />
            <div
              className="h-full bg-primary/30 transition-all duration-150 rounded-r-full"
              style={{ width: `${(1 - ratio) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-muted/60 border border-border/40 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">First half</p>
              <p className="font-medium tabular-nums">{formatDistance(firstDistance)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {splitIndex + 1} points
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/60 border border-border/40 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Second half</p>
              <p className="font-medium tabular-nums">{formatDistance(secondDistance)}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {points.length - splitIndex} points
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSplit(splitIndex)}>
            <Scissors className="size-3.5" />
            Split
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
