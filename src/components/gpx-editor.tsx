import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import type { Id } from '../../convex/_generated/dataModel'
import type { ActivityDocument } from '~/utils/dom-model'
import type { LapHandle } from '~/utils/dom-model'
import {
  exportGpx,
  exportTcx,
  formatDistance,
  formatDuration,
  formatPace,
} from '~/utils/gpx-parser'
import {
  parseToDocument,
  getLapHandles,
  countLaps,
  deleteLap,
  splitLap,
  mergeLaps,
  renameLap,
  renameActivity,
  reorderLaps,
  exportOriginal,
  getTrackPointsFromElement,
} from '~/utils/dom-operations'
import { LapTable } from './lap-table'
import { ActivityMap } from './activity-map'
import { ElevationChart } from './elevation-chart'
import { LapPaceChart } from './lap-pace-chart'
import { Button } from '~/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  ChevronDown,
  Info,
  X,
  FileDown,
  Undo2,
  Redo2,
  Pencil,
  Check,
  Route,
  Clock,
  Mountain,
  Zap,
  Heart,
  Gauge,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { StravaLogo } from '~/utils/strava'
import { UndoManager } from '~/utils/undo-manager'

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_')
}

/** Compute aggregate stats from laps for persistence */
function computeActivitySummary(laps: LapHandle[]) {
  let totalDistance = 0
  let totalDuration = 0
  let totalElevationGain = 0
  for (const lap of laps) {
    totalDistance += lap.stats.distance
    totalDuration += lap.stats.duration
    totalElevationGain += lap.stats.elevationGain ?? 0
  }
  return {
    distance: totalDistance,
    duration: totalDuration,
    elevationGain: totalElevationGain || undefined,
    lapCount: laps.length,
  }
}

function ActivityNameEditor({
  name,
  onRename,
}: {
  name: string
  onRename: (name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function commit() {
    const trimmed = value.trim()
    if (trimmed && trimmed !== name) {
      onRename(trimmed)
    } else {
      setValue(name)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground leading-tight bg-transparent border-b border-foreground/30 outline-none w-full"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setValue(name)
              setEditing(false)
            }
          }}
        />
        <button
          onClick={commit}
          className="shrink-0 rounded-md p-1 hover:bg-muted transition-colors"
        >
          <Check className="size-4 text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div className="group/name flex items-center gap-2">
      <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground leading-tight">
        {name}
      </h2>
      <button
        onClick={() => {
          setValue(name)
          setEditing(true)
        }}
        className="shrink-0 rounded-md p-1 opacity-0 group-hover/name:opacity-100 hover:bg-muted transition-all"
        title="Rename activity"
      >
        <Pencil className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  )
}

function ActivityStats({ laps }: { laps: LapHandle[] }) {
  const summary = useMemo(() => {
    let distance = 0
    let duration = 0
    let elevationGain = 0
    let hrSum = 0
    let hrCount = 0
    let maxHr = 0
    let powerSum = 0
    let powerCount = 0

    for (const lap of laps) {
      distance += lap.stats.distance
      duration += lap.stats.duration
      elevationGain += lap.stats.elevationGain ?? 0
      if (lap.stats.avgHr) {
        hrSum += lap.stats.avgHr * lap.stats.duration
        hrCount += lap.stats.duration
      }
      if (lap.stats.maxHr && lap.stats.maxHr > maxHr) maxHr = lap.stats.maxHr
      if (lap.stats.avgPower) {
        powerSum += lap.stats.avgPower * lap.stats.duration
        powerCount += lap.stats.duration
      }
    }

    return {
      distance,
      duration,
      elevationGain,
      avgHr: hrCount > 0 ? Math.round(hrSum / hrCount) : undefined,
      maxHr: maxHr > 0 ? maxHr : undefined,
      avgPower: powerCount > 0 ? Math.round(powerSum / powerCount) : undefined,
      lapCount: laps.length,
    }
  }, [laps])

  const stats: { icon: typeof Route; label: string; value: string }[] = [
    { icon: Route, label: 'Distance', value: formatDistance(summary.distance) },
    { icon: Clock, label: 'Duration', value: formatDuration(summary.duration) },
    { icon: Gauge, label: 'Pace', value: formatPace(summary.distance, summary.duration) },
  ]
  if (summary.elevationGain > 0) {
    stats.push({
      icon: Mountain,
      label: 'Elevation',
      value: `${Math.round(summary.elevationGain)} m`,
    })
  }
  if (summary.avgHr) {
    stats.push({
      icon: Heart,
      label: 'Avg HR',
      value: `${summary.avgHr} bpm`,
    })
  }
  if (summary.avgPower) {
    stats.push({
      icon: Zap,
      label: 'Avg Power',
      value: `${summary.avgPower} W`,
    })
  }

  return (
    <>
      {/* Mobile: compact text grid */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 sm:hidden">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {stat.label}
            </p>
            <p className="text-sm font-semibold tabular-nums text-foreground truncate">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Desktop: cards */}
      <div className="hidden sm:flex sm:flex-wrap sm:gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-4 py-3"
          >
            <stat.icon className="size-4 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                {stat.label}
              </p>
              <p className="text-sm font-semibold tabular-nums text-foreground">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

interface GpxEditorProps {
  activityId: Id<'activities'>
  initialXml: string
  source: 'file' | 'strava'
  stravaActivityId?: number
  onSave: (data: {
    activityId: Id<'activities'>
    xmlContent: string
    name: string
    distance: number
    duration: number
    elevationGain?: number
    lapCount: number
  }) => void
}

export function GpxEditor({
  activityId,
  initialXml,
  source,
  stravaActivityId,
  onSave,
}: GpxEditorProps) {
  const [actDoc] = useState<ActivityDocument | null>(() => {
    try {
      const doc = parseToDocument(initialXml)
      return doc
    } catch {
      return null
    }
  })
  const [revision, setRevision] = useState(0)
  const undoManagerRef = useRef(new UndoManager())
  const [showGpxHint, setShowGpxHint] = useState(() => {
    if (!actDoc) return false
    return actDoc.sourceFormat === 'gpx' && countLaps(actDoc) === 1
  })
  const [crossFormatTarget, setCrossFormatTarget] = useState<'gpx' | 'tcx' | null>(null)
  const [hoveredLapId, setHoveredLapId] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const laps = useMemo(() => {
    if (!actDoc) return []
    void revision
    return getLapHandles(actDoc)
  }, [actDoc, revision])

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const persistToConvex = useCallback(
    (doc: ActivityDocument, currentLaps: LapHandle[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        const xml = exportOriginal(doc)
        const summary = computeActivitySummary(currentLaps)
        onSave({
          activityId,
          xmlContent: xml,
          name: doc.name,
          ...summary,
        })
      }, 500)
    },
    [activityId, onSave],
  )

  const bumpRevision = useCallback(() => {
    setRevision((r) => r + 1)
    setCanUndo(undoManagerRef.current.canUndo)
    setCanRedo(undoManagerRef.current.canRedo)
  }, [])

  // After each revision, persist (laps recalculated via useMemo on next render)
  useEffect(() => {
    if (!actDoc || revision === 0) return
    // Recompute laps directly for persistence (useMemo might not have run yet)
    const currentLaps = getLapHandles(actDoc)
    persistToConvex(actDoc, currentLaps)
  }, [actDoc, revision, persistToConvex])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleDeleteLap = useCallback(
    (lapId: string) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      deleteLap(actDoc, lapId)
      bumpRevision()
      toast.success('Lap deleted')
    },
    [actDoc, bumpRevision],
  )

  const handleSplitLap = useCallback(
    (lapId: string, pointIndices: number[]) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      splitLap(actDoc, lapId, pointIndices)
      bumpRevision()
      const parts = pointIndices.length + 1
      toast.success(`Lap split into ${parts} part${parts !== 1 ? 's' : ''}`)
    },
    [actDoc, bumpRevision],
  )

  const handleMergeLaps = useCallback(
    (lapIds: [string, string]) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      mergeLaps(actDoc, lapIds[0], lapIds[1])
      bumpRevision()
      toast.success('Laps merged')
    },
    [actDoc, bumpRevision],
  )

  const handleRenameLap = useCallback(
    (lapId: string, newName: string) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      renameLap(actDoc, lapId, newName)
      bumpRevision()
    },
    [actDoc, bumpRevision],
  )

  const handleReorderLaps = useCallback(
    (reorderedLaps: LapHandle[]) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      reorderLaps(
        actDoc,
        reorderedLaps.map((l) => l.id),
      )
      bumpRevision()
    },
    [actDoc, bumpRevision],
  )

  const handleExportOriginal = useCallback(() => {
    if (!actDoc) return
    const baseName = sanitizeFilename(actDoc.name)
    const ext = actDoc.sourceFormat
    const content = exportOriginal(actDoc)
    const mimeType = ext === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml'
    downloadFile(content, `${baseName}_edited.${ext}`, mimeType)
    toast.success(`${ext.toUpperCase()} file exported (original format)`)
  }, [actDoc])

  const doCrossFormatExport = useCallback(
    (format: 'gpx' | 'tcx') => {
      if (!actDoc) return
      const baseName = sanitizeFilename(actDoc.name)

      const gpxData = {
        name: actDoc.name,
        sourceFormat: actDoc.sourceFormat,
        laps: laps.map((h) => {
          const points = getTrackPointsFromElement(h.element, actDoc.sourceFormat)
          return {
            id: h.id,
            name: h.name,
            points,
            startTime: points[0]?.time,
            endTime: points[points.length - 1]?.time,
            stats: h.stats,
          }
        }),
      }

      if (format === 'tcx') {
        downloadFile(exportTcx(gpxData), `${baseName}_edited.tcx`, 'application/vnd.garmin.tcx+xml')
        toast.success('TCX file exported')
      } else {
        downloadFile(exportGpx(gpxData), `${baseName}_edited.gpx`, 'application/gpx+xml')
        toast.success('GPX file exported')
      }
    },
    [actDoc, laps],
  )

  const handleExportCrossFormat = useCallback((format: 'gpx' | 'tcx') => {
    setCrossFormatTarget(format)
  }, [])

  const handleConfirmCrossFormat = useCallback(() => {
    if (crossFormatTarget) {
      doCrossFormatExport(crossFormatTarget)
    }
    setCrossFormatTarget(null)
  }, [crossFormatTarget, doCrossFormatExport])

  const handleUndo = useCallback(() => {
    if (!actDoc) return
    if (undoManagerRef.current.undo(actDoc)) bumpRevision()
  }, [actDoc, bumpRevision])

  const handleRedo = useCallback(() => {
    if (!actDoc) return
    if (undoManagerRef.current.redo(actDoc)) bumpRevision()
  }, [actDoc, bumpRevision])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  if (!actDoc) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">Failed to parse activity data.</p>
        <Link
          to="/"
          className="mt-4 text-sm text-primary underline underline-offset-2 hover:text-primary/80"
        >
          Go back
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {showGpxHint && (
        <div className="flex items-start gap-2.5 rounded-xl border border-chart-3/30 bg-chart-3/5 p-3 sm:p-4 text-sm text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-chart-3" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-xs sm:text-sm">Only 1 lap detected</p>
            <p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
              GPX files often store all laps as a single track. Try importing the TCX version
              instead.
            </p>
          </div>
          <button
            onClick={() => setShowGpxHint(false)}
            className="shrink-0 rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Activity header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {actDoc.sourceFormat.toUpperCase()} Activity
            </p>
            {source === 'strava' && stravaActivityId && (
              <a
                href={`https://www.strava.com/activities/${stravaActivityId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-[#FC4C02]/10 px-2 py-0.5 text-xs text-[#FC4C02] hover:bg-[#FC4C02]/20 transition-colors"
                title="View on Strava"
              >
                <StravaLogo className="size-3" />
                Strava
              </a>
            )}
          </div>
          <ActivityNameEditor
            name={actDoc.name}
            onRename={(newName) => {
              undoManagerRef.current.snapshot(actDoc)
              renameActivity(actDoc, newName)
              bumpRevision()
            }}
          />
        </div>
        <div className="flex gap-1.5 sm:gap-2 shrink-0 pt-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <FileDown className="size-3.5" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportOriginal}>
                Export as {actDoc.sourceFormat.toUpperCase()} (original)
              </DropdownMenuItem>
              {actDoc.sourceFormat !== 'gpx' && (
                <DropdownMenuItem onClick={() => handleExportCrossFormat('gpx')}>
                  Export as GPX
                </DropdownMenuItem>
              )}
              {actDoc.sourceFormat !== 'tcx' && (
                <DropdownMenuItem onClick={() => handleExportCrossFormat('tcx')}>
                  Export as TCX
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ActivityStats laps={laps} />

      <ActivityMap
        laps={laps}
        sourceFormat={actDoc.sourceFormat}
        revision={revision}
        hoveredLapId={hoveredLapId}
        onHoverLap={setHoveredLapId}
      />

      <ElevationChart
        laps={laps}
        sourceFormat={actDoc.sourceFormat}
        revision={revision}
        hoveredLapId={hoveredLapId}
        onHoverLap={setHoveredLapId}
      />

      <LapPaceChart laps={laps} hoveredLapId={hoveredLapId} onHoverLap={setHoveredLapId} />

      <LapTable
        laps={laps}
        sourceFormat={actDoc.sourceFormat}
        onDelete={handleDeleteLap}
        onSplit={handleSplitLap}
        onMerge={handleMergeLaps}
        onRename={handleRenameLap}
        onReorder={handleReorderLaps}
        hoveredLapId={hoveredLapId}
        onHoverLap={setHoveredLapId}
      />

      <AlertDialog
        open={crossFormatTarget !== null}
        onOpenChange={(open) => !open && setCrossFormatTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to {crossFormatTarget?.toUpperCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              Converting from {actDoc.sourceFormat.toUpperCase()} to{' '}
              {crossFormatTarget?.toUpperCase()} will lose some data that has no equivalent in the
              target format
              {actDoc.sourceFormat === 'tcx' && ' (calories, lap summaries, device info, etc.)'}
              {actDoc.sourceFormat === 'gpx' && ' (track type, description, links, etc.)'}. Use
              "Export as {actDoc.sourceFormat.toUpperCase()} (original)" for a lossless export.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCrossFormat}>Export anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
