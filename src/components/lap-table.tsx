import { useState, useMemo, useCallback } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import type { LapHandle } from '~/utils/dom-model'
import { formatDistance, formatDuration, formatPace, formatSpeed } from '~/utils/gpx-parser'
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
} from '~/components/ui/table'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { SplitDialog } from './split-dialog'
import {
  MoreHorizontal,
  Pencil,
  ChevronUp,
  ChevronDown,
  Scissors,
  Merge,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

interface LapTableProps {
  laps: LapHandle[]
  sourceFormat: 'gpx' | 'tcx'
  onDelete: (lapId: string) => void
  onSplit: (lapId: string, pointIndex: number) => void
  onMerge: (lapIds: [string, string]) => void
  onRename: (lapId: string, newName: string) => void
  onReorder: (laps: LapHandle[]) => void
}

function SortableHeader({
  label,
  column,
}: {
  label: string
  column: { getIsSorted: () => false | 'asc' | 'desc'; toggleSorting: (desc?: boolean) => void }
}) {
  const sorted = column.getIsSorted()
  return (
    <button
      className="flex items-center gap-1.5 hover:text-foreground transition-colors text-xs uppercase tracking-wider font-medium"
      onClick={() => column.toggleSorting()}
    >
      {label}
      {sorted === 'asc' ? (
        <ArrowUp className="size-3" />
      ) : sorted === 'desc' ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-30" />
      )}
    </button>
  )
}

export function LapTable({
  laps,
  sourceFormat,
  onDelete,
  onSplit,
  onMerge,
  onRename,
  onReorder,
}: LapTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [editingLapId, setEditingLapId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [deletingLap, setDeletingLap] = useState<LapHandle | null>(null)
  const [splitLap, setSplitLap] = useState<LapHandle | null>(null)

  const isSorted = sorting.length > 0

  const startEditing = useCallback((lap: LapHandle) => {
    setEditName(lap.name)
    setEditingLapId(lap.id)
  }, [])

  const commitRename = useCallback(
    (lapId: string) => {
      if (editName.trim()) {
        onRename(lapId, editName.trim())
      }
      setEditingLapId(null)
    },
    [editName, onRename],
  )

  const cancelEditing = useCallback(() => {
    setEditingLapId(null)
  }, [])

  const moveLap = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= laps.length) return
      const newLaps = [...laps]
      ;[newLaps[index], newLaps[newIndex]] = [newLaps[newIndex], newLaps[index]]
      onReorder(newLaps)
    },
    [laps, onReorder],
  )

  const columnVisibility = useMemo<VisibilityState>(() => {
    const has = (key: keyof LapHandle['stats']) => laps.some((l) => l.stats[key] != null)
    return {
      avgHr: has('avgHr'),
      maxHr: has('maxHr'),
      avgCadence: has('avgCadence'),
      avgPower: has('avgPower'),
      maxSpeed: has('maxSpeed'),
      calories: has('calories'),
      elevationGain: has('elevationGain'),
      elevationLoss: has('elevationLoss'),
    }
  }, [laps])

  // Column definitions use plain objects (not createColumnHelper) to avoid
  // deep generic inference that causes exponential type expansion with TanStack Start.
  const columns = useMemo(
    (): ColumnDef<LapHandle>[] => [
      {
        id: 'index',
        header: '#',
        cell: (info) => (
          <span className="text-muted-foreground tabular-nums text-xs">{info.row.index + 1}</span>
        ),
        meta: { align: 'center' },
      },
      {
        accessorKey: 'name',
        header: ({ column }) => <SortableHeader label="Name" column={column} />,
        cell: (info) => {
          const lap = info.row.original
          if (editingLapId === lap.id) {
            return (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(lap.id)
                  if (e.key === 'Escape') cancelEditing()
                }}
                onBlur={() => commitRename(lap.id)}
                className="h-7 text-sm w-40"
                autoFocus
              />
            )
          }
          return <span className="font-medium truncate max-w-48 block">{lap.name}</span>
        },
        meta: { align: 'left', sticky: true },
      },
      {
        id: 'distance',
        accessorFn: (row: LapHandle): number => row.stats.distance,
        header: ({ column }) => <SortableHeader label="Distance" column={column} />,
        cell: (info) => (
          <span className="tabular-nums">{formatDistance(info.getValue<number>())}</span>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'duration',
        accessorFn: (row: LapHandle): number => row.stats.duration,
        header: ({ column }) => <SortableHeader label="Duration" column={column} />,
        cell: (info) => (
          <span className="tabular-nums">{formatDuration(info.getValue<number>())}</span>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'pace',
        accessorFn: (row: LapHandle): number =>
          row.stats.duration > 0 && row.stats.distance > 0
            ? row.stats.duration / (row.stats.distance / 1000)
            : Infinity,
        header: ({ column }) => <SortableHeader label="Pace" column={column} />,
        cell: (info) => {
          const lap = info.row.original
          return (
            <span className="tabular-nums">
              {formatPace(lap.stats.distance, lap.stats.duration)}
            </span>
          )
        },
        meta: { align: 'right' },
      },
      {
        id: 'avgHr',
        accessorFn: (row: LapHandle): number | undefined => row.stats.avgHr,
        header: ({ column }) => <SortableHeader label="Avg HR" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${Math.round(v)}` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'maxHr',
        accessorFn: (row: LapHandle): number | undefined => row.stats.maxHr,
        header: ({ column }) => <SortableHeader label="Max HR" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'avgCadence',
        accessorFn: (row: LapHandle): number | undefined => row.stats.avgCadence,
        header: ({ column }) => <SortableHeader label="Cadence" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'avgPower',
        accessorFn: (row: LapHandle): number | undefined => row.stats.avgPower,
        header: ({ column }) => <SortableHeader label="Power" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}W` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'maxSpeed',
        accessorFn: (row: LapHandle): number | undefined => row.stats.maxSpeed,
        header: ({ column }) => <SortableHeader label="Max Spd" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? formatSpeed(v) : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'calories',
        accessorFn: (row: LapHandle): number | undefined => row.stats.calories,
        header: ({ column }) => <SortableHeader label="Cal" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'elevationGain',
        accessorFn: (row: LapHandle): number | undefined => row.stats.elevationGain,
        header: ({ column }) => <SortableHeader label="Elev +" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}m` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        id: 'elevationLoss',
        accessorFn: (row: LapHandle): number | undefined => row.stats.elevationLoss,
        header: ({ column }) => <SortableHeader label="Elev -" column={column} />,
        cell: (info) => {
          const v = info.getValue<number | undefined>()
          return <span className="tabular-nums">{v != null ? `${v}m` : '-'}</span>
        },
        meta: { align: 'right' },
      },
      {
        accessorKey: 'pointCount',
        header: ({ column }) => <SortableHeader label="Pts" column={column} />,
        cell: (info) => (
          <span className="tabular-nums text-muted-foreground">{info.getValue<number>()}</span>
        ),
        meta: { align: 'right' },
      },
      {
        id: 'actions',
        header: '',
        cell: (info) => {
          const lap = info.row.original
          const index = info.row.index
          const isFirst = index === 0
          const isLast = index === laps.length - 1
          return (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />}>
                <MoreHorizontal className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => startEditing(lap)}>
                  <Pencil className="size-3.5" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => moveLap(index, 'up')}
                  disabled={isFirst || isSorted}
                >
                  <ChevronUp className="size-3.5" />
                  Move up
                  {isSorted && (
                    <span className="ml-auto text-xs text-muted-foreground">sorted</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => moveLap(index, 'down')}
                  disabled={isLast || isSorted}
                >
                  <ChevronDown className="size-3.5" />
                  Move down
                  {isSorted && (
                    <span className="ml-auto text-xs text-muted-foreground">sorted</span>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSplitLap(lap)} disabled={lap.pointCount < 3}>
                  <Scissors className="size-3.5" />
                  Split
                </DropdownMenuItem>
                {!isLast && (
                  <DropdownMenuItem onClick={() => onMerge([lap.id, laps[index + 1].id])}>
                    <Merge className="size-3.5" />
                    Merge with next
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeletingLap(lap)}>
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
        meta: { align: 'center' },
      },
    ],
    [
      laps,
      editingLapId,
      editName,
      isSorted,
      startEditing,
      commitRename,
      cancelEditing,
      moveLap,
      onMerge,
    ],
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: laps,
    columns,
    state: {
      sorting,
      columnVisibility,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Footer aggregates
  const totals = useMemo(() => {
    const totalDistance = laps.reduce((sum, l) => sum + l.stats.distance, 0)
    const totalDuration = laps.reduce((sum, l) => sum + l.stats.duration, 0)
    const totalPoints = laps.reduce((sum, l) => sum + l.pointCount, 0)

    // Weighted averages for optional stats
    const avgHr = weightedAvg(
      laps,
      (l) => l.stats.avgHr,
      (l) => l.stats.duration,
    )
    const maxHr = laps.reduce<number | undefined>((max, l) => {
      if (l.stats.maxHr == null) return max
      return max == null ? l.stats.maxHr : Math.max(max, l.stats.maxHr)
    }, undefined)
    const avgCadence = weightedAvg(
      laps,
      (l) => l.stats.avgCadence,
      (l) => l.stats.duration,
    )
    const avgPower = weightedAvg(
      laps,
      (l) => l.stats.avgPower,
      (l) => l.stats.duration,
    )
    const maxSpeed = laps.reduce<number | undefined>((max, l) => {
      if (l.stats.maxSpeed == null) return max
      return max == null ? l.stats.maxSpeed : Math.max(max, l.stats.maxSpeed)
    }, undefined)
    const totalCalories = laps.reduce<number | undefined>((sum, l) => {
      if (l.stats.calories == null) return sum
      return (sum ?? 0) + l.stats.calories
    }, undefined)
    const totalElevGain = laps.reduce<number | undefined>((sum, l) => {
      if (l.stats.elevationGain == null) return sum
      return (sum ?? 0) + l.stats.elevationGain
    }, undefined)
    const totalElevLoss = laps.reduce<number | undefined>((sum, l) => {
      if (l.stats.elevationLoss == null) return sum
      return (sum ?? 0) + l.stats.elevationLoss
    }, undefined)

    return {
      totalDistance,
      totalDuration,
      totalPoints,
      avgHr,
      maxHr,
      avgCadence,
      avgPower,
      maxSpeed,
      totalCalories,
      totalElevGain,
      totalElevLoss,
    }
  }, [laps])

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card/80 overflow-hidden">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-border/60 hover:bg-transparent">
                {headerGroup.headers.map((header) => {
                  const align =
                    (header.column.columnDef.meta as { align?: string })?.align ?? 'left'
                  return (
                    <TableHead
                      key={header.id}
                      className={`text-xs uppercase tracking-wider text-muted-foreground font-medium ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className="border-border/40 hover:bg-warm-50/50 dark:hover:bg-warm-800/20 transition-colors"
              >
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as { align?: string })?.align ?? 'left'
                  return (
                    <TableCell
                      key={cell.id}
                      className={`text-sm ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-warm-50/50 dark:bg-warm-800/10 hover:bg-warm-50/50 dark:hover:bg-warm-800/10">
              {table.getVisibleFlatColumns().map((col) => {
                const align = (col.columnDef.meta as { align?: string })?.align ?? 'left'
                const cls = `text-sm font-medium ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''}`
                let content: string | null = null

                switch (col.id) {
                  case 'index':
                    content = ''
                    break
                  case 'name':
                    content = `${laps.length} laps`
                    break
                  case 'distance':
                    content = formatDistance(totals.totalDistance)
                    break
                  case 'duration':
                    content = formatDuration(totals.totalDuration)
                    break
                  case 'pace':
                    content = formatPace(totals.totalDistance, totals.totalDuration)
                    break
                  case 'avgHr':
                    content = totals.avgHr != null ? `${Math.round(totals.avgHr)}` : ''
                    break
                  case 'maxHr':
                    content = totals.maxHr != null ? `${totals.maxHr}` : ''
                    break
                  case 'avgCadence':
                    content = totals.avgCadence != null ? `${Math.round(totals.avgCadence)}` : ''
                    break
                  case 'avgPower':
                    content = totals.avgPower != null ? `${Math.round(totals.avgPower)}W` : ''
                    break
                  case 'maxSpeed':
                    content = totals.maxSpeed != null ? formatSpeed(totals.maxSpeed) : ''
                    break
                  case 'calories':
                    content = totals.totalCalories != null ? `${totals.totalCalories}` : ''
                    break
                  case 'elevationGain':
                    content = totals.totalElevGain != null ? `${totals.totalElevGain}m` : ''
                    break
                  case 'elevationLoss':
                    content = totals.totalElevLoss != null ? `${totals.totalElevLoss}m` : ''
                    break
                  case 'pointCount':
                    content = `${totals.totalPoints}`
                    break
                  case 'actions':
                    content = ''
                    break
                }

                return (
                  <TableCell key={col.id} className={cls}>
                    <span className="tabular-nums">{content}</span>
                  </TableCell>
                )
              })}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deletingLap !== null}
        onOpenChange={(open) => !open && setDeletingLap(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lap?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deletingLap?.name}" (
              {deletingLap ? formatDistance(deletingLap.stats.distance) : ''}). This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingLap) onDelete(deletingLap.id)
                setDeletingLap(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Split dialog */}
      {splitLap && (
        <SplitDialog
          lap={splitLap}
          sourceFormat={sourceFormat}
          onSplit={(pointIndex) => {
            onSplit(splitLap.id, pointIndex)
            setSplitLap(null)
          }}
          onClose={() => setSplitLap(null)}
        />
      )}
    </>
  )
}

function weightedAvg(
  laps: LapHandle[],
  getValue: (l: LapHandle) => number | undefined,
  getWeight: (l: LapHandle) => number,
): number | undefined {
  let totalValue = 0
  let totalWeight = 0
  for (const l of laps) {
    const v = getValue(l)
    if (v == null) continue
    const w = getWeight(l)
    totalValue += v * w
    totalWeight += w
  }
  return totalWeight > 0 ? totalValue / totalWeight : undefined
}
