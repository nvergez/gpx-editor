import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import type { ActivityDocument } from '~/utils/dom-model'
import type { LapHandle } from '~/utils/dom-model'
import { exportGpx, exportTcx } from '~/utils/gpx-parser'
import {
  parseToDocument,
  getLapHandles,
  countLaps,
  deleteLap,
  splitLap,
  mergeLaps,
  renameLap,
  reorderLaps,
  exportOriginal,
  getTrackPointsFromElement,
} from '~/utils/dom-operations'
import { GpxUpload } from './gpx-upload'
import { LapTable } from './lap-table'
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
import { RotateCcw, ChevronDown, Info, X, FileDown } from 'lucide-react'

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

export function GpxEditor() {
  const [actDoc, setActDoc] = useState<ActivityDocument | null>(null)
  const [revision, setRevision] = useState(0)
  const [showGpxHint, setShowGpxHint] = useState(false)
  const [crossFormatTarget, setCrossFormatTarget] = useState<'gpx' | 'tcx' | null>(null)

  const laps = useMemo(() => {
    if (!actDoc) return []
    // revision is used to trigger recomputation after DOM mutations
    void revision
    return getLapHandles(actDoc)
  }, [actDoc, revision])

  const bumpRevision = useCallback(() => setRevision((r) => r + 1), [])

  const handleFileLoaded = useCallback((xmlString: string) => {
    try {
      const doc = parseToDocument(xmlString)
      const lapCount = countLaps(doc)
      if (lapCount === 0) {
        toast.error('No tracks/laps found in this file')
        return
      }
      setActDoc(doc)
      setRevision(0)
      setShowGpxHint(doc.sourceFormat === 'gpx' && lapCount === 1)
      toast.success(`Loaded "${doc.name}" with ${lapCount} lap(s)`)
    } catch (e) {
      toast.error(`Failed to parse file: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }, [])

  const handleDeleteLap = useCallback(
    (lapId: string) => {
      if (!actDoc) return
      deleteLap(actDoc, lapId)
      bumpRevision()
      toast.success('Lap deleted')
    },
    [actDoc, bumpRevision],
  )

  const handleSplitLap = useCallback(
    (lapId: string, pointIndex: number) => {
      if (!actDoc) return
      splitLap(actDoc, lapId, pointIndex)
      bumpRevision()
      toast.success('Lap split into two')
    },
    [actDoc, bumpRevision],
  )

  const handleMergeLaps = useCallback(
    (lapIds: [string, string]) => {
      if (!actDoc) return
      mergeLaps(actDoc, lapIds[0], lapIds[1])
      bumpRevision()
      toast.success('Laps merged')
    },
    [actDoc, bumpRevision],
  )

  const handleRenameLap = useCallback(
    (lapId: string, newName: string) => {
      if (!actDoc) return
      renameLap(actDoc, lapId, newName)
      bumpRevision()
    },
    [actDoc, bumpRevision],
  )

  const handleReorderLaps = useCallback(
    (reorderedLaps: LapHandle[]) => {
      if (!actDoc) return
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

      // Build GpxData-like structure for cross-format export
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

  const handleReset = useCallback(() => {
    setActDoc(null)
    setRevision(0)
    setShowGpxHint(false)
  }, [])

  if (!actDoc) {
    return <GpxUpload onFileLoaded={handleFileLoaded} />
  }

  return (
    <div className="space-y-6">
      {showGpxHint && (
        <div className="flex items-start gap-3 rounded-xl border border-chart-3/30 bg-chart-3/5 p-4 text-sm text-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-chart-3" />
          <div className="flex-1">
            <p className="font-medium">Only 1 lap detected</p>
            <p className="mt-0.5 text-muted-foreground">
              GPX files often merge all laps into a single track. If your activity has multiple
              laps, try importing the TCX version instead to preserve lap data.
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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {actDoc.sourceFormat.toUpperCase()} Activity
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl tracking-tight text-foreground leading-tight">
            {actDoc.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {laps.length} lap{laps.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="ghost" onClick={handleReset} size="sm">
            <RotateCcw className="size-3.5" />
            New file
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" />}>
              <FileDown className="size-3.5" />
              Export
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

      <LapTable
        laps={laps}
        sourceFormat={actDoc.sourceFormat}
        onDelete={handleDeleteLap}
        onSplit={handleSplitLap}
        onMerge={handleMergeLaps}
        onRename={handleRenameLap}
        onReorder={handleReorderLaps}
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
