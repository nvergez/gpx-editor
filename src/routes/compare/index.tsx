import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { Label } from '~/components/ui/label'
import { BarChart3, Info, TrendingUp } from 'lucide-react'
import { sportIcon, formatActivityDate } from '~/utils/activity-formatting'
import { formatDistance } from '~/utils/gpx-parser'
import { CompareChart, getAggregationLabel, type Aggregation } from '~/components/compare-chart'
import { computeComparisonPoints } from '~/utils/compare-compute'
import * as m from '~/paraglide/messages.js'

const MAX_ACTIVITIES = 10
const AGGREGATIONS: Aggregation[] = ['median', 'mean', 'min', 'max']

type CompareSearch = {
  columnId?: Id<'columnDefinitions'>
  activityIds?: Id<'activities'>[]
  aggregation?: Aggregation
  showBand?: boolean
}

export const Route = createFileRoute('/compare/')({
  validateSearch: (search: Record<string, unknown>): CompareSearch => {
    const columnId =
      typeof search.columnId === 'string' ? (search.columnId as Id<'columnDefinitions'>) : undefined
    const activityIds = Array.isArray(search.activityIds)
      ? (search.activityIds.filter((v): v is string => typeof v === 'string') as Id<'activities'>[])
      : undefined
    const aggregation = AGGREGATIONS.includes(search.aggregation as Aggregation)
      ? (search.aggregation as Aggregation)
      : undefined
    const showBand =
      search.showBand === true || search.showBand === 'true'
        ? true
        : search.showBand === false || search.showBand === 'false'
          ? false
          : undefined
    return { columnId, activityIds, aggregation, showBand }
  },
  component: ComparePage,
})

function ComparePage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const aggregation: Aggregation = search.aggregation ?? 'median'
  const showBand = search.showBand ?? true

  const { data: columns } = useQuery(convexQuery(api.comparisons.listComparableColumns, {}))
  const { data: eligibleActivities } = useQuery({
    ...convexQuery(api.comparisons.listActivitiesForColumn, {
      columnId: search.columnId,
    }),
    enabled: !!search.columnId,
  })

  const selectedColumn = useMemo(
    () => columns?.find((c) => c._id === search.columnId),
    [columns, search.columnId],
  )

  const selectedActivityIds = useMemo((): Id<'activities'>[] => {
    if (search.activityIds) return search.activityIds
    if (!eligibleActivities || !search.columnId) return []
    return eligibleActivities.slice(0, MAX_ACTIVITIES).map((a) => a._id)
  }, [search.activityIds, eligibleActivities, search.columnId])

  const isComputed = selectedColumn?.type === 'computed'
  const enabledBase = !!search.columnId && selectedActivityIds.length >= 2

  // Manual path: values live in columnValues, aggregated per-activity in Convex.
  const manualQuery = useQuery({
    ...convexQuery(api.comparisons.getComparisonData, {
      columnId: search.columnId,
      activityIds: selectedActivityIds,
    }),
    enabled: enabledBase && !isComputed,
  })

  // Computed path: get inputs from Convex (xml urls + operand manual values),
  // then download XMLs + evaluate formula per lap client-side.
  const computedInputsQuery = useQuery({
    ...convexQuery(api.comparisons.getComputedComparisonInputs, {
      columnId: search.columnId,
      activityIds: selectedActivityIds,
    }),
    enabled: enabledBase && isComputed,
  })

  const computedPointsQuery = useQuery({
    queryKey: ['compare-computed-points', search.columnId, selectedActivityIds] as const,
    queryFn: async () => {
      const inputs = computedInputsQuery.data
      if (!inputs?.column?.formula) return []
      return computeComparisonPoints(inputs.column.formula, inputs.activities)
    },
    enabled: isComputed && !!computedInputsQuery.data?.column?.formula,
  })

  const handleColumnChange = useCallback(
    (value: string | null) => {
      if (!value) return
      navigate({
        search: () => ({
          columnId: value as Id<'columnDefinitions'>,
          aggregation: search.aggregation,
          showBand: search.showBand,
        }),
      })
    },
    [navigate, search.aggregation, search.showBand],
  )

  const handleToggleActivity = useCallback(
    (activityId: Id<'activities'>) => {
      const current = new Set(selectedActivityIds)
      if (current.has(activityId)) {
        current.delete(activityId)
      } else {
        if (current.size >= MAX_ACTIVITIES) return
        current.add(activityId)
      }
      const next = Array.from(current)
      navigate({
        search: (prev) => ({
          ...prev,
          activityIds: next.length > 0 ? next : undefined,
        }),
      })
    },
    [navigate, selectedActivityIds],
  )

  const handleAggregationChange = useCallback(
    (value: Aggregation | null) => {
      if (!value) return
      navigate({
        search: (prev) => ({ ...prev, aggregation: value }),
      })
    },
    [navigate],
  )

  const handleToggleBand = useCallback(
    (checked: boolean) => {
      navigate({
        search: (prev) => ({ ...prev, showBand: checked }),
      })
    },
    [navigate],
  )

  const points = isComputed ? (computedPointsQuery.data ?? []) : (manualQuery.data?.points ?? [])
  const atLimit = selectedActivityIds.length >= MAX_ACTIVITIES

  return (
    <div className="w-full">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="size-5" />
        </div>
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{m.compare_title()}</h1>
          <p className="text-sm text-muted-foreground">{m.compare_subtitle()}</p>
        </div>
      </header>

      {columns && columns.length === 0 ? (
        <EmptyState
          title={m.compare_empty_no_shared_title()}
          description={m.compare_empty_no_shared_desc()}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-6">
            <section>
              <Label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {m.compare_column_label()}
              </Label>
              <Select value={search.columnId ?? ''} onValueChange={handleColumnChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.compare_column_placeholder()}>
                    {selectedColumn?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {columns?.map((col) => (
                    <SelectItem key={col._id} value={col._id}>
                      <span className="flex items-center gap-2">
                        <span className="truncate">{col.name}</span>
                        <span className="text-xs text-muted-foreground">({col.activityCount})</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {search.columnId && eligibleActivities && eligibleActivities.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {m.compare_activities_label()}
                  </Label>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {selectedActivityIds.length}/{MAX_ACTIVITIES}
                  </span>
                </div>
                <div className="max-h-[480px] space-y-1 overflow-y-auto rounded-lg border border-border/60 bg-card/60 p-1">
                  {eligibleActivities.map((activity) => {
                    const checked = selectedActivityIds.includes(activity._id)
                    const disabled = !checked && atLimit
                    return (
                      <button
                        key={activity._id}
                        type="button"
                        onClick={() => handleToggleActivity(activity._id)}
                        disabled={disabled}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          checked
                            ? 'bg-primary/10 text-foreground'
                            : disabled
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:bg-accent'
                        }`}
                      >
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                            checked
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background'
                          }`}
                        >
                          {checked && (
                            <svg
                              className="size-3"
                              viewBox="0 0 12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M2 6l2.5 2.5L10 3" />
                            </svg>
                          )}
                        </span>
                        <span className="shrink-0 text-base leading-none">
                          {sportIcon(activity.sport)}
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className="truncate text-sm">{activity.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {activity.activityDate &&
                              formatActivityDate(activity.activityDate, false)}
                            {activity.activityDate && ' · '}
                            {formatDistance(activity.distance)}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {atLimit && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    {m.compare_max_activities_hint({ max: MAX_ACTIVITIES })}
                  </p>
                )}
              </section>
            )}

            {search.columnId && (
              <section className="space-y-4">
                <div>
                  <Label className="mb-2 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {m.compare_aggregation_label()}
                  </Label>
                  <Select value={aggregation} onValueChange={handleAggregationChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{getAggregationLabel(aggregation)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="median">{m.compare_aggregation_median()}</SelectItem>
                      <SelectItem value="mean">{m.compare_aggregation_mean()}</SelectItem>
                      <SelectItem value="min">{m.compare_aggregation_min()}</SelectItem>
                      <SelectItem value="max">{m.compare_aggregation_max()}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="show-band" className="text-sm text-foreground">
                    {m.compare_show_band()}
                  </Label>
                  <Switch id="show-band" checked={showBand} onCheckedChange={handleToggleBand} />
                </div>
              </section>
            )}
          </aside>

          <main>
            {!search.columnId ? (
              <EmptyState
                title={m.compare_empty_pick_column_title()}
                description={m.compare_empty_pick_column_desc()}
              />
            ) : selectedActivityIds.length < 2 ? (
              <EmptyState
                title={m.compare_empty_pick_activities_title()}
                description={m.compare_empty_pick_activities_desc()}
              />
            ) : points.length < 2 ? (
              <EmptyState
                title={m.compare_empty_no_data_title()}
                description={m.compare_empty_no_data_desc()}
              />
            ) : (
              <CompareChart
                points={points}
                aggregation={aggregation}
                showBand={showBand}
                columnName={selectedColumn?.name ?? ''}
              />
            )}
          </main>
        </div>
      )}
    </div>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 px-6 py-16 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <TrendingUp className="size-5" />
      </div>
      <h3 className="mb-1 font-serif text-lg tracking-tight">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
