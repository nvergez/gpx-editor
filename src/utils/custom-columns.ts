import type { LapStats } from './gpx-parser'
import type { Doc } from '../../convex/_generated/dataModel'

export type ColumnDefinition = Doc<'columnDefinitions'>
export type ActivityColumn = Doc<'activityColumns'>
export type ColumnValue = Doc<'columnValues'>

export type FormulaOperator = 'divide' | 'multiply' | 'add' | 'subtract' | 'divideby'

export interface Formula {
  operator: FormulaOperator
  left: string
  right: string
}

/** Built-in LapStats fields available as formula operands */
export const BUILTIN_OPERANDS: { key: keyof LapStats; label: string; unit: string }[] = [
  { key: 'distance', label: 'Distance', unit: 'm' },
  { key: 'duration', label: 'Duration', unit: 's' },
  { key: 'avgHr', label: 'Avg HR', unit: 'bpm' },
  { key: 'maxHr', label: 'Max HR', unit: 'bpm' },
  { key: 'avgCadence', label: 'Avg Cadence', unit: 'rpm' },
  { key: 'avgPower', label: 'Avg Power', unit: 'W' },
  { key: 'maxSpeed', label: 'Max Speed', unit: 'm/s' },
  { key: 'calories', label: 'Calories', unit: 'kcal' },
  { key: 'elevationGain', label: 'Elev Gain', unit: 'm' },
  { key: 'elevationLoss', label: 'Elev Loss', unit: 'm' },
]

export type FormulaOperatorSymbol = '/' | '×' | '+' | '−'

export const FORMULA_OPERATORS: {
  value: FormulaOperator
  label: string
  symbol: FormulaOperatorSymbol
}[] = [
  { value: 'divide', label: 'A / B', symbol: '/' },
  { value: 'divideby', label: 'B / A', symbol: '/' },
  { value: 'multiply', label: 'A × B', symbol: '×' },
  { value: 'add', label: 'A + B', symbol: '+' },
  { value: 'subtract', label: 'A − B', symbol: '−' },
]

export function resolveOperand(
  operand: string,
  stats: LapStats,
  manualValues: Map<string, number>,
): number | undefined {
  if (operand in stats) return stats[operand as keyof LapStats]
  return manualValues.get(operand)
}

export function applyFormulaOperator(
  operator: FormulaOperator,
  a: number,
  b: number,
): number | undefined {
  switch (operator) {
    case 'divide':
      return b !== 0 ? a / b : undefined
    case 'divideby':
      return a !== 0 ? b / a : undefined
    case 'multiply':
      return a * b
    case 'add':
      return a + b
    case 'subtract':
      return a - b
  }
}

/** Evaluate a formula for a single lap */
export function evaluateFormula(
  formula: Formula,
  stats: LapStats,
  manualValues: Map<string, number>,
): number | undefined {
  const a = resolveOperand(formula.left, stats, manualValues)
  const b = resolveOperand(formula.right, stats, manualValues)
  if (a == null || b == null) return undefined
  return applyFormulaOperator(formula.operator, a, b)
}

/** Get operand choices for formula builder (built-in stats + manual custom columns) */
export function getOperandChoices(
  manualColumns: ColumnDefinition[],
): { value: string; label: string }[] {
  const choices: { value: string; label: string }[] = BUILTIN_OPERANDS.map((o) => ({
    value: o.key as string,
    label: `${o.label} (${o.unit})`,
  }))
  for (const col of manualColumns) {
    if (col.type === 'manual') {
      choices.push({ value: col._id as string, label: col.name })
    }
  }
  return choices
}

/** Build a lookup map: columnId → (lapId → value) */
export function buildValueLookup(values: ColumnValue[]): Map<string, Map<string, number>> {
  const lookup = new Map<string, Map<string, number>>()
  for (const v of values) {
    if (!lookup.has(v.columnId)) lookup.set(v.columnId, new Map())
    lookup.get(v.columnId)!.set(v.lapId, v.value)
  }
  return lookup
}

/** Sort activity columns by order and join with their definitions, filtering missing defs */
export function getSortedActivityColumns(
  activityColumns: ActivityColumn[],
  definitions: ColumnDefinition[],
): { link: ActivityColumn; def: ColumnDefinition }[] {
  return [...activityColumns]
    .sort((a, b) => a.order - b.order)
    .map((ac) => ({
      link: ac,
      def: definitions.find((d) => d._id === ac.columnId),
    }))
    .filter((x): x is { link: ActivityColumn; def: ColumnDefinition } => x.def != null)
}

/** Extract all manual column values for a single lap from the lookup */
export function getManualValuesForLap(
  valueLookup: Map<string, Map<string, number>>,
  lapId: string,
): Map<string, number> {
  const manualVals = new Map<string, number>()
  for (const [colId, lapMap] of valueLookup) {
    const v = lapMap.get(lapId)
    if (v != null) manualVals.set(colId, v)
  }
  return manualVals
}

/** Format a computed value for display */
export function formatComputedValue(value: number | undefined): string {
  if (value == null) return '-'
  if (!isFinite(value)) return '-'
  return Number(value.toFixed(2)).toString()
}
