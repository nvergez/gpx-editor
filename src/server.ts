import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/react-start/server-entry'

export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/strava/')) {
      return await handler.fetch(req)
    }
    return await paraglideMiddleware(req, () => handler.fetch(req))
  },
}
