import { Activity } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ActivityHub } from '~/components/activity-hub'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { authClient } from '~/lib/auth-client'
import { cn } from '~/lib/utils'

type AuthMode = 'sign-in' | 'sign-up'

function LoadingScreen() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <Activity className="size-7 text-primary" />
        </div>
        <div className="absolute inset-0 animate-ping rounded-2xl bg-primary/5" />
      </div>
      <p className="animate-pulse text-sm text-muted-foreground">Loading session…</p>
    </div>
  )
}

function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)

    try {
      if (mode === 'sign-in') {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          toast.error(result.error.message ?? 'Unable to sign in')
          return
        }
        toast.success('Welcome back')
        setPassword('')
        return
      }

      const result = await authClient.signUp.email({ name, email, password })
      if (result.error) {
        toast.error(result.error.message ?? 'Unable to create account')
        return
      }
      toast.success('Account created')
      setPassword('')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="topo-bg mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-primary/8 ring-1 ring-primary/15">
            <Activity className="size-8 text-primary" strokeWidth={1.8} />
          </div>
          <h2 className="font-serif text-2xl tracking-tight text-foreground">
            {mode === 'sign-in' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === 'sign-in' ? 'Sign in to your Lapcraft account' : 'Get started with Lapcraft'}
          </p>
        </div>

        {/* Toggle */}
        <div className="relative mb-6 flex rounded-lg bg-muted/80 p-0.5 ring-1 ring-foreground/5">
          <div
            className={cn(
              'absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] rounded-md bg-card shadow-sm ring-1 ring-foreground/10 transition-transform duration-200 ease-out',
              mode === 'sign-up' && 'translate-x-[calc(100%+4px)]',
            )}
          />
          <button
            type="button"
            onClick={() => setMode('sign-in')}
            className={cn(
              'relative z-10 flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors',
              mode === 'sign-in'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70',
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode('sign-up')}
            className={cn(
              'relative z-10 flex-1 rounded-md py-1.5 text-center text-sm font-medium transition-colors',
              mode === 'sign-up'
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/70',
            )}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div
            className={cn(
              'grid transition-all duration-200 ease-out',
              mode === 'sign-up' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-1.5 pb-4">
                <Label
                  htmlFor="auth-name"
                  className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  Name
                </Label>
                <Input
                  id="auth-name"
                  autoComplete="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required={mode === 'sign-up'}
                  className="h-10 rounded-lg bg-card px-3 ring-1 ring-foreground/10 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="auth-email"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Email
            </Label>
            <Input
              id="auth-email"
              autoComplete="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="h-10 rounded-lg bg-card px-3 ring-1 ring-foreground/10 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor="auth-password"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Password
            </Label>
            <Input
              id="auth-password"
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="h-10 rounded-lg bg-card px-3 ring-1 ring-foreground/10 transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>

          <Button
            disabled={isSubmitting}
            type="submit"
            size="lg"
            className="!mt-6 h-10 w-full text-sm font-semibold tracking-wide"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                {mode === 'sign-in' ? 'Signing in…' : 'Creating account…'}
              </span>
            ) : mode === 'sign-in' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          {mode === 'sign-in' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
            className="text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

export function AuthGate() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending && !session) {
    return <LoadingScreen />
  }

  if (session?.session) {
    return <ActivityHub />
  }

  return <AuthForm />
}
