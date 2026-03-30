import { useState, useCallback } from 'react'
import { useConvexMutation } from '@convex-dev/react-query'
import { useNavigate } from '@tanstack/react-router'
import { api } from '../../convex/_generated/api'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { GpxUpload } from './gpx-upload'
import { parseToDocument, getLapHandles, countLaps, exportOriginal } from '~/utils/dom-operations'
import { uploadXml } from '~/utils/xml-storage'

export function ActivityHub() {
  const [isLoading, setIsLoading] = useState(false)
  const navigate = useNavigate()

  const generateUploadUrlFn = useConvexMutation(api.activities.generateUploadUrl)
  const createActivityFn = useConvexMutation(api.activities.create)

  const handleFileLoaded = useCallback(
    async (xmlString: string, source: 'file' | 'strava' = 'file', stravaActivityId?: number) => {
      try {
        const doc = parseToDocument(xmlString)
        const lapCount = countLaps(doc)
        if (lapCount === 0) {
          toast.error('No tracks/laps found in this file')
          return
        }

        setIsLoading(true)

        const laps = getLapHandles(doc)
        let totalDistance = 0
        let totalDuration = 0
        let totalElevationGain = 0
        for (const lap of laps) {
          totalDistance += lap.stats.distance
          totalDuration += lap.stats.duration
          totalElevationGain += lap.stats.elevationGain ?? 0
        }

        // Extract activity date
        const firstLap = laps[0]
        let activityDate: string | undefined
        if (firstLap) {
          const firstEl = firstLap.element
          const timeEl =
            firstEl.getElementsByTagName('time')[0] || firstEl.getElementsByTagName('Time')[0]
          if (timeEl?.textContent) {
            activityDate = timeEl.textContent
          }
        }
        if (!activityDate && doc.sourceFormat === 'tcx') {
          const lapEl = doc.doc.getElementsByTagName('Lap')[0]
          const startTime = lapEl?.getAttribute('StartTime')
          if (startTime) activityDate = startTime
        }

        let sport: string | undefined
        if (doc.sourceFormat === 'tcx') {
          const activity = doc.doc.getElementsByTagName('Activity')[0]
          sport = activity?.getAttribute('Sport') ?? undefined
        }

        const xmlContent = exportOriginal(doc)

        // Upload XML to file storage
        const xmlStorageId = await uploadXml(() => generateUploadUrlFn({}), xmlContent)

        const { slug } = await createActivityFn({
          name: doc.name,
          sourceFormat: doc.sourceFormat,
          xmlStorageId,
          source,
          stravaActivityId,
          sport,
          distance: totalDistance,
          duration: totalDuration,
          elevationGain: totalElevationGain || undefined,
          lapCount: laps.length,
          activityDate,
        })

        toast.success(`Loaded "${doc.name}" with ${laps.length} lap(s)`)
        navigate({ to: '/activities/$slug', params: { slug } })
      } catch (e) {
        toast.error(`Failed to save activity: ${e instanceof Error ? e.message : 'Unknown error'}`)
      } finally {
        setIsLoading(false)
      }
    },
    [generateUploadUrlFn, createActivityFn, navigate],
  )

  const handleStravaFileLoaded = useCallback(
    (xmlString: string, stravaActivityId?: number) => {
      handleFileLoaded(xmlString, 'strava', stravaActivityId)
    },
    [handleFileLoaded],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <GpxUpload
      onFileLoaded={(xml) => handleFileLoaded(xml, 'file')}
      onStravaFileLoaded={handleStravaFileLoaded}
    />
  )
}
