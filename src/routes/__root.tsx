/// <reference types="vite/client" />
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { Activity } from 'lucide-react'
import { DefaultCatchBoundary } from '~/components/default-catch-boundary'
import { NotFound } from '~/components/not-found'
import { Toaster } from '~/components/ui/sonner'
import { UserMenu } from '~/components/user-menu'
import { authClient } from '~/lib/auth-client'
import { getToken } from '~/lib/auth-server'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

const getAuth = createServerFn({ method: 'GET' }).handler(() => getToken())

export const Route = createRootRouteWithContext<{
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'GPX Editor',
        description: 'Load, visualize, and edit GPX laps',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  beforeLoad: async (ctx) => {
    const token = await getAuth()

    if (token) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)
    }

    return {
      token,
      isAuthenticated: Boolean(token),
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const context = useRouteContext({ from: Route.id })

  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={context.token}
    >
      <html lang="en">
        <head>
          <HeadContent />
        </head>
        <body className="grain relative min-h-screen">
          <header className="sticky top-0 z-40 border-b border-border/60 bg-card/60 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="size-4.5 text-primary" />
                </div>
                <h1 className="font-serif text-xl tracking-tight text-foreground">GPX Editor</h1>
              </div>
              <UserMenu />
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </main>
          <Toaster
            toastOptions={{
              className: 'font-sans',
            }}
          />
          <Scripts />
        </body>
      </html>
    </ConvexBetterAuthProvider>
  )
}
