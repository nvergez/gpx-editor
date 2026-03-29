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
})
