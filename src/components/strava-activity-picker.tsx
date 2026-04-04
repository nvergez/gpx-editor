import { useState, useCallback, useEffect } from 'react'
import { useConvexAction } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { toast } from 'sonner'
import { Loader2, ChevronDown, Clock, Route, Mountain } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { ScrollArea } from '~/components/ui/scroll-area'
import { stravaToTcx } from '~/utils/strava-to-tcx'
import { formatDistance, formatDuration } from '~/utils/gpx-parser'
import { sportIcon, formatActivityDate } from '~/utils/activity-formatting'
import * as m from '~/paraglide/messages.js'

interface StravaActivityPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onFileLoaded: (xmlString: string, stravaActivityId?: number) => void
}

interface ActivitySummary {
  id: number
  name: string
  type: string
  sportType: string
  startDate: string
  distance: number
  movingTime: number
  elapsedTime: number
  totalElevationGain: number
  hasHeartrate: boolean
}

export function StravaActivityPicker({
  open,
  onOpenChange,
  onFileLoaded,
}: StravaActivityPickerProps) {
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isLoadingActivity, setIsLoadingActivity] = useState<number | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

  const listActivities = useConvexAction(api.strava.listActivities)
  const fetchStreams = useConvexAction(api.strava.fetchActivityStreams)

  const loadActivities = useCallback(
    async (pageNum: number, append = false) => {
      setIsLoadingList(true)
      try {
        const perPage = 20
        const result = await listActivities({ page: pageNum, perPage })
        if (append) {
          setActivities((prev) => [...prev, ...result])
        } else {
          setActivities(result)
        }
        setHasMore(result.length === perPage)
        setPage(pageNum)
        setHasLoaded(true)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load activities')
      } finally {
        setIsLoadingList(false)
      }
    },
    [listActivities],
  )

  useEffect(() => {
    if (open && !hasLoaded) {
      loadActivities(1)
    }
    if (!open) {
      setHasLoaded(false)
      setActivities([])
      setPage(1)
      setHasMore(true)
    }
  }, [open, hasLoaded, loadActivities])

  const handleLoadMore = useCallback(() => {
    loadActivities(page + 1, true)
  }, [loadActivities, page])

  const handleSelectActivity = useCallback(
    async (activity: ActivitySummary) => {
      setIsLoadingActivity(activity.id)
      try {
        const data = await fetchStreams({ activityId: activity.id })
        const tcxString = stravaToTcx(data)
        onFileLoaded(tcxString, activity.id)
        onOpenChange(false)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to import activity')
      } finally {
        setIsLoadingActivity(null)
      }
    },
    [fetchStreams, onFileLoaded, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{m.strava_import_title()}</DialogTitle>
          <DialogDescription>{m.strava_import_desc()}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] -mx-4 px-4">
          {!hasLoaded && isLoadingList ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {m.strava_no_activities()}
            </p>
          ) : (
            <div className="space-y-1.5">
              {activities.map((activity) => (
                <button
                  key={activity.id}
                  onClick={() => handleSelectActivity(activity)}
                  disabled={isLoadingActivity !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/80 disabled:opacity-50"
                >
                  <span className="text-lg shrink-0">{sportIcon(activity.sportType)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{activity.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{formatActivityDate(activity.startDate)}</span>
                      <span className="flex items-center gap-1">
                        <Route className="size-3" />
                        {formatDistance(activity.distance)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatDuration(activity.movingTime)}
                      </span>
                      {activity.totalElevationGain > 0 && (
                        <span className="flex items-center gap-1">
                          <Mountain className="size-3" />
                          {Math.round(activity.totalElevationGain)}m
                        </span>
                      )}
                    </div>
                  </div>
                  {isLoadingActivity === activity.id && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </button>
              ))}

              {hasMore && (
                <div className="pt-2 pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={handleLoadMore}
                    disabled={isLoadingList}
                  >
                    {isLoadingList ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                    {m.strava_load_more()}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
