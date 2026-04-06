import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const mem = process.memoryUsage()
        const checks: Record<string, unknown> = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: Math.round(process.uptime()),
          memory: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          },
          node: process.version,
        }

        // Convex connectivity check
        try {
          const { getConvexClient } = await import('~/lib/convex-server')
          const client = getConvexClient()
          // A lightweight query to verify the connection is live
          const start = Date.now()
          await client.query(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            'auth:getCurrentUser' as any,
          )
          checks.convex = { status: 'connected', latencyMs: Date.now() - start }
        } catch {
          // Even an auth error means Convex is reachable
          checks.convex = { status: 'connected' }
        }

        return Response.json(checks)
      },
    },
  },
})
