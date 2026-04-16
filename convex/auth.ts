import { convexAdapter, createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth, type BetterAuthOptions } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins'
import { queryGeneric } from 'convex/server'
import { components } from './_generated/api'
import authConfig from './auth.config'
import authSchema from './betterAuth/schema'

export const authComponent = createClient(components.betterAuth, {
  local: {
    schema: authSchema,
  },
})

/**
 * Returns Better Auth options for schema extraction and adapter use.
 * Called by createApi with a dummy context — must not throw on missing env vars.
 */
export function createAuthOptions(): BetterAuthOptions {
  return {
    baseURL: process.env.SITE_URL ?? 'http://localhost:3000',
    database: convexAdapter({} as never, {} as never),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh if last update > 1 day ago
    },
    plugins: [admin(), convex({ authConfig })],
  }
}

/**
 * Creates a full Better Auth instance for handling HTTP requests.
 */
export function createAuth(ctx: GenericCtx) {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) {
    throw new Error(
      'SITE_URL is not set. Set it in your Convex deployment with `pnpm exec convex env set SITE_URL http://localhost:3000`.',
    )
  }
  return betterAuth({
    ...createAuthOptions(),
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
  })
}

export const getCurrentUser = queryGeneric({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx)
  },
})
