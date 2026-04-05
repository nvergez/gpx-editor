import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ActivityDocument, LapHandle } from '~/utils/dom-model'
import {
  exportGpx,
  exportTcx,
  formatDistance,
  formatDuration,
  formatPace,
  formatAvgSpeed,
} from '~/utils/gpx-parser'
import { isPaceSport } from '~/utils/activity-formatting'
import {
  parseToDocument,
  getLapHandles,
  countLaps,
  splitLap,
  mergeLaps,
  renameLap,
  renameActivity,
  exportOriginal,
  getTrackPointsFromElement,
} from '~/utils/dom-operations'
import type { Formula } from '~/utils/custom-columns'
import { exportLapsCsv } from '~/utils/csv-export'
import { LapTable } from './lap-table'
import type { CustomColumnConfig } from './lap-table'
import { CustomizeColumnsDialog } from './customize-columns-dialog'
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
  FileSpreadsheet,
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
  Sparkles,
  Settings2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { StravaLogo } from '~/utils/strava'
import { UndoManager } from '~/utils/undo-manager'
import { useChatStore } from '~/lib/chat-store'
import { ActivityChat } from './activity-chat'
import * as m from '~/paraglide/messages.js'

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
        title={m.editor_rename_activity()}
      >
        <Pencil className="size-3.5 text-muted-foreground" />
      </button>
    </div>
  )
}

function ActivityStats({ laps, usePace }: { laps: LapHandle[]; usePace: boolean }) {
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
    { icon: Route, label: m.stat_distance(), value: formatDistance(summary.distance) },
    { icon: Clock, label: m.stat_duration(), value: formatDuration(summary.duration) },
    usePace
      ? { icon: Gauge, label: m.stat_pace(), value: formatPace(summary.distance, summary.duration) }
      : {
          icon: Gauge,
          label: m.stat_avg_speed(),
          value: formatAvgSpeed(summary.distance, summary.duration),
        },
  ]
  if (summary.elevationGain > 0) {
    stats.push({
      icon: Mountain,
      label: m.stat_elevation(),
      value: `${Math.round(summary.elevationGain)} ${m.stat_unit_m()}`,
    })
  }
  if (summary.avgHr) {
    stats.push({
      icon: Heart,
      label: m.stat_avg_hr(),
      value: `${summary.avgHr} ${m.stat_unit_bpm()}`,
    })
  }
  if (summary.avgPower) {
    stats.push({
      icon: Zap,
      label: m.stat_avg_power(),
      value: `${summary.avgPower} ${m.stat_unit_w()}`,
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
  sport?: string
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
  sport,
  stravaActivityId,
  onSave,
}: GpxEditorProps) {
  const usePace = isPaceSport(sport)
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
  const chatOpen = useChatStore((s) => s.open)
  const setChatOpen = useChatStore((s) => s.setOpen)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Custom columns
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [builtinVisibility, setBuiltinVisibility] = useState<Record<string, boolean>>({})
  const allDefinitionsRaw = useQuery(api.columns.listDefinitions)
  const activityColumnsRaw = useQuery(api.columns.listActivityColumns, { activityId })
  const columnValuesRaw = useQuery(api.columns.listValues, { activityId })
  const allDefinitions = useMemo(() => allDefinitionsRaw ?? [], [allDefinitionsRaw])
  const activityColumns = useMemo(() => activityColumnsRaw ?? [], [activityColumnsRaw])
  const columnValues = useMemo(() => columnValuesRaw ?? [], [columnValuesRaw])
  const setColumnValue = useMutation(api.columns.setValue)
  const clearColumnValue = useMutation(api.columns.clearValue)
  const createColumnDefinition = useMutation(api.columns.createDefinition)
  const addColumnToActivity = useMutation(api.columns.addColumnToActivity)
  const removeColumnFromActivity = useMutation(api.columns.removeColumnFromActivity)

  const customColumnConfig = useMemo((): CustomColumnConfig | undefined => {
    if (activityColumns.length === 0 && allDefinitions.length === 0) return undefined
    return {
      definitions: allDefinitions,
      activityColumns,
      values: columnValues,
      onSetValue: (columnId, lapId, value) => {
        setColumnValue({ activityId, columnId, lapId, value })
      },
      onClearValue: (columnId, lapId) => {
        clearColumnValue({ activityId, columnId, lapId })
      },
    }
  }, [allDefinitions, activityColumns, columnValues, activityId, setColumnValue, clearColumnValue])

  const handleBuiltinVisibilityChange = useCallback((key: string, visible: boolean) => {
    setBuiltinVisibility((prev) => ({ ...prev, [key]: visible }))
  }, [])

  // Column callbacks for AI chat
  const handleAddCustomColumn = useCallback(
    async (args: { name: string; type: 'manual' | 'computed'; formula?: Formula }) => {
      const colId = await createColumnDefinition({
        name: args.name,
        type: args.type,
        formula: args.formula,
        isShared: false,
      })
      const maxOrder = activityColumns.reduce((max, ac) => Math.max(max, ac.order), 0)
      await addColumnToActivity({ activityId, columnId: colId, order: maxOrder + 1 })
    },
    [createColumnDefinition, addColumnToActivity, activityId, activityColumns],
  )

  const handleRemoveCustomColumn = useCallback(
    async (columnName: string) => {
      const def = allDefinitions.find((d) => d.name === columnName)
      if (!def) throw new Error(`Column "${columnName}" not found`)
      const link = activityColumns.find((ac) => ac.columnId === def._id)
      if (!link) throw new Error(`Column "${columnName}" is not on this activity`)
      await removeColumnFromActivity({ id: link._id })
    },
    [allDefinitions, activityColumns, removeColumnFromActivity],
  )

  const handleSetCustomColumnValue = useCallback(
    async (columnName: string, lapId: string, value: number) => {
      const def = allDefinitions.find((d) => d.name === columnName && d.type === 'manual')
      if (!def) throw new Error(`Manual column "${columnName}" not found`)
      await setColumnValue({ activityId, columnId: def._id, lapId, value })
    },
    [allDefinitions, activityId, setColumnValue],
  )

  const columnContext = useMemo(
    () => ({
      builtinVisibility,
      allDefinitions,
      activityColumns,
    }),
    [builtinVisibility, allDefinitions, activityColumns],
  )

  const columnCallbacksObj = useMemo(
    () => ({
      onToggleBuiltinColumn: handleBuiltinVisibilityChange,
      onAddCustomColumn: handleAddCustomColumn,
      onRemoveCustomColumn: handleRemoveCustomColumn,
      onSetCustomColumnValue: handleSetCustomColumnValue,
    }),
    [
      handleBuiltinVisibilityChange,
      handleAddCustomColumn,
      handleRemoveCustomColumn,
      handleSetCustomColumnValue,
    ],
  )

  const laps = useMemo(() => {
    if (!actDoc) return []
    void revision
    return getLapHandles(actDoc)
  }, [actDoc, revision])

  const lapsRef = useRef(laps)
  useEffect(() => {
    lapsRef.current = laps
  }, [laps])

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

  // After each revision, persist using already-computed laps
  useEffect(() => {
    if (!actDoc || revision === 0) return
    persistToConvex(actDoc, lapsRef.current)
  }, [actDoc, revision, persistToConvex])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleSplitLap = useCallback(
    (lapId: string, pointIndices: number[]) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      splitLap(actDoc, lapId, pointIndices)
      bumpRevision()
      const parts = pointIndices.length + 1
      toast.success(m.editor_lap_split({ count: String(parts) }), {
        description: activityColumns.length > 0 ? m.editor_split_columns_cleared() : undefined,
      })
    },
    [actDoc, bumpRevision, activityColumns.length],
  )

  const handleMergeLaps = useCallback(
    (lapIds: [string, string]) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      mergeLaps(actDoc, lapIds[0], lapIds[1])
      bumpRevision()
      toast.success(m.editor_laps_merged(), {
        description: activityColumns.length > 0 ? m.editor_merge_columns_cleared() : undefined,
      })
    },
    [actDoc, bumpRevision, activityColumns.length],
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

  const handleRenameActivity = useCallback(
    (newName: string) => {
      if (!actDoc) return
      undoManagerRef.current.snapshot(actDoc)
      renameActivity(actDoc, newName)
      bumpRevision()
    },
    [actDoc, bumpRevision],
  )

  const handleExportCsv = useCallback(() => {
    if (!actDoc) return
    const csv = exportLapsCsv({
      laps,
      usePace,
      builtinVisibility,
      customColumns: customColumnConfig
        ? {
            definitions: customColumnConfig.definitions,
            activityColumns: customColumnConfig.activityColumns,
            values: customColumnConfig.values,
          }
        : undefined,
    })
    const baseName = sanitizeFilename(actDoc.name)
    downloadFile(csv, `${baseName}_laps.csv`, 'text/csv')
    toast.success(m.editor_csv_exported())
  }, [actDoc, laps, usePace, builtinVisibility, customColumnConfig])

  const handleExportOriginal = useCallback(() => {
    if (!actDoc) return
    const baseName = sanitizeFilename(actDoc.name)
    const ext = actDoc.sourceFormat
    const content = exportOriginal(actDoc)
    const mimeType = ext === 'tcx' ? 'application/vnd.garmin.tcx+xml' : 'application/gpx+xml'
    downloadFile(content, `${baseName}_edited.${ext}`, mimeType)
    toast.success(m.editor_file_exported({ format: ext.toUpperCase() }))
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
        toast.success(m.editor_tcx_exported())
      } else {
        downloadFile(exportGpx(gpxData), `${baseName}_edited.gpx`, 'application/gpx+xml')
        toast.success(m.editor_gpx_exported())
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
        <p className="text-muted-foreground">{m.editor_failed_parse()}</p>
        <Link
          to="/"
          className="mt-4 text-sm text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {m.common_go_back()}
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {showGpxHint && (
          <div className="flex items-start gap-2.5 rounded-xl border border-chart-3/30 bg-chart-3/5 p-3 sm:p-4 text-sm text-foreground">
            <Info className="mt-0.5 size-4 shrink-0 text-chart-3" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs sm:text-sm">{m.editor_one_lap_title()}</p>
              <p className="mt-0.5 text-muted-foreground text-xs sm:text-sm">
                {m.editor_one_lap_desc()}
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
                {m.editor_activity_label({ format: actDoc.sourceFormat.toUpperCase() })}
              </p>
              {source === 'strava' && stravaActivityId && (
                <a
                  href={`https://www.strava.com/activities/${stravaActivityId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full bg-[#FC4C02]/10 px-2 py-0.5 text-xs text-[#FC4C02] hover:bg-[#FC4C02]/20 transition-colors"
                  title={m.editor_view_on_strava()}
                >
                  <StravaLogo className="size-3" />
                  {m.editor_strava()}
                </a>
              )}
            </div>
            <ActivityNameEditor name={actDoc.name} onRename={handleRenameActivity} />
          </div>
          <div className="flex gap-1.5 sm:gap-2 shrink-0 pt-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleUndo}
              disabled={!canUndo}
              title={m.editor_undo()}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleRedo}
              disabled={!canRedo}
              title={m.editor_redo()}
            >
              <Redo2 className="size-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" />}>
                <FileDown className="size-3.5" />
                <span className="hidden sm:inline">{m.editor_export()}</span>
                <ChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleExportOriginal}>
                  {m.editor_export_original({ format: actDoc.sourceFormat.toUpperCase() })}
                </DropdownMenuItem>
                {actDoc.sourceFormat !== 'gpx' && (
                  <DropdownMenuItem onClick={() => handleExportCrossFormat('gpx')}>
                    {m.editor_export_gpx()}
                  </DropdownMenuItem>
                )}
                {actDoc.sourceFormat !== 'tcx' && (
                  <DropdownMenuItem onClick={() => handleExportCrossFormat('tcx')}>
                    {m.editor_export_tcx()}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ActivityStats laps={laps} usePace={usePace} />

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

        <LapPaceChart
          laps={laps}
          usePace={usePace}
          hoveredLapId={hoveredLapId}
          onHoverLap={setHoveredLapId}
        />

        {/* Lap table toolbar */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{m.editor_laps()}</h3>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">{m.editor_customize_columns()}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <FileSpreadsheet className="size-3.5" />
              <span className="hidden sm:inline">{m.editor_export_csv()}</span>
            </Button>
          </div>
        </div>

        <LapTable
          laps={laps}
          sourceFormat={actDoc.sourceFormat}
          usePace={usePace}
          onSplit={handleSplitLap}
          onMerge={handleMergeLaps}
          onRename={handleRenameLap}
          hoveredLapId={hoveredLapId}
          onHoverLap={setHoveredLapId}
          customColumns={customColumnConfig}
          builtinVisibilityOverride={builtinVisibility}
        />

        <CustomizeColumnsDialog
          open={customizeOpen}
          onOpenChange={setCustomizeOpen}
          activityId={activityId}
          usePace={usePace}
          allDefinitions={allDefinitions}
          activityColumns={activityColumns}
          builtinVisibility={builtinVisibility}
          onBuiltinVisibilityChange={handleBuiltinVisibilityChange}
        />

        <AlertDialog
          open={crossFormatTarget !== null}
          onOpenChange={(open) => !open && setCrossFormatTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {m.editor_convert_title({ format: crossFormatTarget?.toUpperCase() ?? '' })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {m.editor_convert_desc({
                  source: actDoc.sourceFormat.toUpperCase(),
                  target: crossFormatTarget?.toUpperCase() ?? '',
                })}
                {actDoc.sourceFormat === 'tcx' && m.editor_convert_tcx_loss()}
                {actDoc.sourceFormat === 'gpx' && m.editor_convert_gpx_loss()}
                {m.editor_convert_lossless_hint({ format: actDoc.sourceFormat.toUpperCase() })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmCrossFormat}>
                {m.editor_export_anyway()}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Floating chat button (mobile + desktop when closed) */}
      <button
        onClick={() => setChatOpen(true)}
        className={`fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:bg-primary/90 transition-all duration-200 ${
          chatOpen
            ? 'lg:scale-0 lg:opacity-0 lg:pointer-events-none'
            : 'lg:scale-100 lg:opacity-100'
        }`}
        title={m.editor_ai_assistant()}
      >
        <span className="flex items-center justify-center size-12">
          <Sparkles className="size-5" />
        </span>
        <span className="hidden sm:inline pr-4 text-sm font-medium -ml-1.5">
          {m.editor_ai_short()}
        </span>
      </button>

      {chatOpen && (
        <>
          {/* Desktop: fixed right panel */}
          <div className="hidden lg:flex fixed top-0 right-0 z-40 h-screen w-[380px] flex-col border-l border-border/60 bg-card shadow-lg">
            <ActivityChat
              actDoc={actDoc}
              revision={revision}
              laps={laps}
              onClose={() => setChatOpen(false)}
              onRenameActivity={handleRenameActivity}
              onRenameLap={handleRenameLap}
              onSplitLap={handleSplitLap}
              onMergeLaps={handleMergeLaps}
              columnContext={columnContext}
              columnCallbacks={columnCallbacksObj}
            />
          </div>

          {/* Mobile: bottom sheet */}
          <div className="lg:hidden fixed inset-0 z-50 animate-in fade-in duration-200">
            <div
              className="absolute inset-0 bg-black/20 backdrop-blur-xs"
              onClick={() => setChatOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 h-[85vh] bg-card border-t border-border/60 rounded-t-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-0.5">
                <div className="w-8 h-1 rounded-full bg-muted-foreground/20" />
              </div>
              <ActivityChat
                actDoc={actDoc}
                revision={revision}
                laps={laps}
                onClose={() => setChatOpen(false)}
                onRenameActivity={handleRenameActivity}
                onRenameLap={handleRenameLap}
                onSplitLap={handleSplitLap}
                onMergeLaps={handleMergeLaps}
              />
            </div>
          </div>
        </>
      )}
    </>
  )
}
