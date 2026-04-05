import { v } from 'convex/values'
import { mutation, internalMutation, internalQuery, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc } from './_generated/dataModel'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FREE_PLAN_CREDITS = 20
const PREMIUM_PLAN_CREDITS = 750

export { PLAN_LIMITS } from './planLimits'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function getProfileByToken(
  ctx: QueryCtx,
  tokenIdentifier: string,
): Promise<Doc<'userProfiles'> | null> {
  return await ctx.db
    .query('userProfiles')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()
}

/** Get or create the user profile (lazy upsert). Mutation context required for insert. */
export async function ensureProfileMut(
  ctx: MutationCtx,
  tokenIdentifier: string,
): Promise<Doc<'userProfiles'>> {
  const existing = await ctx.db
    .query('userProfiles')
    .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', tokenIdentifier))
    .unique()

  if (existing) return existing

  const id = await ctx.db.insert('userProfiles', {
    tokenIdentifier,
    plan: 'free',
    planCredits: FREE_PLAN_CREDITS,
    purchasedCredits: 0,
  })
  return (await ctx.db.get(id))!
}

/** Record a credit transaction in the ledger. */
export async function logTransaction(
  ctx: MutationCtx,
  data: {
    tokenIdentifier: string
    type: 'plan_grant' | 'purchase' | 'usage' | 'plan_reset'
    amount: number
    pool: 'plan' | 'purchased'
    balanceAfter: number
    metadata?: string
  },
) {
  await ctx.db.insert('creditTransactions', {
    ...data,
    createdAt: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Queries (public)
// ---------------------------------------------------------------------------

/** Get the current user's profile. Returns null if not authenticated or no profile yet. */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    return await getProfileByToken(ctx, identity.tokenIdentifier)
  },
})

/** Get the current user's total credit balance (plan + purchased). */
export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null

    const profile = await getProfileByToken(ctx, identity.tokenIdentifier)
    if (!profile) {
      // No profile yet — return free plan defaults
      return {
        planCredits: FREE_PLAN_CREDITS,
        purchasedCredits: 0,
        total: FREE_PLAN_CREDITS,
        plan: 'free' as const,
        stripeCustomerId: undefined,
      }
    }

    return {
      planCredits: profile.planCredits,
      purchasedCredits: profile.purchasedCredits,
      total: profile.planCredits + profile.purchasedCredits,
      plan: profile.plan,
      stripeCustomerId: profile.stripeCustomerId,
    }
  },
})

/** List recent credit transactions for the current user. */
export const listTransactions = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []

    const limit = Math.min(args.limit ?? 50, 200)

    return await ctx.db
      .query('creditTransactions')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .order('desc')
      .take(limit)
  },
})

/** Ensure the profile exists (lazy creation). Returns the profile. */
export const ensureProfile = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    return await ensureProfileMut(ctx, identity.tokenIdentifier)
  },
})

/** Set the Stripe customer ID on the current user's profile. Used during checkout. */
export const setMyStripeCustomerId = mutation({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const profile = await ensureProfileMut(ctx, identity.tokenIdentifier)
    await ctx.db.patch(profile._id, { stripeCustomerId: args.stripeCustomerId })
    return { tokenIdentifier: identity.tokenIdentifier }
  },
})

/**
 * Shared deduction logic. Consumes plan credits first, then purchased.
 * Balance CAN go negative (allowed during a turn).
 */
async function deductCreditsImpl(
  ctx: MutationCtx,
  args: { tokenIdentifier: string; amount: number; metadata?: string },
) {
  if (args.amount <= 0) return

  const profile = await ensureProfileMut(ctx, args.tokenIdentifier)
  let remaining = args.amount

  const planDeduction = Math.min(remaining, Math.max(0, profile.planCredits))
  remaining -= planDeduction

  const newPlanCredits = profile.planCredits - planDeduction
  const newPurchasedCredits =
    remaining > 0 ? profile.purchasedCredits - remaining : profile.purchasedCredits

  await ctx.db.patch(profile._id, {
    planCredits: newPlanCredits,
    purchasedCredits: newPurchasedCredits,
  })

  if (planDeduction > 0) {
    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'usage',
      amount: -planDeduction,
      pool: 'plan',
      balanceAfter: newPlanCredits + profile.purchasedCredits,
      metadata: args.metadata,
    })
  }

  if (remaining > 0) {
    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'usage',
      amount: -remaining,
      pool: 'purchased',
      balanceAfter: newPlanCredits + newPurchasedCredits,
      metadata: args.metadata,
    })
  }
}

/**
 * Deduct credits after an AI turn completes (internal, called from webhook actions).
 */
export const deductCredits = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    amount: v.number(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await deductCreditsImpl(ctx, args)
  },
})

/** Deduct credits for the authenticated user (called from chat endpoint after stream completes). */
export const deductMyCredits = mutation({
  args: {
    amount: v.number(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    await deductCreditsImpl(ctx, {
      tokenIdentifier: identity.tokenIdentifier,
      amount: args.amount,
      metadata: args.metadata,
    })
  },
})

// ---------------------------------------------------------------------------
// Internal mutations — called from Stripe webhook handlers
// ---------------------------------------------------------------------------

/** Grant plan credits on subscription activation or renewal. Resets plan credits to plan amount. */
export const grantPlanCredits = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    plan: v.union(v.literal('free'), v.literal('premium')),
    stripeSubscriptionId: v.optional(v.string()),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)
    const credits = args.plan === 'premium' ? PREMIUM_PLAN_CREDITS : FREE_PLAN_CREDITS

    await ctx.db.patch(profile._id, {
      plan: args.plan,
      planCredits: credits,
      ...(args.stripeSubscriptionId ? { stripeSubscriptionId: args.stripeSubscriptionId } : {}),
    })

    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'plan_grant',
      amount: credits,
      pool: 'plan',
      balanceAfter: credits + profile.purchasedCredits,
      metadata: args.metadata,
    })
  },
})

/** Grant purchased credits (from a one-time credit pack purchase). */
export const grantPurchasedCredits = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    amount: v.number(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)
    const newPurchased = profile.purchasedCredits + args.amount

    await ctx.db.patch(profile._id, { purchasedCredits: newPurchased })

    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'purchase',
      amount: args.amount,
      pool: 'purchased',
      balanceAfter: profile.planCredits + newPurchased,
      metadata: args.metadata,
    })
  },
})

/** Reset plan credits on monthly renewal (invoice.paid). */
export const resetPlanCredits = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)
    const credits = profile.plan === 'premium' ? PREMIUM_PLAN_CREDITS : FREE_PLAN_CREDITS
    const oldCredits = profile.planCredits

    await ctx.db.patch(profile._id, { planCredits: credits })

    // Log the reset (wipe old balance)
    if (oldCredits !== 0) {
      await logTransaction(ctx, {
        tokenIdentifier: args.tokenIdentifier,
        type: 'plan_reset',
        amount: -oldCredits,
        pool: 'plan',
        balanceAfter: profile.purchasedCredits,
        metadata: args.metadata ?? 'monthly reset (clear)',
      })
    }

    // Log the fresh grant
    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'plan_grant',
      amount: credits,
      pool: 'plan',
      balanceAfter: credits + profile.purchasedCredits,
      metadata: args.metadata ?? 'monthly reset (grant)',
    })
  },
})

/** Upgrade to premium plan (checkout.session.completed for subscription). */
export const upgradeToPremium = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)

    await ctx.db.patch(profile._id, {
      plan: 'premium',
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      planCredits: PREMIUM_PLAN_CREDITS,
    })

    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'plan_grant',
      amount: PREMIUM_PLAN_CREDITS,
      pool: 'plan',
      balanceAfter: PREMIUM_PLAN_CREDITS + profile.purchasedCredits,
      metadata: args.metadata ?? 'upgrade to premium',
    })
  },
})

/** Downgrade to free plan (customer.subscription.deleted). */
export const downgradeToFree = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)

    await ctx.db.patch(profile._id, {
      plan: 'free',
      stripeSubscriptionId: undefined,
      planCredits: FREE_PLAN_CREDITS,
    })

    await logTransaction(ctx, {
      tokenIdentifier: args.tokenIdentifier,
      type: 'plan_grant',
      amount: FREE_PLAN_CREDITS,
      pool: 'plan',
      balanceAfter: FREE_PLAN_CREDITS + profile.purchasedCredits,
      metadata: args.metadata ?? 'downgrade to free',
    })
  },
})

/** Set the Stripe customer ID on a profile (called during first checkout). */
export const setStripeCustomerId = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ensureProfileMut(ctx, args.tokenIdentifier)
    await ctx.db.patch(profile._id, { stripeCustomerId: args.stripeCustomerId })
  },
})

/** Look up a user profile by Stripe customer ID (for webhook processing). */
export const getProfileByStripeCustomerId = internalQuery({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('userProfiles')
      .withIndex('by_stripeCustomerId', (q) => q.eq('stripeCustomerId', args.stripeCustomerId))
      .unique()
  },
})
