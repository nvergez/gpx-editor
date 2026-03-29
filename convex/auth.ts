import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth/minimal'
import { componentsGeneric, queryGeneric, type FunctionReference } from 'convex/server'
import authConfig from './auth.config'

type BetterAuthComponent = {
  adapter: {
    create: FunctionReference<'mutation', 'internal'>
    findOne: FunctionReference<'query', 'internal'>
    findMany: FunctionReference<'query', 'internal'>
    updateOne: FunctionReference<'mutation', 'internal'>
    updateMany: FunctionReference<'mutation', 'internal'>
    deleteOne: FunctionReference<'mutation', 'internal'>
    deleteMany: FunctionReference<'mutation', 'internal'>
  }
}

const components = componentsGeneric()
const siteUrl = process.env.SITE_URL

if (!siteUrl) {
  throw new Error(
    'SITE_URL is not set. Set it in your Convex deployment with `pnpm exec convex env set SITE_URL http://localhost:3000`.',
  )
}

export const authComponent = createClient(components.betterAuth as unknown as BetterAuthComponent)

export function createAuth(ctx: GenericCtx) {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  })
}

export const getCurrentUser = queryGeneric({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx)
  },
})
