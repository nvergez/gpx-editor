import { useState, useRef, useEffect, useCallback } from 'react'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useConvexMutation, convexQuery } from '@convex-dev/react-query'
import { api } from '../../convex/_generated/api'
import type { Id, Doc } from '../../convex/_generated/dataModel'
import { toast } from 'sonner'
import { useChatStore } from '~/lib/chat-store'
import {
  Plus,
  Pencil,
  Trash2,
  MoreHorizontal,
  Search,
  Clock,
  Route,
  Mountain,
  ChevronsUpDown,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { formatDistance, formatDuration } from '~/utils/gpx-parser'
import { sportIcon, formatActivityDate } from '~/utils/activity-formatting'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarSeparator,
  useSidebar,
} from '~/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  CommandDialog,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '~/components/ui/command'
import { SettingsDialog } from '~/components/settings-dialog'
import { authClient } from '~/lib/auth-client'
import * as m from '~/paraglide/messages.js'
import { getLocale } from '~/paraglide/runtime.js'

export function ActivitySidebar() {
  const navigate = useNavigate()
  const { setOpenMobile } = useSidebar()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const slugMatch = pathname.match(/^\/activities\/([^/]+)/)
  const currentSlug = slugMatch?.[1]

  // Close mobile sidebar on navigation
  useEffect(() => {
    setOpenMobile(false)
  }, [pathname, setOpenMobile])
  const isOnHome = pathname === '/'

  const { data: activities } = useQuery(convexQuery(api.activities.list, {}))

  // Rename state
  const [editingId, setEditingId] = useState<Id<'activities'> | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Search dialog
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingId])

  // Cmd+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // Mutations
  const { mutate: removeActivity } = useMutation({
    mutationFn: useConvexMutation(api.activities.remove),
  })
  const { mutate: renameActivity } = useMutation({
    mutationFn: useConvexMutation(api.activities.update),
  })

  const handleDelete = useCallback(
    (activityId: Id<'activities'>) => {
      removeActivity(
        { activityId },
        {
          onSuccess: () => toast.success(m.sidebar_activity_deleted()),
          onError: (err) => toast.error(err.message),
        },
      )
    },
    [removeActivity],
  )

  const startRename = useCallback((activity: Doc<'activities'>) => {
    setEditingId(activity._id)
    setEditValue(activity.name)
  }, [])

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim()) {
      renameActivity(
        { activityId: editingId, name: editValue.trim() },
        { onError: (err) => toast.error(err.message) },
      )
    }
    setEditingId(null)
  }, [editingId, editValue, renameActivity])

  const isOnActivityPage = Boolean(currentSlug)

  const handleSearchSelect = useCallback(
    (slug: string) => {
      setSearchOpen(false)
      navigate({ to: '/activities/$slug', params: { slug } })
    },
    [navigate],
  )

  const toggleChat = useChatStore((s) => s.toggle)

  const handleToggleChat = useCallback(() => {
    setSearchOpen(false)
    toggleChat()
  }, [toggleChat])

  return (
    <>
      <Sidebar collapsible="offcanvas">
        <SidebarHeader className="px-4 pt-4 pb-2">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Lapcraft" className="size-7 rounded-lg dark:block hidden" />
            <img
              src="/logo-light.png"
              alt="Lapcraft"
              className="size-7 rounded-lg dark:hidden block"
            />
            <span className="font-serif text-lg tracking-tight text-sidebar-foreground">
              Lapcraft
            </span>
          </Link>

          {activities && activities.length > 0 && (
            <button
              onClick={() => setSearchOpen(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-md border border-sidebar-border px-3 py-1.5 text-sm text-sidebar-foreground/50 transition-colors hover:border-sidebar-ring/30 hover:text-sidebar-foreground"
            >
              <Search className="size-3.5" />
              <span className="flex-1 text-left">{m.sidebar_search()}</span>
              <kbd className="pointer-events-none hidden h-5 items-center gap-0.5 rounded border border-sidebar-border bg-sidebar-accent px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
                <span className="text-xs">⌘</span>K
              </kbd>
            </button>
          )}
        </SidebarHeader>

        <SidebarContent>
          {/* Import action */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={isOnHome} render={<Link to="/" />}>
                    <Plus className="size-4" />
                    <span>{m.sidebar_import_activity()}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          {/* Activity list */}
          <SidebarGroup className="flex-1">
            <SidebarGroupLabel>
              {m.sidebar_activities()}
              {activities && activities.length > 0 ? ` (${activities.length})` : ''}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {activities?.map((activity) => {
                  const isActive = activity.slug === currentSlug
                  const isEditing = editingId === activity._id

                  return (
                    <SidebarMenuItem key={activity._id}>
                      {isEditing ? (
                        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
                          <span className="text-base leading-none shrink-0">
                            {sportIcon(activity.sport)}
                          </span>
                          <input
                            ref={inputRef}
                            className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-sidebar-foreground/30 outline-none"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename()
                              if (e.key === 'Escape') setEditingId(null)
                            }}
                          />
                        </div>
                      ) : (
                        <SidebarMenuButton
                          isActive={isActive}
                          size="lg"
                          className="h-auto py-1.5"
                          render={<Link to="/activities/$slug" params={{ slug: activity.slug }} />}
                        >
                          <span className="text-base leading-none shrink-0">
                            {sportIcon(activity.sport)}
                          </span>
                          <div className="flex-1 min-w-0 leading-tight">
                            <p className="truncate text-sm">{activity.name}</p>
                            <p className="truncate text-[11px] text-sidebar-foreground/50 mt-0.5">
                              {activity.activityDate &&
                                formatActivityDate(activity.activityDate, false)}
                              {activity.activityDate && ' · '}
                              {formatDistance(activity.distance)}
                            </p>
                          </div>
                        </SidebarMenuButton>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          className="absolute right-1 top-1.5 flex size-5 items-center justify-center rounded-md text-sidebar-foreground/50 opacity-0 transition-opacity hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                          }}
                        >
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" sideOffset={8}>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              startRename(activity)
                            }}
                          >
                            <Pencil className="size-3.5" />
                            {m.common_rename()}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              handleDelete(activity._id)
                            }}
                            className="text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                            {m.common_delete()}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  )
                })}

                {activities?.length === 0 && (
                  <p className="px-2 py-8 text-center text-sm text-sidebar-foreground/30">
                    {m.sidebar_no_activities()}
                  </p>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarUserFooter />
        </SidebarFooter>
      </Sidebar>

      {/* Search dialog */}
      {activities && activities.length > 0 && (
        <CommandDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          title={m.sidebar_search_title()}
          description={m.sidebar_search_desc()}
        >
          <Command>
            <CommandInput placeholder={m.sidebar_search_placeholder()} />
            <CommandList>
              <CommandEmpty>{m.sidebar_no_results()}</CommandEmpty>
              {isOnActivityPage && (
                <CommandGroup heading={m.sidebar_actions()}>
                  <CommandItem onSelect={handleToggleChat} className="gap-3">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm">{m.sidebar_toggle_ai()}</span>
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading={m.sidebar_activities()}>
                {activities.map((activity) => (
                  <CommandItem
                    key={activity._id}
                    value={`${activity.name} ${activity.sport ?? ''} ${activity._id}`}
                    onSelect={() => handleSearchSelect(activity.slug)}
                    className="gap-3"
                  >
                    <span className="text-base shrink-0">{sportIcon(activity.sport)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{activity.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {activity.activityDate && (
                          <span>{formatActivityDate(activity.activityDate)}</span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Route className="size-3" />
                          {formatDistance(activity.distance)}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="size-3" />
                          {formatDuration(activity.duration)}
                        </span>
                        {activity.elevationGain != null && activity.elevationGain > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Mountain className="size-3" />
                            {Math.round(activity.elevationGain)}m
                          </span>
                        )}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </CommandDialog>
      )}
    </>
  )
}

function SidebarUserFooter() {
  const { data: session } = authClient.useSession()
  const [settingsOpen, setSettingsOpen] = useState(false)

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
      toast.error(result.error.message ?? m.sidebar_sign_out_error())
      return
    }
    window.location.href = '/' + getLocale() + '/'
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="h-auto py-2 data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
                />
              }
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/10 text-[11px] font-semibold text-sidebar-primary ring-1 ring-sidebar-primary/20">
                {initials}
              </div>
              <div className="flex-1 min-w-0 leading-tight">
                <p className="truncate text-sm font-medium">{name || m.sidebar_user_fallback()}</p>
                <p className="truncate text-[11px] text-sidebar-foreground/50">{email}</p>
              </div>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/30" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {name || m.sidebar_user_fallback()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{email}</p>
                </div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="size-3.5" />
                {m.sidebar_settings()}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="size-3.5" />
                {m.sidebar_sign_out()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
