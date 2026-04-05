import type { LapHandle } from './dom-model'
import type { LapStats } from './gpx-parser'
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatAvgSpeed,
  formatSpeed,
} from './gpx-parser'
import type { ColumnDefinition, ActivityColumn, ColumnValue } from './custom-columns'
import {
  evaluateFormula,
  formatComputedValue,
  buildValueLookup,
  getSortedActivityColumns,
  getManualValuesForLap,
} from './custom-columns'

interface CsvExportOptions {
  laps: LapHandle[]
  /** Whether to use pace (true) or avg speed (false) for the pace column */
  usePace: boolean
  /** Built-in column visibility (key → visible) */
  builtinVisibility: Record<string, boolean>
  /** Custom column config */
  customColumns?: {
    definitions: ColumnDefinition[]
    activityColumns: ActivityColumn[]
    values: ColumnValue[]
  }
}

/** Map of built-in column key → { header, format } */
const BUILTIN_FORMATTERS: Record<
  string,
  { header: string; format: (stats: LapStats, lap: LapHandle) => string }
> = {
  distance: {
    header: 'Distance',
    format: (stats) => formatDistance(stats.distance),
  },
  duration: {
    header: 'Duration',
    format: (stats) => formatDuration(stats.duration),
  },
  pace: {
    header: 'Pace', // header is overridden dynamically in exportLapsCsv
    format: (stats) => formatPace(stats.distance, stats.duration),
  },
  avgHr: {
    header: 'Avg HR',
    format: (stats) => (stats.avgHr != null ? `${Math.round(stats.avgHr)}` : ''),
  },
  maxHr: {
    header: 'Max HR',
    format: (stats) => (stats.maxHr != null ? `${stats.maxHr}` : ''),
  },
  avgCadence: {
    header: 'Cadence',
    format: (stats) => (stats.avgCadence != null ? `${stats.avgCadence}` : ''),
  },
  avgPower: {
    header: 'Power (W)',
    format: (stats) => (stats.avgPower != null ? `${stats.avgPower}` : ''),
  },
  maxSpeed: {
    header: 'Max Speed',
    format: (stats) => (stats.maxSpeed != null ? formatSpeed(stats.maxSpeed) : ''),
  },
  calories: {
    header: 'Calories',
    format: (stats) => (stats.calories != null ? `${stats.calories}` : ''),
  },
  elevationGain: {
    header: 'Elev + (m)',
    format: (stats) => (stats.elevationGain != null ? `${stats.elevationGain}` : ''),
  },
  elevationLoss: {
    header: 'Elev - (m)',
    format: (stats) => (stats.elevationLoss != null ? `${stats.elevationLoss}` : ''),
  },
  pointCount: {
    header: 'Points',
    format: (_stats, lap) => `${lap.pointCount}`,
  },
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportLapsCsv({
  laps,
  usePace,
  builtinVisibility,
  customColumns,
}: CsvExportOptions): string {
  const headers: string[] = ['#', 'Name']
  const builtinKeys: string[] = []

  // Build formatters with dynamic pace/speed header
  const formatters: Record<
    string,
    { header: string; format: (stats: LapStats, lap: LapHandle) => string }
  > = {
    ...BUILTIN_FORMATTERS,
    pace: usePace
      ? { header: 'Pace', format: (stats) => formatPace(stats.distance, stats.duration) }
      : { header: 'Avg Speed', format: (stats) => formatAvgSpeed(stats.distance, stats.duration) },
  }

  // Built-in columns that are visible
  const allBuiltinKeys = [
    'distance',
    'duration',
    'pace',
    'avgHr',
    'maxHr',
    'avgCadence',
    'avgPower',
    'maxSpeed',
    'calories',
    'elevationGain',
    'elevationLoss',
    'pointCount',
  ]
  for (const key of allBuiltinKeys) {
    if (builtinVisibility[key] !== false) {
      const fmt = formatters[key]
      if (fmt) {
        headers.push(fmt.header)
        builtinKeys.push(key)
      }
    }
  }

  // Custom columns
  const sortedCustom = customColumns
    ? getSortedActivityColumns(customColumns.activityColumns, customColumns.definitions).map(
        (x) => x.def,
      )
    : []

  for (const def of sortedCustom) {
    headers.push(def.name)
  }

  const valueLookup = customColumns
    ? buildValueLookup(customColumns.values)
    : new Map<string, Map<string, number>>()

  const rows: string[][] = [headers]

  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i]
    const row: string[] = [`${i + 1}`, escapeCsv(lap.name)]

    for (const key of builtinKeys) {
      row.push(escapeCsv(formatters[key].format(lap.stats, lap)))
    }

    for (const def of sortedCustom) {
      if (def.type === 'manual') {
        const val = valueLookup.get(def._id)?.get(lap.id)
        row.push(val != null ? `${val}` : '')
      } else if (def.formula) {
        const result = evaluateFormula(
          def.formula,
          lap.stats,
          getManualValuesForLap(valueLookup, lap.id),
        )
        row.push(formatComputedValue(result))
      } else {
        row.push('')
      }
    }

    rows.push(row)
  }

  return rows.map((r) => r.join(',')).join('\n')
}
