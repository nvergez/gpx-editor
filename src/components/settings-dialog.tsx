import { useMutation, useQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { toast } from 'sonner'
import { Globe, Loader2, Unlink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { getStravaAuthUrl, StravaLogo } from '~/utils/strava'
import * as m from '~/paraglide/messages.js'
import { getLocale, locales, localizeHref } from '~/paraglide/runtime.js'

const LOCALE_DISPLAY: Record<string, string> = {
  en: 'English',
  fr: 'Fran\u00e7ais',
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data: connection, isLoading } = useQuery(convexQuery(api.strava.getConnection, {}))
  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    mutationFn: useConvexMutation(api.strava.deleteConnection),
    onSuccess: () => toast.success(m.settings_strava_disconnected()),
    onError: (err) => toast.error(err.message),
  })

  const stravaAuthUrl = getStravaAuthUrl()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.settings_title()}</DialogTitle>
          <DialogDescription>{m.settings_desc()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {m.settings_connections()}
            </h3>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-[#FC4C02]/10">
                  <StravaLogo className="size-5 text-[#FC4C02]" />
                </div>
                <div>
                  <p className="text-sm font-medium">{m.settings_strava()}</p>
                  {isLoading ? (
                    <p className="text-xs text-muted-foreground">{m.settings_checking()}</p>
                  ) : connection ? (
                    <p className="text-xs text-muted-foreground">
                      {connection.athleteName
                        ? m.settings_connected_as({ name: connection.athleteName })
                        : m.settings_connected()}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{m.settings_not_connected()}</p>
                  )}
                </div>
              </div>

              {connection ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => disconnect({})}
                  disabled={isDisconnecting}
                >
                  {isDisconnecting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Unlink className="size-3.5" />
                  )}
                  {m.settings_disconnect()}
                </Button>
              ) : stravaAuthUrl ? (
                <Button
                  size="sm"
                  className="bg-[#FC4C02] text-white hover:bg-[#e04400]"
                  onClick={() => {
                    window.location.href = stravaAuthUrl
                  }}
                >
                  {m.settings_connect()}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{m.settings_not_configured()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {m.settings_language()}
          </h3>
          <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <Globe className="size-5 text-primary" />
              </div>
              <p className="text-sm font-medium">
                {LOCALE_DISPLAY[getLocale()] ?? getLocale().toUpperCase()}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {locales.map((locale) => {
                const isActive = locale === getLocale()
                return (
                  <a
                    key={locale}
                    href={localizeHref('/', { locale })}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {locale.toUpperCase()}
                  </a>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
