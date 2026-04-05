import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { authClient } from '~/lib/auth-client'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { toast } from 'sonner'
import {
  Shield,
  ShieldCheck,
  Loader2,
  Zap,
  Crown,
  UserCheck,
  LogOut,
  Plus,
  RefreshCw,
} from 'lucide-react'

export const Route = createFileRoute('/admin')({
  component: AdminPage,
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BetterAuthUser {
  id: string
  email: string
  name: string
  role?: string
  banned?: boolean
  createdAt: string
}

interface UserProfile {
  _id: string
  tokenIdentifier: string
  plan: 'free' | 'premium'
  planCredits: number
  purchasedCredits: number
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

function AdminPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const [users, setUsers] = useState<BetterAuthUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [impersonating, setImpersonating] = useState<string | null>(null)

  const { data: profiles, refetch: refetchProfiles } = useQuery(
    convexQuery(api.admin.listProfiles, {}),
  )

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const res = await authClient.admin.listUsers({ query: { limit: 100 } })
      if (res.data) {
        setUsers(res.data.users as unknown as BetterAuthUser[])
      }
    } catch (e) {
      toast.error('Failed to load users. Are you an admin?')
      console.error(e)
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (session?.session) {
      fetchUsers()
    }
  }, [session?.session, fetchUsers])

  if (sessionPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session?.session) {
    return <div className="py-20 text-center text-sm text-muted-foreground">Not authenticated.</div>
  }

  const userRole = (session.user as Record<string, unknown>)?.role
  if (userRole !== 'admin') {
    return (
      <div className="py-20 text-center space-y-2">
        <Shield className="size-8 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">Access denied.</p>
      </div>
    )
  }

  // Build a lookup: userId (extracted from tokenIdentifier) → profile
  // tokenIdentifier format: "<issuer>|<userId>"
  const profileByUserId = new Map<string, UserProfile>()
  let tokenIdentifierPrefix: string | null = null
  if (profiles) {
    for (const p of profiles) {
      const pipeIdx = p.tokenIdentifier.lastIndexOf('|')
      if (pipeIdx === -1) continue
      const userId = p.tokenIdentifier.slice(pipeIdx + 1)
      if (!tokenIdentifierPrefix) {
        tokenIdentifierPrefix = p.tokenIdentifier.slice(0, pipeIdx)
      }
      if (userId) profileByUserId.set(userId, p as unknown as UserProfile)
    }
  }

  async function handleImpersonate(userId: string) {
    setImpersonating(userId)
    try {
      const res = await authClient.admin.impersonateUser({ userId })
      if (res.error) {
        toast.error(`Impersonation failed: ${res.error.message}`)
      } else {
        toast.success('Impersonating user — redirecting...')
        window.location.href = '/'
      }
    } catch (e) {
      toast.error('Impersonation failed')
      console.error(e)
    } finally {
      setImpersonating(null)
    }
  }

  async function handleStopImpersonation() {
    try {
      await authClient.admin.stopImpersonating()
      toast.success('Stopped impersonation')
      window.location.href = '/admin'
    } catch (e) {
      toast.error('Failed to stop impersonation')
      console.error(e)
    }
  }

  const isImpersonatingNow = !!(session.session as Record<string, unknown>)?.impersonatedBy

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="size-6 text-primary" />
          <h1 className="font-serif text-2xl tracking-tight">Admin</h1>
        </div>
        <div className="flex items-center gap-2">
          {isImpersonatingNow && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-amber-500 border-amber-500/30"
              onClick={handleStopImpersonation}
            >
              <LogOut className="size-3.5" />
              Stop impersonation
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              fetchUsers()
              refetchProfiles()
            }}
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Users */}
      {loadingUsers ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">No users found.</p>
      ) : (
        <div className="space-y-3">
          {users.map((user) => {
            // Try to find matching profile — tokenIdentifier contains the user id
            const profile = profileByUserId.get(user.id)
            return (
              <UserRow
                key={user.id}
                user={user}
                profile={profile as unknown as UserProfile | undefined}
                tokenIdentifierPrefix={tokenIdentifierPrefix}
                isImpersonating={impersonating === user.id}
                onImpersonate={() => handleImpersonate(user.id)}
                onRefresh={refetchProfiles}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UserRow
// ---------------------------------------------------------------------------

function UserRow({
  user,
  profile,
  tokenIdentifierPrefix,
  isImpersonating,
  onImpersonate,
  onRefresh,
}: {
  user: BetterAuthUser
  profile: UserProfile | undefined
  tokenIdentifierPrefix: string | null
  isImpersonating: boolean
  onImpersonate: () => void
  onRefresh: () => void
}) {
  const [creditAmount, setCreditAmount] = useState('')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const grantCreditsFn = useConvexMutation(api.admin.grantCredits)
  const createProfileFn = useConvexMutation(api.admin.createProfile)

  const isAdmin = user.role === 'admin'
  const plan = profile?.plan ?? 'free'
  const isPremium = plan === 'premium'
  const totalCredits = (profile?.planCredits ?? 0) + (profile?.purchasedCredits ?? 0)

  async function handleGrantCredits() {
    if (!profile || !creditAmount) return
    const amount = parseInt(creditAmount, 10)
    if (isNaN(amount) || amount <= 0) {
      toast.error('Enter a valid credit amount')
      return
    }

    setLoadingAction('credits')
    try {
      await grantCreditsFn({
        tokenIdentifier: profile.tokenIdentifier,
        amount,
      })
      toast.success(`Granted ${amount} credits`)
      setCreditAmount('')
      onRefresh()
    } catch (e) {
      toast.error('Failed to grant credits')
      console.error(e)
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleTogglePlan() {
    if (!profile) return
    const newPlan = isPremium ? 'free' : 'premium'

    setLoadingAction('plan')
    try {
      const res = await fetch('/api/stripe/admin-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenIdentifier: profile.tokenIdentifier,
          plan: newPlan,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to change plan')
        return
      }
      if (data.plan === 'pending_cancellation') {
        toast.success('Subscription will cancel at end of billing period')
      } else {
        toast.success(`Set plan to ${newPlan} via Stripe`)
      }
      onRefresh()
    } catch (e) {
      toast.error('Failed to change plan')
      console.error(e)
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      {/* User info row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
            {(user.name || user.email || '?')[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{user.name || 'No name'}</span>
              {isAdmin && (
                <Badge
                  variant="outline"
                  className="gap-1 text-[10px] border-primary/30 text-primary"
                >
                  <ShieldCheck className="size-3" />
                  admin
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>

        {/* Plan + credits */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              {isPremium ? (
                <Badge className="gap-1 text-[10px] bg-primary/10 text-primary border-primary/20">
                  <Crown className="size-3" />
                  Premium
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Free
                </Badge>
              )}
            </div>
            {profile && (
              <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                {totalCredits} credits
                <span className="text-muted-foreground/50 ml-1">
                  ({profile.planCredits}p + {profile.purchasedCredits}b)
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Actions row */}
      {profile && (
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          {/* Grant credits */}
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              placeholder="Credits"
              className="h-7 w-24 text-xs tabular-nums"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGrantCredits()}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={loadingAction === 'credits' || !creditAmount}
              onClick={handleGrantCredits}
            >
              {loadingAction === 'credits' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              <Zap className="size-3" />
            </Button>
          </div>

          {/* Toggle plan */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={loadingAction === 'plan'}
            onClick={handleTogglePlan}
          >
            {loadingAction === 'plan' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isPremium ? (
              <>Downgrade</>
            ) : (
              <>
                <Crown className="size-3" />
                Premium
              </>
            )}
          </Button>

          {/* Impersonate */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs ml-auto"
            disabled={isImpersonating}
            onClick={onImpersonate}
          >
            {isImpersonating ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <UserCheck className="size-3" />
            )}
            Impersonate
          </Button>
        </div>
      )}

      {!profile && (
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground/60">
            No profile yet (user hasn't opened the app).
          </p>
          {tokenIdentifierPrefix && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              disabled={loadingAction === 'create-profile'}
              onClick={async () => {
                setLoadingAction('create-profile')
                try {
                  await createProfileFn({
                    tokenIdentifier: `${tokenIdentifierPrefix}|${user.id}`,
                  })
                  toast.success('Profile created')
                  onRefresh()
                } catch (e) {
                  toast.error('Failed to create profile')
                  console.error(e)
                } finally {
                  setLoadingAction(null)
                }
              }}
            >
              {loadingAction === 'create-profile' ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}
              Create profile
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
