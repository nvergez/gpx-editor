const STRAVA_CLIENT_ID = import.meta.env.VITE_STRAVA_CLIENT_ID as string | undefined
const STRAVA_STATE_KEY = 'strava_oauth_state'

export function getStravaAuthUrl(): string | null {
  if (!STRAVA_CLIENT_ID) return null
  const state = crypto.randomUUID()
  sessionStorage.setItem(STRAVA_STATE_KEY, state)
  const redirectUri = `${window.location.origin}/strava/callback`
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'activity:read_all',
    approval_prompt: 'auto',
    state,
  })
  return `https://www.strava.com/oauth/authorize?${params}`
}

export function validateStravaState(state: string): boolean {
  const expected = sessionStorage.getItem(STRAVA_STATE_KEY)
  return !!expected && expected === state
}

export function clearStravaState(): void {
  sessionStorage.removeItem(STRAVA_STATE_KEY)
}

export function StravaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  )
}
