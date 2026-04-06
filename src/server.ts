import { initSentryServer } from './lib/sentry-server'

initSentryServer()

import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/react-start/server-entry'
import { logger } from './utils/logger'
import { reportError, toError } from './utils/error-reporter'

export default {
  async fetch(req: Request): Promise<Response> {
    const startTime = Date.now()
    const url = new URL(req.url)

    try {
      let response: Response

      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/strava/')) {
        response = await handler.fetch(req)
      } else {
        response = await paraglideMiddleware(req, () => handler.fetch(req))
      }

      const duration = Date.now() - startTime

      logger.debug('Request completed', {
        method: req.method,
        path: url.pathname,
        status: response.status,
        durationMs: duration,
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime

      reportError(toError(error), {
        method: req.method,
        path: url.pathname,
        durationMs: duration,
      })

      throw error
    }
  },
}
