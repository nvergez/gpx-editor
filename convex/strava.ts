import { v } from 'convex/values'
import type { ActionCtx } from './_generated/server'
import { query, mutation, action, internalMutation, internalQuery } from './_generated/server'
import { internal } from './_generated/api'

// --- Queries ---

export const getConnection = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const conn = await ctx.db
      .query('stravaConnections')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique()
    if (!conn) return null
    return { connected: true as const, athleteName: conn.athleteName }
  },
})

// --- Internal queries/mutations (for use by actions) ---

export const getConnectionTokens = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('stravaConnections')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', args.tokenIdentifier))
      .unique()
  },
})

export const upsertConnection = internalMutation({
  args: {
    tokenIdentifier: v.string(),
    athleteId: v.number(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    athleteName: v.optional(v.string()),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('stravaConnections')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', args.tokenIdentifier))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        athleteId: args.athleteId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
        athleteName: args.athleteName,
        scope: args.scope,
      })
    } else {
      await ctx.db.insert('stravaConnections', args)
    }
  },
})

// --- Public mutations ---

export const deleteConnection = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')
    const conn = await ctx.db
      .query('stravaConnections')
      .withIndex('by_tokenIdentifier', (q) => q.eq('tokenIdentifier', identity.tokenIdentifier))
      .unique()
    if (conn) {
      await ctx.db.delete(conn._id)
    }
  },
})

// --- Helper: refresh token if expired ---

async function getValidAccessToken(
  ctx: ActionCtx,
  tokenIdentifier: string,
): Promise<{ accessToken: string }> {
  const conn = await ctx.runQuery(internal.strava.getConnectionTokens, { tokenIdentifier })
  if (!conn) throw new Error('No Strava connection found')

  const now = Math.floor(Date.now() / 1000)
  if (conn.expiresAt > now + 60) {
    return { accessToken: conn.accessToken }
  }

  // Refresh the token
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Strava credentials not configured')

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: conn.refreshToken,
    }),
  })

  if (!res.ok) {
    console.error('Strava token refresh failed:', res.status, await res.text())
    throw new Error('Strava token refresh failed')
  }

  const data = await res.json()
  await ctx.runMutation(internal.strava.upsertConnection, {
    tokenIdentifier,
    athleteId: conn.athleteId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
    athleteName: conn.athleteName,
    scope: conn.scope,
  })

  return { accessToken: data.access_token }
}

// --- Actions ---

export const exchangeToken = action({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const clientId = process.env.STRAVA_CLIENT_ID
    const clientSecret = process.env.STRAVA_CLIENT_SECRET
    if (!clientId || !clientSecret) throw new Error('Strava credentials not configured')

    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
        grant_type: 'authorization_code',
      }),
    })

    if (!res.ok) {
      console.error('Strava token exchange failed:', res.status, await res.text())
      throw new Error('Strava token exchange failed')
    }

    const data = await res.json()
    await ctx.runMutation(internal.strava.upsertConnection, {
      tokenIdentifier: identity.tokenIdentifier,
      athleteId: data.athlete.id,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_at,
      athleteName: `${data.athlete.firstname} ${data.athlete.lastname}`.trim() || undefined,
      scope: data.scope ?? 'activity:read_all',
    })

    return { success: true }
  },
})

export const listActivities = action({
  args: { page: v.number(), perPage: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    const page = Math.max(1, Math.floor(args.page))
    const perPage = Math.min(100, Math.max(1, Math.floor(args.perPage)))

    const { accessToken } = await getValidAccessToken(ctx, identity.tokenIdentifier)

    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    })

    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      console.error('Failed to list activities:', res.status, await res.text())
      throw new Error('Failed to list activities')
    }

    const activities = (await res.json()) as Array<{
      id: number
      name: string
      type: string
      sport_type: string
      start_date_local: string
      distance: number
      moving_time: number
      elapsed_time: number
      total_elevation_gain: number
      has_heartrate: boolean
    }>
    return activities.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      sportType: a.sport_type,
      startDate: a.start_date_local,
      distance: a.distance,
      movingTime: a.moving_time,
      elapsedTime: a.elapsed_time,
      totalElevationGain: a.total_elevation_gain,
      hasHeartrate: a.has_heartrate,
    }))
  },
})

export const fetchActivityStreams = action({
  args: { activityId: v.number() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error('Not authenticated')

    if (!Number.isInteger(args.activityId) || args.activityId <= 0) {
      throw new Error('Invalid activity ID')
    }

    const { accessToken } = await getValidAccessToken(ctx, identity.tokenIdentifier)

    // Fetch activity detail, streams, and laps in parallel
    const [detailRes, streamsRes, lapsRes] = await Promise.all([
      fetch(`https://www.strava.com/api/v3/activities/${args.activityId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(
        `https://www.strava.com/api/v3/activities/${args.activityId}/streams?keys=latlng,time,altitude,heartrate,cadence,watts,distance&key_type=stream`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      ),
      fetch(`https://www.strava.com/api/v3/activities/${args.activityId}/laps`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ])

    if (!detailRes.ok) {
      console.error('Failed to fetch activity:', detailRes.status, await detailRes.text())
      throw new Error('Failed to fetch activity')
    }
    if (!streamsRes.ok) {
      console.error('Failed to fetch streams:', streamsRes.status, await streamsRes.text())
      throw new Error('Failed to fetch activity streams')
    }

    const detail = (await detailRes.json()) as {
      name: string
      sport_type: string
      start_date: string
    }
    type StreamEntry =
      | { type: string; data: number[] }
      | { type: 'latlng'; data: [number, number][] }
    const streamsArray = (await streamsRes.json()) as StreamEntry[]

    // Convert streams array to keyed object
    const streams: Record<string, StreamEntry> = {}
    for (const s of streamsArray) {
      streams[s.type] = s
    }

    let laps: Array<{
      start_index: number
      end_index: number
      start_date: string
      elapsed_time: number
      distance: number
      calories?: number
      average_heartrate?: number
      max_heartrate?: number
      average_cadence?: number
    }> = []
    if (lapsRes.ok) {
      laps = await lapsRes.json()
    }

    return {
      name: detail.name,
      sportType: detail.sport_type,
      startDate: detail.start_date,
      laps: laps.map((l) => ({
        startIndex: l.start_index,
        endIndex: l.end_index,
        startDate: l.start_date,
        totalTimeSeconds: l.elapsed_time,
        distance: l.distance,
        calories: l.calories,
        averageHeartrate: l.average_heartrate,
        maxHeartrate: l.max_heartrate,
        averageCadence: l.average_cadence,
      })),
      streams: {
        latlng: streams.latlng?.data as [number, number][] | undefined,
        time: streams.time?.data as number[] | undefined,
        altitude: streams.altitude?.data as number[] | undefined,
        heartrate: streams.heartrate?.data as number[] | undefined,
        cadence: streams.cadence?.data as number[] | undefined,
        watts: streams.watts?.data as number[] | undefined,
        distance: streams.distance?.data as number[] | undefined,
      },
    }
  },
})
