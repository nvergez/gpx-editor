import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import type { GpxData, GpxLap } from '~/utils/gpx-parser'
import { parseActivityFile, exportGpx, exportTcx, splitLapAtIndex, createLap } from '~/utils/gpx-parser'
import { GpxUpload } from './GpxUpload'
import { LapList } from './LapList'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Download, RotateCcw, ChevronDown } from 'lucide-react'

type ExportFormat = 'gpx' | 'tcx'

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
  const [gpxData, setGpxData] = useState<GpxData | null>(null)

  const handleFileLoaded = useCallback((xmlString: string) => {
    try {
      const data = parseActivityFile(xmlString)
      if (data.laps.length === 0) {
        toast.error('No tracks/laps found in this file')
        return
      }
      setGpxData(data)
      toast.success(`Loaded "${data.name}" with ${data.laps.length} lap(s)`)
    } catch (e) {
      toast.error(`Failed to parse file: ${e instanceof Error ? e.message : 'Unknown error'}`)
    }
  }, [])

  const handleDeleteLap = useCallback((lapId: string) => {
    setGpxData((prev) => {
      if (!prev) return prev
      const newLaps = prev.laps.filter((l) => l.id !== lapId)
      return { ...prev, laps: newLaps }
    })
    toast.success('Lap deleted')
  }, [])

  const handleSplitLap = useCallback((lapId: string, pointIndex: number) => {
    setGpxData((prev) => {
      if (!prev) return prev
      const lapIndex = prev.laps.findIndex((l) => l.id === lapId)
      if (lapIndex === -1) return prev
      try {
        const [first, second] = splitLapAtIndex(prev.laps[lapIndex], pointIndex)
        const newLaps = [...prev.laps]
        newLaps.splice(lapIndex, 1, first, second)
        return { ...prev, laps: newLaps }
      } catch {
        return prev
      }
    })
    toast.success('Lap split into two')
  }, [])

  const handleMergeLaps = useCallback((lapIds: [string, string]) => {
    setGpxData((prev) => {
      if (!prev) return prev
      const [id1, id2] = lapIds
      const idx1 = prev.laps.findIndex((l) => l.id === id1)
      const idx2 = prev.laps.findIndex((l) => l.id === id2)
      if (idx1 === -1 || idx2 === -1) return prev

      const lap1 = prev.laps[Math.min(idx1, idx2)]
      const lap2 = prev.laps[Math.max(idx1, idx2)]
      const mergedPoints = [...lap1.points, ...lap2.points]
      const merged = createLap(`${lap1.name} + ${lap2.name}`, mergedPoints)

      const newLaps = prev.laps.filter((l) => l.id !== id1 && l.id !== id2)
      newLaps.splice(Math.min(idx1, idx2), 0, merged)
      return { ...prev, laps: newLaps }
    })
    toast.success('Laps merged')
  }, [])

  const handleRenameLap = useCallback((lapId: string, newName: string) => {
    setGpxData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        laps: prev.laps.map((l) => (l.id === lapId ? { ...l, name: newName } : l)),
      }
    })
  }, [])

  const handleReorderLaps = useCallback((laps: GpxLap[]) => {
    setGpxData((prev) => {
      if (!prev) return prev
      return { ...prev, laps }
    })
  }, [])

  const handleExport = useCallback(
    (format: ExportFormat) => {
      if (!gpxData) return
      const baseName = sanitizeFilename(gpxData.name)

      if (format === 'tcx') {
        downloadFile(exportTcx(gpxData), `${baseName}_edited.tcx`, 'application/vnd.garmin.tcx+xml')
        toast.success('TCX file exported')
      } else {
        downloadFile(exportGpx(gpxData), `${baseName}_edited.gpx`, 'application/gpx+xml')
        toast.success('GPX file exported')
      }
    },
    [gpxData],
  )

  const handleReset = useCallback(() => {
    setGpxData(null)
  }, [])

  if (!gpxData) {
    return <GpxUpload onFileLoaded={handleFileLoaded} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{gpxData.name}</h2>
          <p className="text-sm text-muted-foreground">
            {gpxData.laps.length} lap(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" />
            New file
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button />}>
                <Download className="mr-2 h-4 w-4" />
                Export
                <ChevronDown className="ml-2 h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('gpx')}>
                Export as GPX
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('tcx')}>
                Export as TCX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <LapList
        laps={gpxData.laps}
        onDelete={handleDeleteLap}
        onSplit={handleSplitLap}
        onMerge={handleMergeLaps}
        onRename={handleRenameLap}
        onReorder={handleReorderLaps}
      />
    </div>
  )
}
