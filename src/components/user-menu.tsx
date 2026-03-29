import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { authClient } from '~/lib/auth-client'

export function UserMenu() {
  const { data: session } = authClient.useSession()

  if (!session?.session) return null

  const { name, email } = session.user
  const initials = (name || email)
    .split(/[\s@]/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')

  const handleSignOut = async () => {
    const result = await authClient.signOut()
    if (result.error) {
      toast.error(result.error.message ?? 'Unable to sign out')
      return
    }
    window.location.reload()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/15 hover:ring-primary/30">
        {initials}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <div className="px-2.5 py-2">
          <p className="truncate text-sm font-medium text-foreground">{name || 'User'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
