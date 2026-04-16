import { parseToDocument, getLapHandles } from './dom-operations'
import { applyFormulaOperator, resolveOperand, type Formula } from './custom-columns'
import type { ComparisonActivityPoint, ComputedActivityInput } from '../../convex/comparisons'

/**
 * Computed columns cannot be evaluated on the Convex server because the
 * built-in operands (distance, duration, HR, cadence, etc.) live only in the
 * XML blob in file storage, and parsing relies on `DOMParser` which is
 * browser-only. We therefore download each activity's XML in parallel, parse
 * per-lap stats, evaluate the formula per lap, and aggregate on the client.
 */
export async function computeComparisonPoints(
  formula: Formula,
  activities: ComputedActivityInput[],
): Promise<ComparisonActivityPoint[]> {
  const results = await Promise.all(
    activities.map(async (input): Promise<ComparisonActivityPoint | null> => {
      if (!input.xmlUrl) return null

      const res = await fetch(input.xmlUrl)
      if (!res.ok) return null
      const xml = await res.text()

      let laps
      try {
        const doc = parseToDocument(xml)
        laps = getLapHandles(doc)
      } catch {
        return null
      }

      // Build lapId → manualValues map for each operand that is a manual column
      const manualPerLap = new Map<string, Map<string, number>>()
      for (const [operandColumnId, rows] of Object.entries(input.operandValues)) {
        for (const row of rows) {
          if (!manualPerLap.has(row.lapId)) manualPerLap.set(row.lapId, new Map())
          manualPerLap.get(row.lapId)!.set(operandColumnId, row.value)
        }
      }

      const values: number[] = []
      const weightDistance: number[] = []
      const weightDuration: number[] = []
      const leftOperand: number[] = []
      const rightOperand: number[] = []
      // `divideby` is B/A — swap operand arrays so tooltip labels (also swapped
      // in the route) pair consistently with the values shown.
      const swapForDisplay = formula.operator === 'divideby'
      for (const lap of laps) {
        const manualValues = manualPerLap.get(lap.id) ?? new Map<string, number>()
        const a = resolveOperand(formula.left, lap.stats, manualValues)
        const b = resolveOperand(formula.right, lap.stats, manualValues)
        if (a == null || b == null) continue
        const v = applyFormulaOperator(formula.operator, a, b)
        if (v == null || !Number.isFinite(v)) continue
        values.push(v)
        weightDistance.push(lap.stats.distance)
        weightDuration.push(lap.stats.duration)
        leftOperand.push(swapForDisplay ? b : a)
        rightOperand.push(swapForDisplay ? a : b)
      }

      if (values.length === 0) return null

      return {
        activity: input.activity,
        values,
        weights: { distance: weightDistance, duration: weightDuration },
        operandValues: { left: leftOperand, right: rightOperand },
      }
    }),
  )

  return results.filter((p): p is ComparisonActivityPoint => p !== null)
}
