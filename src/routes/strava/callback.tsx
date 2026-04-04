import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConvexAction } from '@convex-dev/react-query'
import { api } from '../../../convex/_generated/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { validateStravaState, clearStravaState } from '~/utils/strava'
import * as m from '~/paraglide/messages.js'

export const Route = createFileRoute('/strava/callback')({
  validateSearch: (search: Record<string, unknown>) => ({
    code: (search.code as string) ?? '',
    error: (search.error as string) ?? '',
    state: (search.state as string) ?? '',
  }),
  component: StravaCallback,
})

function StravaCallback() {
  const { code, error: searchError, state } = Route.useSearch()
  const navigate = useNavigate()
  const exchangeToken = useConvexAction(api.strava.exchangeToken)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  const didExchange = useRef(false)

  const handleCallback = useCallback(async () => {
    if (searchError) {
      return { status: 'error' as const, msg: searchError }
    }

    if (!code) {
      return { status: 'error' as const, msg: m.strava_no_code() }
    }

    if (didExchange.current) return null
    didExchange.current = true

    if (!validateStravaState(state)) {
      return { status: 'error' as const, msg: m.strava_invalid_state() }
    }

    clearStravaState()
    try {
      await exchangeToken({ code })
      return { status: 'success' as const, msg: '' }
    } catch (err: unknown) {
      return {
        status: 'error' as const,
        msg: err instanceof Error ? err.message : m.strava_token_failed(),
      }
    }
  }, [code, searchError, state, exchangeToken])

  useEffect(() => {
    let cancelled = false
    handleCallback().then((result) => {
      if (cancelled || !result) return
      setStatus(result.status)
      if (result.msg) setErrorMsg(result.msg)
      if (result.status === 'success') {
        setTimeout(() => navigate({ to: '/' }), 1500)
      }
    })
    return () => {
      cancelled = true
    }
  }, [handleCallback, navigate])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
        <Activity className="size-7 text-primary" />
      </div>

      {status === 'loading' && (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{m.strava_connecting()}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle2 className="size-6 text-green-500" />
          <p className="text-sm text-muted-foreground">{m.strava_connected_redirect()}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <XCircle className="size-6 text-destructive" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">{m.strava_connection_failed()}</p>
            <p className="mt-1 text-xs text-muted-foreground">{errorMsg}</p>
          </div>
          <button
            onClick={() => navigate({ to: '/' })}
            className="text-sm text-primary underline underline-offset-2"
          >
            {m.common_go_back()}
          </button>
        </>
      )}
    </div>
  )
}
