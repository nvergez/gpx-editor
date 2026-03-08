import { useState } from 'react'
import type { LapHandle } from '~/utils/dom-model'
import { formatDistance, formatDuration, formatPace, formatSpeed } from '~/utils/gpx-parser'
import { Card, CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Separator } from '~/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '~/components/ui/alert-dialog'
import {
  Trash2,
  Scissors,
  Merge,
  ChevronUp,
  ChevronDown,
  Pencil,
  Check,
  X,
  Heart,
  Zap,
  Gauge,
  Flame,
  TrendingUp,
  TrendingDown,
  Timer,
  Footprints,
} from 'lucide-react'

interface LapCardProps {
  lap: LapHandle
  index: number
  isFirst: boolean
  isLast: boolean
  canMergeNext: boolean
  onDelete: () => void
  onSplit: () => void
  onMergeNext: () => void
  onRename: (name: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className="size-3.5 text-warm-400 shrink-0" strokeWidth={1.5} />
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function LapCard({
  lap,
  index,
  isFirst,
  isLast,
  canMergeNext,
  onDelete,
  onSplit,
  onMergeNext,
  onRename,
  onMoveUp,
  onMoveDown,
}: LapCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(lap.name)
  const { stats } = lap

  const handleSaveRename = () => {
    if (editName.trim()) {
      onRename(editName.trim())
    }
    setIsEditing(false)
  }

  const handleCancelRename = () => {
    setEditName(lap.name)
    setIsEditing(false)
  }

  return (
    <Card className="border-border/60 bg-card/80">
      <CardContent className="py-3 space-y-2">
        {/* Header: reorder, badge, name, actions */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <Button variant="ghost" size="icon-xs" disabled={isFirst} onClick={onMoveUp}>
              <ChevronUp className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" disabled={isLast} onClick={onMoveDown}>
              <ChevronDown className="size-3.5" />
            </Button>
          </div>

          <span className="text-xs tabular-nums text-muted-foreground font-medium shrink-0 w-5 text-center">{index + 1}</span>

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename()
                    if (e.key === 'Escape') handleCancelRename()
                  }}
                  className="h-7 text-sm"
                  autoFocus
                />
                <Button variant="ghost" size="icon-xs" onClick={handleSaveRename}>
                  <Check className="size-3" />
                </Button>
                <Button variant="ghost" size="icon-xs" onClick={handleCancelRename}>
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="font-medium truncate">{lap.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => { setEditName(lap.name); setIsEditing(true) }}
                >
                  <Pencil className="size-2.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="flex gap-0.5 shrink-0">
            <Button variant="ghost" size="icon-xs" onClick={onSplit} title="Split lap" disabled={lap.pointCount < 3}>
              <Scissors className="size-3.5" />
            </Button>
            {canMergeNext && (
              <Button variant="ghost" size="icon-xs" onClick={onMergeNext} title="Merge with next lap">
                <Merge className="size-3.5" />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" title="Delete lap" />}>
                  <Trash2 className="size-3.5" />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete lap?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove "{lap.name}" ({formatDistance(stats.distance)}). This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Separator className="bg-border/40" />

        {/* Stats grid */}
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 pl-9">
          <Stat icon={Footprints} label="Dist" value={formatDistance(stats.distance)} />
          <Stat icon={Timer} label="Time" value={formatDuration(stats.duration)} />
          <Stat icon={Gauge} label="Pace" value={formatPace(stats.distance, stats.duration)} />
          {stats.avgHr !== undefined && (
            <Stat icon={Heart} label="Avg HR" value={`${Math.round(stats.avgHr)} bpm`} />
          )}
          {stats.maxHr !== undefined && (
            <Stat icon={Heart} label="Max HR" value={`${stats.maxHr} bpm`} />
          )}
          {stats.avgCadence !== undefined && (
            <Stat icon={Footprints} label="Cadence" value={`${stats.avgCadence} spm`} />
          )}
          {stats.avgPower !== undefined && (
            <Stat icon={Zap} label="Avg Power" value={`${stats.avgPower} W`} />
          )}
          {stats.maxSpeed !== undefined && (
            <Stat icon={Gauge} label="Max Speed" value={formatSpeed(stats.maxSpeed)} />
          )}
          {stats.calories !== undefined && (
            <Stat icon={Flame} label="Calories" value={`${stats.calories} kcal`} />
          )}
          {stats.elevationGain !== undefined && (
            <Stat icon={TrendingUp} label="Elev +" value={`${stats.elevationGain} m`} />
          )}
          {stats.elevationLoss !== undefined && (
            <Stat icon={TrendingDown} label="Elev -" value={`${stats.elevationLoss} m`} />
          )}
          <span className="text-xs text-muted-foreground self-center tabular-nums">{lap.pointCount} pts</span>
        </div>
      </CardContent>
    </Card>
  )
}
