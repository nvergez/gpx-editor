import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { authComponent } from './auth'
import { ensureProfileMut, getProfileByToken, logTransaction } from './credits'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireAdmin(ctx: {
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
}) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return null

  const user = await authComponent.getAuthUser(ctx as never)
  if (!user || (user as Record<string, unknown>).role !== 'admin') {
    return null
  }

  return identity
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Check if the current user is an admin. */
export const isAdmin = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx)
    return admin !== null
  },
})

/** List all user profiles (admin only). */
export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx)
    if (!admin) return null
    return await ctx.db.query('userProfiles').collect()
  },
})

/** Get a single user profile by tokenIdentifier (admin only). */
export const getProfile = query({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!admin) return null
    return await getProfileByToken(ctx, args.tokenIdentifier)
  },
})

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a user profile (admin only). Used when a user hasn't opened the app yet. */
export const createProfile = mutation({
  args: {
    tokenIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!admin) throw new Error('Forbidden: admin role required')

    return await ensureProfileMut(ctx, args.tokenIdentifier)
  },
})

/** Grant purchased credits to a user (admin only). */
export const grantCredits = mutation({
  args: {
    tokenIdentifier: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx)
    if (!admin) throw new Error('Forbidden: admin role required')

    const profile = await getProfileByToken(ctx, args.tokenIdentifier)
    if (!profile) throw new Error('User profile not found')

    const newPurchased = profile.purchasedCredits + args.amount
    await ctx.db.patch(profile._id, { purchasedCredits: newPurchased })

    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'purchase',
      amount: args.amount,
      pool: 'purchased',
      balanceAfter: profile.planCredits + newPurchased,
      metadata: 'admin grant',
    })

    return { planCredits: profile.planCredits, purchasedCredits: newPurchased }
  },
})
