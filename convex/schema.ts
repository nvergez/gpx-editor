import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  stravaConnections: defineTable({
    tokenIdentifier: v.string(),
    athleteId: v.number(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    athleteName: v.optional(v.string()),
    scope: v.string(),
  }).index('by_tokenIdentifier', ['tokenIdentifier']),

  activities: defineTable({
    tokenIdentifier: v.string(),
    slug: v.string(),
    name: v.string(),
    sourceFormat: v.union(v.literal('gpx'), v.literal('tcx')),
    xmlStorageId: v.id('_storage'),
    source: v.union(v.literal('file'), v.literal('strava')),
    stravaActivityId: v.optional(v.number()),
    sport: v.optional(v.string()),
    distance: v.number(),
    duration: v.number(),
    elevationGain: v.optional(v.number()),
    lapCount: v.number(),
    activityDate: v.optional(v.string()),
  })
    .index('by_tokenIdentifier', ['tokenIdentifier'])
    .index('by_tokenIdentifier_and_stravaActivityId', ['tokenIdentifier', 'stravaActivityId'])
    .index('by_slug', ['slug']),

  columnDefinitions: defineTable({
    tokenIdentifier: v.string(),
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
  }).index('by_tokenIdentifier', ['tokenIdentifier']),

  activityColumns: defineTable({
    tokenIdentifier: v.string(),
    activityId: v.id('activities'),
    columnId: v.id('columnDefinitions'),
    order: v.number(),
  })
    .index('by_tokenIdentifier_and_activityId', ['tokenIdentifier', 'activityId'])
    .index('by_columnId', ['columnId']),

  columnValues: defineTable({
    tokenIdentifier: v.string(),
    activityId: v.id('activities'),
    columnId: v.id('columnDefinitions'),
    lapId: v.string(),
    value: v.number(),
  })
    .index('by_tokenIdentifier_and_activityId_and_columnId', [
      'tokenIdentifier',
      'activityId',
      'columnId',
    ])
    .index('by_tokenIdentifier_and_activityId_and_columnId_and_lapId', [
      'tokenIdentifier',
      'activityId',
      'columnId',
      'lapId',
    ])
    .index('by_columnId', ['columnId']),
})
