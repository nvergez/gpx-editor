import { useState, useRef, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import type { Doc } from '../../convex/_generated/dataModel'
import type { Id } from '../../convex/_generated/dataModel'
import { formatDistance, formatDuration } from '~/utils/gpx-parser'
import { sportIcon, formatActivityDate } from '~/utils/activity-formatting'
import { Clock, Route, Mountain, Trash2, Upload, StretchHorizontal, Pencil } from 'lucide-react'
import { StravaLogo } from '~/utils/strava'
import { ActivitySearch } from './activity-search'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'

interface ActivityListProps {
  activities: Doc<'activities'>[]
  onDelete: (activityId: Id<'activities'>) => void
  onRename: (activityId: Id<'activities'>, name: string) => void
}

export function ActivityList({ activities, onDelete, onRename }: ActivityListProps) {
  const [editingId, setEditingId] = useState<Id<'activities'> | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  function startRename(activity: Doc<'activities'>) {
    setEditingId(activity._id)
    setEditValue(activity.name)
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-serif text-xl tracking-tight text-foreground">Your activities</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {activities.length} activit{activities.length === 1 ? 'y' : 'ies'}
          </span>
          <ActivitySearch activities={activities} />
        </div>
      </div>

      <div className="space-y-1.5">
        {activities.map((activity) => {
          const isEditing = editingId === activity._id

          const content = (
            <>
              <span className="text-lg shrink-0">{sportIcon(activity.sport)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <input
                      ref={inputRef}
                      className="text-sm font-medium bg-transparent border-b border-foreground/30 outline-none py-0 px-0 w-full"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="text-sm font-medium truncate">{activity.name}</p>
                  )}
                  {activity.source === 'strava' && activity.stravaActivityId && (
                    <a
                      href={`https://www.strava.com/activities/${activity.stravaActivityId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="View on Strava"
                    >
                      <StravaLogo className="size-3 shrink-0 text-[#FC4C02]/60 hover:text-[#FC4C02] transition-colors" />
                    </a>
                  )}
                  {activity.source === 'strava' && !activity.stravaActivityId && (
                    <StravaLogo className="size-3 shrink-0 text-[#FC4C02]/60" />
                  )}
                  {activity.source === 'file' && (
                    <Upload className="size-3 shrink-0 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  {activity.activityDate && (
                    <span>{formatActivityDate(activity.activityDate)}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Route className="size-3" />
                    {formatDistance(activity.distance)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {formatDuration(activity.duration)}
                  </span>
                  {activity.elevationGain != null && activity.elevationGain > 0 && (
                    <span className="flex items-center gap-1">
                      <Mountain className="size-3" />
                      {Math.round(activity.elevationGain)}m
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <StretchHorizontal className="size-3" />
                    {activity.lapCount} lap{activity.lapCount !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="shrink-0 rounded-md p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.preventDefault()
                  }}
                >
                  <MoreHorizontal className="size-4 text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      startRename(activity)
                    }}
                  >
                    <Pencil className="size-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      onDelete(activity._id)
                    }}
                    className="text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )

          if (isEditing) {
            return (
              <div
                key={activity._id}
                className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-muted/60 cursor-pointer"
              >
                {content}
              </div>
            )
          }

          return (
            <Link
              key={activity._id}
              to="/activities/$slug"
              params={{ slug: activity.slug }}
              className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-muted/60 cursor-pointer"
            >
              {content}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
