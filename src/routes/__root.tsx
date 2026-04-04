/// <reference types="vite/client" />
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ActivitySidebar } from '~/components/activity-sidebar'
import { DefaultCatchBoundary } from '~/components/default-catch-boundary'
import { NotFound } from '~/components/not-found'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '~/components/ui/sidebar'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { authClient } from '~/lib/auth-client'
import { getToken } from '~/lib/auth-server'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'
import { getLocale } from '~/paraglide/runtime.js'
import * as m from '~/paraglide/messages.js'

const getAuth = createServerFn({ method: 'GET' }).handler(() => getToken())

export const Route = createRootRouteWithContext<{
  convexQueryClient: ConvexQueryClient
  queryClient: QueryClient
}>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seo({
        title: 'Lapcraft',
        description: m.seo_default_description(),
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
    <QueryClientProvider client={context.queryClient}>
      <ConvexBetterAuthProvider
        client={context.convexQueryClient.convexClient}
        authClient={authClient}
        initialToken={context.token}
      >
        <TooltipProvider>
          <html lang={getLocale()}>
            <head>
              <HeadContent />
            </head>
            <RootBody />
          </html>
        </TooltipProvider>
      </ConvexBetterAuthProvider>
    </QueryClientProvider>
  )
}

function RootBody() {
  const context = useRouteContext({ from: Route.id })
  const { data: sessionData, isPending } = authClient.useSession()

  // Use server-side auth during pending, client-side after resolved
  const isAuthenticated = isPending ? context.isAuthenticated : !!sessionData?.session

  return (
    <body className="grain relative min-h-screen">
      {isAuthenticated ? (
        <SidebarProvider>
          <ActivitySidebar />
          <SidebarInset>
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4 md:hidden">
              <SidebarTrigger />
              <Link to="/" className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="Lapcraft"
                  className="size-6 rounded-md dark:block hidden"
                />
                <img
                  src="/logo-light.png"
                  alt="Lapcraft"
                  className="size-6 rounded-md dark:hidden block"
                />
                <span className="font-serif text-base tracking-tight text-foreground">
                  Lapcraft
                </span>
              </Link>
            </header>
            <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
              <Outlet />
            </div>
          </SidebarInset>
        </SidebarProvider>
      ) : (
        <>
          <header className="sticky top-0 z-40 border-b border-border/60 bg-card/60 backdrop-blur-md">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-4">
              <Link to="/" className="flex items-center gap-2.5">
                <img
                  src="/logo.png"
                  alt="Lapcraft"
                  className="size-8 rounded-lg dark:block hidden"
                />
                <img
                  src="/logo-light.png"
                  alt="Lapcraft"
                  className="size-8 rounded-lg dark:hidden block"
                />
                <h1 className="font-serif text-xl tracking-tight text-foreground">Lapcraft</h1>
              </Link>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">
            <Outlet />
          </main>
        </>
      )}
      <Toaster
        toastOptions={{
          className: 'font-sans',
        }}
      />
      <Scripts />
    </body>
  )
}
