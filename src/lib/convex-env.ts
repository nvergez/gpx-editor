function missingEnv(message: string): never {
  throw new Error(message)
}

function getServerEnv(name: string) {
  return process.env[name]
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
  const convexUrl =
    getServerEnv('VITE_CONVEX_URL') ??
    getServerEnv('CONVEX_URL') ??
    (import.meta.env.VITE_CONVEX_URL as string | undefined)
  const convexSiteUrl =
    getServerEnv('VITE_CONVEX_SITE_URL') ??
    getServerEnv('CONVEX_SITE_URL') ??
    (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined)

  if (!convexUrl) {
    return missingEnv(
      'Convex URL is not set. Define `VITE_CONVEX_URL` or `CONVEX_URL` for the app server runtime.',
    )
  }

  if (!convexSiteUrl) {
    return missingEnv(
      'Convex site URL is not set. Define `VITE_CONVEX_SITE_URL` or `CONVEX_SITE_URL` for the app server runtime.',
    )
  }

  return {
    convexUrl,
    convexSiteUrl,
  }
}
