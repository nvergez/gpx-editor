function missingEnv(message: string): never {
  throw new Error(message)
}

export function getClientConvexUrl() {
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

  if (!convexUrl) {
    return missingEnv(
      'VITE_CONVEX_URL is not set. Run `pnpm convex:dev` and copy the generated `.env.local` values.',
    )
  }

  return convexUrl
}

export function getServerConvexConfig() {
  const convexUrl = process.env.VITE_CONVEX_URL
  const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL

  if (!convexUrl) {
    return missingEnv(
      'VITE_CONVEX_URL is not set. Run `pnpm convex:dev` and ensure `.env.local` is loaded by the TanStack Start server.',
    )
  }

  if (!convexSiteUrl) {
    return missingEnv(
      'VITE_CONVEX_SITE_URL is not set. Run `pnpm convex:dev` and ensure `.env.local` is loaded by the TanStack Start server.',
    )
  }

  return {
    convexUrl,
    convexSiteUrl,
  }
}
