import { useState, useMemo, useCallback } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type {
  ColumnDefinition,
  ActivityColumn,
  Formula,
  FormulaOperator,
} from '~/utils/custom-columns'
import {
  BUILTIN_OPERANDS,
  FORMULA_OPERATORS,
  getOperandChoices,
  getSortedActivityColumns,
} from '~/utils/custom-columns'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Switch } from '~/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
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
import { Plus, Trash2, Calculator, PenLine, Share2, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface CustomizeColumnsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  activityId: Id<'activities'>
  /** All column definitions owned by user */
  allDefinitions: ColumnDefinition[]
  /** Columns currently attached to this activity */
  activityColumns: ActivityColumn[]
  /** Built-in column visibility state */
  builtinVisibility: Record<string, boolean>
  onBuiltinVisibilityChange: (key: string, visible: boolean) => void
}

type CreateMode = 'manual' | 'computed' | null

const BUILTIN_COLUMNS = [
  { key: 'distance', label: 'Distance' },
  { key: 'duration', label: 'Duration' },
  { key: 'pace', label: 'Pace' },
  { key: 'avgHr', label: 'Avg HR' },
  { key: 'maxHr', label: 'Max HR' },
  { key: 'avgCadence', label: 'Cadence' },
  { key: 'avgPower', label: 'Power' },
  { key: 'maxSpeed', label: 'Max Speed' },
  { key: 'calories', label: 'Calories' },
  { key: 'elevationGain', label: 'Elev +' },
  { key: 'elevationLoss', label: 'Elev −' },
  { key: 'pointCount', label: 'Points' },
] as const

export function CustomizeColumnsDialog({
  open,
  onOpenChange,
  activityId,
  allDefinitions,
  activityColumns,
  builtinVisibility,
  onBuiltinVisibilityChange,
}: CustomizeColumnsDialogProps) {
  const [createMode, setCreateMode] = useState<CreateMode>(null)
  const [newName, setNewName] = useState('')
  const [newOperator, setNewOperator] = useState<FormulaOperator>('divide')
  const [newLeft, setNewLeft] = useState('')
  const [newRight, setNewRight] = useState('')
  const [deletingColumn, setDeletingColumn] = useState<ColumnDefinition | null>(null)

  // Edit state for an existing column
  const [editingId, setEditingId] = useState<Id<'columnDefinitions'> | null>(null)
  const [editName, setEditName] = useState('')
  const [editOperator, setEditOperator] = useState<FormulaOperator>('divide')
  const [editLeft, setEditLeft] = useState('')
  const [editRight, setEditRight] = useState('')

  const createDefinition = useMutation(api.columns.createDefinition)
  const deleteDefinition = useMutation(api.columns.deleteDefinition)
  const updateDefinition = useMutation(api.columns.updateDefinition)
  const addToActivity = useMutation(api.columns.addColumnToActivity)
  const removeFromActivity = useMutation(api.columns.removeColumnFromActivity)

  // Columns currently in this activity
  const activeColumnIds = useMemo(
    () => new Set(activityColumns.map((ac) => ac.columnId)),
    [activityColumns],
  )

  // Manual columns (for formula operand choices)
  const manualColumns = useMemo(
    () => allDefinitions.filter((d) => d.type === 'manual'),
    [allDefinitions],
  )

  const operandChoices = useMemo(() => getOperandChoices(manualColumns), [manualColumns])

  // Shared columns available to add (not already in this activity)
  const availableShared = useMemo(
    () => allDefinitions.filter((d) => d.isShared && !activeColumnIds.has(d._id)),
    [allDefinitions, activeColumnIds],
  )

  // Columns that depend on a given column
  const getDependents = (colId: Id<'columnDefinitions'>) =>
    allDefinitions.filter(
      (d) =>
        d.type === 'computed' &&
        d.formula &&
        (d.formula.left === colId || d.formula.right === colId),
    )

  async function handleCreate() {
    if (!newName.trim()) return

    const formula: Formula | undefined =
      createMode === 'computed' && newLeft && newRight
        ? { operator: newOperator, left: newLeft, right: newRight }
        : undefined

    if (createMode === 'computed' && !formula) {
      toast.error('Please select both operands for the formula')
      return
    }

    const colId = await createDefinition({
      name: newName.trim(),
      type: createMode!,
      formula,
      isShared: false,
    })

    // Immediately add to this activity
    const maxOrder = activityColumns.reduce((max, ac) => Math.max(max, ac.order), 0)
    await addToActivity({
      activityId,
      columnId: colId,
      order: maxOrder + 1,
    })

    setCreateMode(null)
    setNewName('')
    setNewLeft('')
    setNewRight('')
    setNewOperator('divide')
    toast.success(`Column "${newName.trim()}" created`)
  }

  async function handleToggleColumn(def: ColumnDefinition) {
    if (activeColumnIds.has(def._id)) {
      // Remove from activity
      const link = activityColumns.find((ac) => ac.columnId === def._id)
      if (link) await removeFromActivity({ id: link._id })
    } else {
      // Add to activity
      const maxOrder = activityColumns.reduce((max, ac) => Math.max(max, ac.order), 0)
      await addToActivity({ activityId, columnId: def._id, order: maxOrder + 1 })
    }
  }

  async function handleDeleteColumn(def: ColumnDefinition) {
    await deleteDefinition({ id: def._id })
    setDeletingColumn(null)
    toast.success(`Column "${def.name}" deleted`)
  }

  async function handleToggleShared(def: ColumnDefinition) {
    await updateDefinition({ id: def._id, isShared: !def.isShared })
  }

  function startEditing(def: ColumnDefinition) {
    setEditingId(def._id)
    setEditName(def.name)
    if (def.type === 'computed' && def.formula) {
      setEditOperator(def.formula.operator)
      setEditLeft(def.formula.left)
      setEditRight(def.formula.right)
    }
  }

  function cancelEditing() {
    setEditingId(null)
  }

  async function saveEditing(def: ColumnDefinition) {
    if (!editName.trim()) return
    const patch: {
      id: Id<'columnDefinitions'>
      name?: string
      formula?: Formula
    } = { id: def._id }

    if (editName.trim() !== def.name) {
      patch.name = editName.trim()
    }
    if (def.type === 'computed' && editLeft && editRight) {
      const newFormula: Formula = { operator: editOperator, left: editLeft, right: editRight }
      if (
        !def.formula ||
        def.formula.operator !== newFormula.operator ||
        def.formula.left !== newFormula.left ||
        def.formula.right !== newFormula.right
      ) {
        patch.formula = newFormula
      }
    }
    if (patch.name !== undefined || patch.formula !== undefined) {
      await updateDefinition(patch)
      toast.success(`Column "${editName.trim()}" updated`)
    }
    setEditingId(null)
  }

  /** Human-readable formula summary, e.g. "Distance / Duration" */
  const formulaSummary = useCallback(
    (formula: Formula): string => {
      const resolveLabel = (operand: string): string => {
        const builtin = BUILTIN_OPERANDS.find((o) => o.key === operand)
        if (builtin) return builtin.label
        const col = allDefinitions.find((d) => d._id === operand)
        return col?.name ?? operand
      }
      const op = FORMULA_OPERATORS.find((o) => o.value === formula.operator)
      const a = resolveLabel(formula.left)
      const b = resolveLabel(formula.right)
      if (formula.operator === 'divideby') return `${b} / ${a}`
      return `${a} ${op?.symbol ?? '?'} ${b}`
    },
    [allDefinitions],
  )

  function confirmDelete(def: ColumnDefinition) {
    const deps = getDependents(def._id)
    if (deps.length > 0) {
      // Will cascade
      setDeletingColumn(def)
    } else {
      handleDeleteColumn(def)
    }
  }

  const activeCustomColumns = useMemo(
    () => getSortedActivityColumns(activityColumns, allDefinitions),
    [activityColumns, allDefinitions],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customize columns</DialogTitle>
            <DialogDescription>
              Toggle built-in columns and manage custom columns for this activity.
            </DialogDescription>
          </DialogHeader>

          {/* Built-in columns */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              Built-in columns
            </p>
            {BUILTIN_COLUMNS.map((col) => (
              <label
                key={col.key}
                className="flex items-center justify-between py-1.5 px-1 rounded-md hover:bg-muted/50 cursor-pointer"
              >
                <span className="text-sm">{col.label}</span>
                <Switch
                  size="sm"
                  checked={builtinVisibility[col.key] !== false}
                  onCheckedChange={(checked) => onBuiltinVisibilityChange(col.key, !!checked)}
                />
              </label>
            ))}
          </div>

          {/* Custom columns in this activity */}
          {activeCustomColumns.length > 0 && (
            <div className="space-y-1 border-t border-border/60 pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Custom columns
              </p>
              {activeCustomColumns.map(({ link, def }) => {
                const isEditing = editingId === def._id
                return (
                  <div
                    key={link._id}
                    className={`rounded-lg transition-colors ${isEditing ? 'bg-muted/60 p-2' : 'hover:bg-muted/50 px-1'}`}
                  >
                    {/* Collapsed row */}
                    <div className="flex items-center gap-2 py-1.5">
                      {def.type === 'manual' ? (
                        <PenLine className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <Calculator className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{def.name}</span>
                        {def.type === 'computed' && def.formula && !isEditing && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {formulaSummary(def.formula)}
                          </span>
                        )}
                      </div>
                      {!isEditing && (
                        <>
                          <button
                            onClick={() => startEditing(def)}
                            className="p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                            title="Edit column"
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            onClick={() => handleToggleShared(def)}
                            className={`p-1 rounded-md transition-colors ${
                              def.isShared
                                ? 'text-primary hover:bg-primary/10'
                                : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted'
                            }`}
                            title={
                              def.isShared
                                ? 'Shared (click to unshare)'
                                : 'Make available to other activities'
                            }
                          >
                            <Share2 className="size-3" />
                          </button>
                          <button
                            onClick={() => confirmDelete(def)}
                            className="p-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Delete column"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Expanded edit form */}
                    {isEditing && (
                      <div className="space-y-2.5 pt-1.5 pb-1">
                        <div className="space-y-1">
                          <Label htmlFor={`edit-name-${def._id}`} className="text-xs">
                            Name
                          </Label>
                          <Input
                            id={`edit-name-${def._id}`}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditing(def)
                              if (e.key === 'Escape') cancelEditing()
                            }}
                          />
                        </div>

                        {def.type === 'computed' && (
                          <div className="space-y-1">
                            <Label className="text-xs">Formula</Label>
                            <div className="flex items-center gap-1.5">
                              <Select
                                value={editLeft}
                                onValueChange={(v) => setEditLeft(v as string)}
                              >
                                <SelectTrigger size="sm" className="flex-1">
                                  <SelectValue placeholder="A">
                                    {operandChoices.find((c) => c.value === editLeft)?.label}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {operandChoices.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={editOperator}
                                onValueChange={(v) => setEditOperator(v as FormulaOperator)}
                              >
                                <SelectTrigger size="sm" className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FORMULA_OPERATORS.map((op) => (
                                    <SelectItem key={op.value} value={op.value}>
                                      {op.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={editRight}
                                onValueChange={(v) => setEditRight(v as string)}
                              >
                                <SelectTrigger size="sm" className="flex-1">
                                  <SelectValue placeholder="B">
                                    {operandChoices.find((c) => c.value === editRight)?.label}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {operandChoices.map((c) => (
                                    <SelectItem key={c.value} value={c.value}>
                                      {c.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-1.5 justify-end">
                          <Button size="sm" variant="ghost" onClick={cancelEditing}>
                            <X className="size-3.5" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEditing(def)}
                            disabled={!editName.trim()}
                          >
                            <Check className="size-3.5" />
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add shared column from library */}
          {availableShared.length > 0 && (
            <div className="space-y-1 border-t border-border/60 pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                Available shared columns
              </p>
              {availableShared.map((def) => (
                <div
                  key={def._id}
                  className="flex items-center gap-2 py-1.5 px-1 rounded-md hover:bg-muted/50"
                >
                  {def.type === 'manual' ? (
                    <PenLine className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Calculator className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm flex-1 truncate">{def.name}</span>
                  <Button size="sm" variant="ghost" onClick={() => handleToggleColumn(def)}>
                    <Plus className="size-3.5" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Create new column */}
          {createMode === null ? (
            <div className="flex gap-2 border-t border-border/60 pt-3">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setCreateMode('manual')}
              >
                <PenLine className="size-3.5" />
                Manual column
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => setCreateMode('computed')}
              >
                <Calculator className="size-3.5" />
                Computed column
              </Button>
            </div>
          ) : (
            <div className="space-y-3 border-t border-border/60 pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                New {createMode} column
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="col-name">Name</Label>
                <Input
                  id="col-name"
                  placeholder={createMode === 'manual' ? 'e.g., Stroke count' : 'e.g., Strokes/sec'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8"
                  autoFocus
                />
              </div>

              {createMode === 'computed' && (
                <div className="space-y-2">
                  <Label>Formula</Label>
                  <div className="flex items-center gap-2">
                    <Select value={newLeft} onValueChange={(v) => setNewLeft(v as string)}>
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue placeholder="A">
                          {operandChoices.find((c) => c.value === newLeft)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {operandChoices.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={newOperator}
                      onValueChange={(v) => setNewOperator(v as FormulaOperator)}
                    >
                      <SelectTrigger size="sm" className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMULA_OPERATORS.map((op) => (
                          <SelectItem key={op.value} value={op.value}>
                            {op.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={newRight} onValueChange={(v) => setNewRight(v as string)}>
                      <SelectTrigger size="sm" className="flex-1">
                        <SelectValue placeholder="B">
                          {operandChoices.find((c) => c.value === newRight)?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {operandChoices.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCreateMode(null)
                    setNewName('')
                    setNewLeft('')
                    setNewRight('')
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!newName.trim()}>
                  Create
                </Button>
              </div>
            </div>
          )}

          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>

      {/* Cascade delete warning */}
      <AlertDialog
        open={deletingColumn !== null}
        onOpenChange={(open) => !open && setDeletingColumn(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete column?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deletingColumn?.name}" is used by computed columns:{' '}
              {deletingColumn &&
                getDependents(deletingColumn._id)
                  .map((d) => `"${d.name}"`)
                  .join(', ')}
              . Deleting it will also delete those computed columns and all their data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deletingColumn && handleDeleteColumn(deletingColumn)}>
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
