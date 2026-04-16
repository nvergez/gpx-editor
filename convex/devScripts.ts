import { v } from 'convex/values'
import { internalMutation } from './_generated/server'
import type { TableNames } from './_generated/dataModel'

/**
 * DEV-ONLY: Remap `tokenIdentifier` across all app tables after importing a
 * production snapshot. The token identifier has the form
 * `https://<deployment>.convex.site|<user-id>`. When data is moved from one
 * deployment to another, the URL prefix changes, so every row referencing the
 * old prefix becomes orphaned (no match for `ctx.auth.getUserIdentity()`).
 *
 * Run with:
 *   npx convex run devScripts:remapTokenIdentifiers \
 *     '{ "fromPrefix": "https://<prod>.convex.site|", "toPrefix": "https://<dev>.convex.site|" }'
 *
 * Do NOT run this against production.
 */
const TABLES_WITH_TOKEN: TableNames[] = [
  'activities',
  'activityColumns',
  'columnDefinitions',
  'columnValues',
  'creditTransactions',
  'stravaConnections',
  'userProfiles',
]

export const remapTokenIdentifiers = internalMutation({
  args: {
    fromPrefix: v.string(),
    toPrefix: v.string(),
  },
  handler: async (ctx, { fromPrefix, toPrefix }) => {
    const report: Record<string, number> = {}

    for (const table of TABLES_WITH_TOKEN) {
      const rows = await ctx.db.query(table).take(10000)
      let patched = 0
      for (const row of rows) {
        const current = (row as { tokenIdentifier?: string }).tokenIdentifier
        if (typeof current !== 'string') continue
        if (!current.startsWith(fromPrefix)) continue
        const next = toPrefix + current.slice(fromPrefix.length)
        await ctx.db.patch(row._id, { tokenIdentifier: next })
        patched += 1
      }
      report[table] = patched
    }

    return report
  },
})
