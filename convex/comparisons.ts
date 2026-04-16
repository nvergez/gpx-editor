import { v } from 'convex/values'
import { query } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

// Sort ascending by activity date, falling back to name. Rows with no date
// come before dated rows; pass `dir: 'desc'` to reverse the date order.
function compareByActivityDate<T extends { activityDate?: string; name: string }>(
  a: T,
  b: T,
  dir: 'asc' | 'desc' = 'asc',
): number {
  const da = a.activityDate ?? ''
  const db = b.activityDate ?? ''
  if (da && db) return dir === 'asc' ? da.localeCompare(db) : db.localeCompare(da)
  if (da) return -1
  if (db) return 1
  return a.name.localeCompare(b.name)
}

export type ComparableColumn = {
  _id: Id<'columnDefinitions'>
  name: string
  type: 'manual' | 'computed'
  activityCount: number
}

export const listComparableColumns = query({
  args: {},
  handler: async (ctx): Promise<ComparableColumn[]> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    // Sweep all user-owned activityColumns once and count per columnId,
    // rather than N+1 querying each column definition's links.
    const [definitions, ownedLinks] = await Promise.all([
      ctx.db
        .query('columnDefinitions')
        .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
        .collect(),
      ctx.db
        .query('activityColumns')
        .withIndex('by_tokenIdentifier_and_activityId', (q) =>
          q.eq('tokenIdentifier', identity.tokenIdentifier),
        )
        .collect(),
    ])

    const countByColumn = new Map<Id<'columnDefinitions'>, number>()
    for (const link of ownedLinks) {
      countByColumn.set(link.columnId, (countByColumn.get(link.columnId) ?? 0) + 1)
    }

    const results: ComparableColumn[] = []
    for (const def of definitions) {
      const count = countByColumn.get(def._id) ?? 0
      if (count >= 2) {
        results.push({ _id: def._id, name: def.name, type: def.type, activityCount: count })
      }
    }

    results.sort((a, b) => b.activityCount - a.activityCount || a.name.localeCompare(b.name))
    return results
  },
})

export type ActivityWithColumn = {
  _id: Id<'activities'>
  name: string
  slug: string
  sport?: string
  activityDate?: string
  distance: number
}

export const listActivitiesForColumn = query({
  args: { columnId: v.optional(v.id('columnDefinitions')) },
  handler: async (ctx, args): Promise<ActivityWithColumn[]> => {
    const identity = await ctx.auth.getUserIdentity()
    const columnId = args.columnId
    if (!identity || !columnId) return []

    const def = await ctx.db.get(columnId)
    if (!def || def.tokenIdentifier !== identity.tokenIdentifier) return []

    const links = await ctx.db
      .query('activityColumns')
      .withIndex('by_columnId', (q) => q.eq('columnId', columnId))
      .collect()
    const owned = links.filter((l) => l.tokenIdentifier === identity.tokenIdentifier)

    const fetched = await Promise.all(owned.map((link) => ctx.db.get(link.activityId)))
    const activities: ActivityWithColumn[] = []
    for (const activity of fetched) {
      if (!activity || activity.tokenIdentifier !== identity.tokenIdentifier) continue
      activities.push({
        _id: activity._id,
        name: activity.name,
        slug: activity.slug,
        sport: activity.sport,
        activityDate: activity.activityDate,
        distance: activity.distance,
      })
    }

    activities.sort((a, b) => compareByActivityDate(a, b, 'desc'))

    return activities
  },
})

export type ComparisonActivityPoint = {
  activity: {
    _id: Id<'activities'>
    name: string
    slug: string
    sport?: string
    activityDate?: string
  }
  values: number[]
  weights?: { distance: number[]; duration: number[] }
  operandValues?: { left: number[]; right: number[] }
}

export const getComparisonData = query({
  args: {
    columnId: v.optional(v.id('columnDefinitions')),
    activityIds: v.array(v.id('activities')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    column: { _id: Id<'columnDefinitions'>; name: string; type: 'manual' | 'computed' } | null
    points: ComparisonActivityPoint[]
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    const columnId = args.columnId
    if (!identity || !columnId) return { column: null, points: [] }

    const def = await ctx.db.get(columnId)
    if (!def || def.tokenIdentifier !== identity.tokenIdentifier) {
      return { column: null, points: [] }
    }

    const perActivity = await Promise.all(
      args.activityIds.map(async (activityId): Promise<ComparisonActivityPoint | null> => {
        const [activity, values] = await Promise.all([
          ctx.db.get(activityId),
          ctx.db
            .query('columnValues')
            .withIndex('by_tokenIdentifier_and_activityId_and_columnId', (q) =>
              q
                .eq('tokenIdentifier', identity.tokenIdentifier)
                .eq('activityId', activityId)
                .eq('columnId', columnId),
            )
            .collect(),
        ])
        if (!activity || activity.tokenIdentifier !== identity.tokenIdentifier) return null

        // Skip laps without a value (filtered implicitly — only stored values are returned)
        const numericValues = values.map((v) => v.value).filter((v) => Number.isFinite(v))
        if (numericValues.length === 0) return null

        return {
          activity: {
            _id: activity._id,
            name: activity.name,
            slug: activity.slug,
            sport: activity.sport,
            activityDate: activity.activityDate,
          },
          values: numericValues,
        }
      }),
    )

    const points = perActivity.filter((p): p is ComparisonActivityPoint => p !== null)
    points.sort((a, b) => compareByActivityDate(a.activity, b.activity, 'asc'))

    return {
      column: { _id: def._id, name: def.name, type: def.type },
      points,
    }
  },
})

export type ComputedActivityInput = {
  activity: {
    _id: Id<'activities'>
    name: string
    slug: string
    sport?: string
    activityDate?: string
  }
  xmlUrl: string | null
  // Manual column values referenced by the formula, keyed by columnId.
  operandValues: Record<string, Array<{ lapId: string; value: number }>>
}

/**
 * Returns the raw data needed to evaluate a computed column across activities
 * on the client. Computed columns cannot be evaluated server-side because the
 * built-in operands (distance, duration, HR, etc.) live in the XML file stored
 * in _storage and require DOM-based parsing only available in the browser.
 */
export const getComputedComparisonInputs = query({
  args: {
    columnId: v.optional(v.id('columnDefinitions')),
    activityIds: v.array(v.id('activities')),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    column: {
      _id: Id<'columnDefinitions'>
      name: string
      type: 'manual' | 'computed'
      formula?: {
        operator: 'divide' | 'multiply' | 'add' | 'subtract' | 'divideby'
        left: string
        right: string
      }
      manualOperandNames?: Record<string, string>
    } | null
    activities: ComputedActivityInput[]
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    const columnId = args.columnId
    if (!identity || !columnId) return { column: null, activities: [] }

    const def = await ctx.db.get(columnId)
    if (!def || def.tokenIdentifier !== identity.tokenIdentifier || def.type !== 'computed') {
      return { column: null, activities: [] }
    }

    const formula = def.formula
    if (!formula) return { column: null, activities: [] }

    // Operands are either built-in LapStats keys (e.g. "distance") or Convex
    // column IDs. Built-ins are evaluated client-side from parsed XML; only
    // manual-column operands need their values fetched here.
    const normalizedOperands = [formula.left, formula.right]
      .map((operand) => ctx.db.normalizeId('columnDefinitions', operand))
      .filter((id): id is Id<'columnDefinitions'> => id !== null)

    const operandDocs = await Promise.all(normalizedOperands.map((id) => ctx.db.get(id)))
    const operandColumnIds = new Set<Id<'columnDefinitions'>>()
    const manualOperandNames: Record<string, string> = {}
    for (const doc of operandDocs) {
      if (doc && doc.tokenIdentifier === identity.tokenIdentifier) {
        operandColumnIds.add(doc._id)
        manualOperandNames[doc._id] = doc.name
      }
    }

    const fetched = await Promise.all(
      args.activityIds.map(async (activityId): Promise<ComputedActivityInput | null> => {
        const activity: Doc<'activities'> | null = await ctx.db.get(activityId)
        if (!activity || activity.tokenIdentifier !== identity.tokenIdentifier) return null

        const [xmlUrl, operandEntries] = await Promise.all([
          ctx.storage.getUrl(activity.xmlStorageId),
          Promise.all(
            [...operandColumnIds].map(async (operandId) => {
              const rows = await ctx.db
                .query('columnValues')
                .withIndex('by_tokenIdentifier_and_activityId_and_columnId', (q) =>
                  q
                    .eq('tokenIdentifier', identity.tokenIdentifier)
                    .eq('activityId', activityId)
                    .eq('columnId', operandId),
                )
                .collect()
              return [
                operandId as string,
                rows.map((r) => ({ lapId: r.lapId, value: r.value })),
              ] as const
            }),
          ),
        ])

        return {
          activity: {
            _id: activity._id,
            name: activity.name,
            slug: activity.slug,
            sport: activity.sport,
            activityDate: activity.activityDate,
          },
          xmlUrl,
          operandValues: Object.fromEntries(operandEntries),
        }
      }),
    )

    const activities = fetched.filter((a): a is ComputedActivityInput => a !== null)
    activities.sort((a, b) => compareByActivityDate(a.activity, b.activity, 'asc'))

    return {
      column: {
        _id: def._id,
        name: def.name,
        type: def.type,
        formula,
        manualOperandNames,
      },
      activities,
    }
  },
})
