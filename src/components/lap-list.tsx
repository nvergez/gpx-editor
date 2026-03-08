import { useState } from 'react'
import type { LapHandle } from '~/utils/dom-model'
import { formatDistance, formatDuration, formatPace } from '~/utils/gpx-parser'
import { LapCard } from './lap-card'
import { SplitDialog } from './split-dialog'

interface LapListProps {
  laps: LapHandle[]
  sourceFormat: 'gpx' | 'tcx'
  onDelete: (lapId: string) => void
  onSplit: (lapId: string, pointIndex: number) => void
  onMerge: (lapIds: [string, string]) => void
  onRename: (lapId: string, newName: string) => void
  onReorder: (laps: LapHandle[]) => void
}

export function LapList({ laps, sourceFormat, onDelete, onSplit, onMerge, onRename, onReorder }: LapListProps) {
  const [splitLap, setSplitLap] = useState<LapHandle | null>(null)

  const totalDistance = laps.reduce((sum, l) => sum + l.stats.distance, 0)
  const totalDuration = laps.reduce((sum, l) => sum + l.stats.duration, 0)

  const moveLap = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= laps.length) return
    const newLaps = [...laps]
    ;[newLaps[index], newLaps[newIndex]] = [newLaps[newIndex], newLaps[index]]
    onReorder(newLaps)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-6 text-sm text-muted-foreground">
        <span>Total distance: <strong className="text-foreground">{formatDistance(totalDistance)}</strong></span>
        <span>Total duration: <strong className="text-foreground">{formatDuration(totalDuration)}</strong></span>
        <span>Avg pace: <strong className="text-foreground">{formatPace(totalDistance, totalDuration)}</strong></span>
      </div>

      <div className="space-y-3">
        {laps.map((lap, index) => (
          <LapCard
            key={lap.id}
            lap={lap}
            index={index}
            isFirst={index === 0}
            isLast={index === laps.length - 1}
            canMergeNext={index < laps.length - 1}
            onDelete={() => onDelete(lap.id)}
            onSplit={() => setSplitLap(lap)}
            onMergeNext={() => onMerge([lap.id, laps[index + 1].id])}
            onRename={(name) => onRename(lap.id, name)}
            onMoveUp={() => moveLap(index, 'up')}
            onMoveDown={() => moveLap(index, 'down')}
          />
        ))}
      </div>

      {splitLap && (
        <SplitDialog
          lap={splitLap}
          sourceFormat={sourceFormat}
          onSplit={(pointIndex) => {
            onSplit(splitLap.id, pointIndex)
            setSplitLap(null)
          }}
          onClose={() => setSplitLap(null)}
        />
      )}
    </div>
  )
}
