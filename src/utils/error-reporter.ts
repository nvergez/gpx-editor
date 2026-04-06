import * as Sentry from '@sentry/node'
import { logger } from './logger'

/** Coerce an unknown throw value into an Error. */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err))
}

export function reportError(error: Error, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context })

  logger.error('Error reported', {
    error: error.message,
    ...context,
  })
}
