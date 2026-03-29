import { useMutation, useQuery } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import { toast } from 'sonner'
import { Loader2, Unlink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { getStravaAuthUrl, StravaLogo } from '~/utils/strava'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { data: connection, isLoading } = useQuery(convexQuery(api.strava.getConnection, {}))
  const { mutate: disconnect, isPending: isDisconnecting } = useMutation({
    mutationFn: useConvexMutation(api.strava.deleteConnection),
    onSuccess: () => toast.success('Strava disconnected'),
    onError: (err) => toast.error(err.message),
  })

  const stravaAuthUrl = getStravaAuthUrl()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your connected accounts</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Connections
            </h3>

            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-[#FC4C02]/10">
                  <StravaLogo className="size-5 text-[#FC4C02]" />
                </div>
                <div>
                  <p className="text-sm font-medium">Strava</p>
                  {isLoading ? (
                    <p className="text-xs text-muted-foreground">Checking...</p>
                  ) : connection ? (
                    <p className="text-xs text-muted-foreground">
                      Connected{connection.athleteName ? ` as ${connection.athleteName}` : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
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
                  Disconnect
                </Button>
              ) : stravaAuthUrl ? (
                <Button
                  size="sm"
                  className="bg-[#FC4C02] text-white hover:bg-[#e04400]"
                  onClick={() => {
                    window.location.href = stravaAuthUrl
                  }}
                >
                  Connect
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Not configured</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
