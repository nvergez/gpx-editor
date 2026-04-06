import * as Sentry from '@sentry/node'

let initialized = false

export function initSentryServer() {
  if (initialized) return
  initialized = true

  const dsn = process.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  })
}
