import { v } from 'convex/values'
import { mutation, query } from './_generated/server'

// ─── Column Definitions ───

export const listDefinitions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return await ctx.db
      .query('columnDefinitions')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .take(200)
  },
})

export const createDefinition = mutation({
  args: {
    name: v.string(),
    type: v.union(v.literal('manual'), v.literal('computed')),
    formula: v.optional(
      v.object({
        operator: v.union(
          v.literal('divide'),
          v.literal('multiply'),
          v.literal('add'),
          v.literal('subtract'),
          v.literal('divideby'),
        ),
        left: v.string(),
        right: v.string(),
      }),
    ),
    isShared: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    return await ctx.db.insert('columnDefinitions', {
      tokenIdentifier: identity.tokenIdentifier,
      name: args.name,
      type: args.type,
      formula: args.formula,
      isShared: args.isShared,
    })
  },
})

export const updateDefinition = mutation({
  args: {
    id: v.id('columnDefinitions'),
    name: v.optional(v.string()),
    formula: v.optional(
      v.object({
        operator: v.union(
          v.literal('divide'),
          v.literal('multiply'),
          v.literal('add'),
          v.literal('subtract'),
          v.literal('divideby'),
        ),
        left: v.string(),
        right: v.string(),
      }),
    ),
    isShared: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const col = await ctx.db.get(args.id)
    if (!col || col.tokenIdentifier !== identity.tokenIdentifier) {
      throw new Error('Column not found')
    }
    const patch: Record<string, unknown> = {}
    if (args.name !== undefined) patch.name = args.name
    if (args.formula !== undefined) patch.formula = args.formula
    if (args.isShared !== undefined) patch.isShared = args.isShared
    await ctx.db.patch(args.id, patch)
  },
})

export const deleteDefinition = mutation({
  args: { id: v.id('columnDefinitions') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const col = await ctx.db.get(args.id)
    if (!col || col.tokenIdentifier !== identity.tokenIdentifier) {
      throw new Error('Column not found')
    }

    // Cascade: delete computed columns that depend on this manual column
    if (col.type === 'manual') {
      const allCols = await ctx.db
        .query('columnDefinitions')
        .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
        .take(200)
      for (const dep of allCols) {
        if (
          dep.type === 'computed' &&
          dep.formula &&
          (dep.formula.left === args.id || dep.formula.right === args.id)
        ) {
          // Recursively delete dependent (but no deeper — computed can't reference computed)
          const depLinks = await ctx.db
            .query('activityColumns')
            .withIndex('by_columnId', (q) => q.eq('columnId', dep._id))
            .take(500)
          for (const link of depLinks) await ctx.db.delete(link._id)
          await ctx.db.delete(dep._id)
        }
      }
    }

    // Delete all activity-column links
    const links = await ctx.db
      .query('activityColumns')
      .withIndex('by_columnId', (q) => q.eq('columnId', args.id))
      .take(500)
    for (const link of links) {
      await ctx.db.delete(link._id)
    }
    // Delete all column values
    const values = await ctx.db
      .query('columnValues')
      .withIndex('by_columnId', (q) => q.eq('columnId', args.id))
      .take(500)
    for (const val of values) {
      await ctx.db.delete(val._id)
    }
    await ctx.db.delete(args.id)
  },
})

// ─── Activity Columns (junction) ───

export const listActivityColumns = query({
  args: { activityId: v.id('activities') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return await ctx.db
      .query('activityColumns')
      .withIndex('by_tokenIdentifier_and_activityId', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier).eq('activityId', args.activityId),
      )
      .take(100)
  },
})

export const addColumnToActivity = mutation({
  args: {
    activityId: v.id('activities'),
    columnId: v.id('columnDefinitions'),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    return await ctx.db.insert('activityColumns', {
      tokenIdentifier: identity.tokenIdentifier,
      activityId: args.activityId,
      columnId: args.columnId,
      order: args.order,
    })
  },
})

export const removeColumnFromActivity = mutation({
  args: { id: v.id('activityColumns') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const link = await ctx.db.get(args.id)
    if (!link || link.tokenIdentifier !== identity.tokenIdentifier) {
      throw new Error('Not found')
    }
    // Also delete column values for this activity+column
    const values = await ctx.db
      .query('columnValues')
      .withIndex('by_tokenIdentifier_and_activityId_and_columnId', (q) =>
        q
          .eq('tokenIdentifier', identity.tokenIdentifier)
          .eq('activityId', link.activityId)
          .eq('columnId', link.columnId),
      )
      .take(500)
    for (const val of values) {
      await ctx.db.delete(val._id)
    }
    await ctx.db.delete(args.id)
  },
})

// ─── Column Values ───

export const listValues = query({
  args: { activityId: v.id('activities') },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return await ctx.db
      .query('columnValues')
      .withIndex('by_tokenIdentifier_and_activityId_and_columnId', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier).eq('activityId', args.activityId),
      )
      .take(5000)
  },
})

export const setValue = mutation({
  args: {
    activityId: v.id('activities'),
    columnId: v.id('columnDefinitions'),
    lapId: v.string(),
    value: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const match = await ctx.db
      .query('columnValues')
      .withIndex('by_tokenIdentifier_and_activityId_and_columnId_and_lapId', (q) =>
        q
          .eq('tokenIdentifier', identity.tokenIdentifier)
          .eq('activityId', args.activityId)
          .eq('columnId', args.columnId)
          .eq('lapId', args.lapId),
      )
      .first()

    if (match) {
      await ctx.db.patch(match._id, { value: args.value })
    } else {
      await ctx.db.insert('columnValues', {
        tokenIdentifier: identity.tokenIdentifier,
        activityId: args.activityId,
        columnId: args.columnId,
        lapId: args.lapId,
        value: args.value,
      })
    }
  },
})

export const clearValue = mutation({
  args: {
    activityId: v.id('activities'),
    columnId: v.id('columnDefinitions'),
    lapId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const match = await ctx.db
      .query('columnValues')
      .withIndex('by_tokenIdentifier_and_activityId_and_columnId_and_lapId', (q) =>
        q
          .eq('tokenIdentifier', identity.tokenIdentifier)
          .eq('activityId', args.activityId)
          .eq('columnId', args.columnId)
          .eq('lapId', args.lapId),
      )
      .first()

    if (match) {
      await ctx.db.delete(match._id)
    }
  },
})
