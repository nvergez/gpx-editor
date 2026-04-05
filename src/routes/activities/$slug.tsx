import { useState, useCallback, useEffect, useRef } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useConvexMutation, useConvexAction, convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id, Doc } from '../../../convex/_generated/dataModel'
import { Loader2 } from 'lucide-react'
import { GpxEditor } from '~/components/gpx-editor'
import { authClient } from '~/lib/auth-client'
import { uploadXml } from '~/utils/xml-storage'
import * as m from '~/paraglide/messages.js'

export const Route = createFileRoute('/activities/$slug')({
  component: ActivityPage,
})

function ActivityPage() {
  const { slug } = Route.useParams()
  const navigate = useNavigate()
  const { data: session, isPending: sessionPending } = authClient.useSession()

  const { data: activity, isLoading: activityLoading } = useQuery(
    convexQuery(api.activities.getBySlug, { slug }),
  )

  if (sessionPending || activityLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session?.session) {
    navigate({ to: '/' })
    return null
  }

  if (!activity) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">{m.activity_not_found()}</p>
        <button
          onClick={() => navigate({ to: '/' })}
          className="mt-4 text-sm text-primary underline underline-offset-2"
        >
          {m.common_go_back()}
        </button>
      </div>
    )
  }

  return <ActivityEditor key={activity._id} activity={activity} />
}

function ActivityEditor({ activity }: { activity: Doc<'activities'> }) {
  const [xmlContent, setXmlContent] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getXmlContentFn = useConvexAction(api.activities.getXmlContent)
  const generateUploadUrlFn = useConvexMutation(api.activities.generateUploadUrl)
  const updateActivityFn = useConvexMutation(api.activities.update)

  const activityId = activity._id

  useEffect(() => {
    let cancelled = false
    getXmlContentFn({ activityId })
      .then((xml) => {
        if (cancelled) return
        if (!xml) {
          setError(m.activity_not_found())
        } else {
          setXmlContent(xml)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : m.activity_failed_to_load())
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activityId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveAbortRef = useRef<AbortController | null>(null)

  const handleSave = useCallback(
    async (data: {
      activityId: Id<'activities'>
      xmlContent: string
      name: string
      distance: number
      duration: number
      elevationGain?: number
      lapCount: number
    }) => {
      if (saveAbortRef.current) saveAbortRef.current.abort()
      const controller = new AbortController()
      saveAbortRef.current = controller

      try {
        const xmlStorageId = await uploadXml(() => generateUploadUrlFn({}), data.xmlContent)
        if (controller.signal.aborted) return

        await updateActivityFn({
          activityId: data.activityId,
          xmlStorageId,
          name: data.name,
          distance: data.distance,
          duration: data.duration,
          elevationGain: data.elevationGain,
          lapCount: data.lapCount,
        })
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Failed to save activity:', err)
        }
      }
    },
    [generateUploadUrlFn, updateActivityFn],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !xmlContent) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-muted-foreground">{error ?? m.activity_not_found()}</p>
        <button
          onClick={() => window.history.back()}
          className="mt-4 text-sm text-primary underline underline-offset-2"
        >
          {m.common_go_back()}
        </button>
      </div>
    )
  }

  return (
    <GpxEditor
      key={activityId}
      activityId={activityId}
      initialXml={xmlContent}
      source={activity.source}
      sport={activity.sport}
      stravaActivityId={activity.stravaActivityId ?? undefined}
      onSave={handleSave}
    />
  )
}
