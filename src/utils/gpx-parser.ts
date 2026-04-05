export interface TrackPoint {
  lat: number
  lon: number
  ele?: number
  time?: string
  hr?: number
  cadence?: number
  power?: number
  speed?: number
  temperature?: number
}

export interface LapStats {
  distance: number // meters
  duration: number // seconds
  avgHr?: number
  maxHr?: number
  avgCadence?: number
  avgPower?: number
  maxSpeed?: number // m/s
  calories?: number
  elevationGain?: number
  elevationLoss?: number
}

export interface GpxLap {
  id: string
  name: string
  points: TrackPoint[]
  startTime?: string
  endTime?: string
  stats: LapStats
}

export interface GpxData {
  name: string
  laps: GpxLap[]
  sourceFormat: 'gpx' | 'tcx'
}

// --- Point parsing ---

export function parseGpxPoints(segment: Element): TrackPoint[] {
  const points: TrackPoint[] = []
  const trkpts = segment.getElementsByTagName('trkpt')

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i]
    const lat = parseFloat(pt.getAttribute('lat') || '0')
    const lon = parseFloat(pt.getAttribute('lon') || '0')
    const eleEl = pt.getElementsByTagName('ele')[0]
    const timeEl = pt.getElementsByTagName('time')[0]

    // Extensions can use namespaced or non-namespaced tags
    const ext = pt.getElementsByTagName('extensions')[0]
    let hr: number | undefined
    let cadence: number | undefined
    let power: number | undefined
    let temperature: number | undefined

    if (ext) {
      hr = findNumericTag(ext, ['hr'])
      cadence = findNumericTag(ext, ['cad'])
      power = findNumericTag(ext, ['power', 'Watts'])
      temperature = findNumericTag(ext, ['atemp'])
    }

    points.push({
      lat,
      lon,
      ele: eleEl ? parseFloat(eleEl.textContent || '0') : undefined,
      time: timeEl ? timeEl.textContent || undefined : undefined,
      hr,
      cadence,
      power,
      temperature,
    })
  }

  return points
}

/** Search for a numeric value in extension tags, handling namespace prefixes */
export function findNumericTag(parent: Element, localNames: string[]): number | undefined {
  // Try all child elements and match by local name (ignoring namespace prefix)
  const children = parent.getElementsByTagName('*')
  for (let i = 0; i < children.length; i++) {
    const el = children[i]
    const localName = el.localName || el.tagName.split(':').pop()
    if (localName && localNames.includes(localName)) {
      const val = parseFloat(el.textContent || '')
      if (!isNaN(val)) return val
    }
  }
  return undefined
}

export function parseTcxTrackpoints(lapEl: Element): TrackPoint[] {
  const points: TrackPoint[] = []
  const trackpoints = lapEl.getElementsByTagName('Trackpoint')

  for (let i = 0; i < trackpoints.length; i++) {
    const tp = trackpoints[i]
    const pos = tp.getElementsByTagName('Position')[0]
    if (!pos) continue

    const lat = parseFloat(pos.getElementsByTagName('LatitudeDegrees')[0]?.textContent || '0')
    const lon = parseFloat(pos.getElementsByTagName('LongitudeDegrees')[0]?.textContent || '0')
    const altEl = tp.getElementsByTagName('AltitudeMeters')[0]
    const timeEl = tp.getElementsByTagName('Time')[0]
    const hrEl = tp.getElementsByTagName('HeartRateBpm')[0]
    const cadEl = tp.getElementsByTagName('Cadence')[0]

    // Extensions (ns3:TPX)
    const ext = tp.getElementsByTagName('Extensions')[0]
    let speed: number | undefined
    let power: number | undefined
    let cadence = cadEl ? parseFloat(cadEl.textContent || '') : undefined
    if (isNaN(cadence as number)) cadence = undefined

    if (ext) {
      speed = findNumericTag(ext, ['Speed'])
      power = findNumericTag(ext, ['Watts'])
      // RunCadence overrides top-level Cadence if present
      const runCad = findNumericTag(ext, ['RunCadence'])
      if (runCad !== undefined) cadence = runCad
    }

    points.push({
      lat,
      lon,
      ele: altEl ? parseFloat(altEl.textContent || '0') : undefined,
      time: timeEl ? timeEl.textContent || undefined : undefined,
      hr: hrEl
        ? parseFloat(hrEl.getElementsByTagName('Value')[0]?.textContent || '') || undefined
        : undefined,
      cadence,
      power,
      speed,
    })
  }

  return points
}

// --- Distance & duration ---

export function haversineDistance(p1: TrackPoint, p2: TrackPoint): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(p2.lat - p1.lat)
  const dLon = toRad(p2.lon - p1.lon)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function calculateDistance(points: TrackPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversineDistance(points[i - 1], points[i])
  }
  return total
}

function calculateDuration(points: TrackPoint[]): number {
  if (points.length < 2) return 0
  const first = points[0].time
  const last = points[points.length - 1].time
  if (!first || !last) return 0
  return (new Date(last).getTime() - new Date(first).getTime()) / 1000
}

export function computeStats(points: TrackPoint[]): LapStats {
  const distance = calculateDistance(points)
  const duration = calculateDuration(points)

  const hrs = points.map((p) => p.hr).filter((v): v is number => v !== undefined)
  const cadences = points.map((p) => p.cadence).filter((v): v is number => v !== undefined && v > 0)
  const powers = points.map((p) => p.power).filter((v): v is number => v !== undefined)
  const speeds = points.map((p) => p.speed).filter((v): v is number => v !== undefined)

  let elevationGain = 0
  let elevationLoss = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].ele
    const curr = points[i].ele
    if (prev !== undefined && curr !== undefined) {
      const diff = curr - prev
      if (diff > 0) elevationGain += diff
      else elevationLoss += Math.abs(diff)
    }
  }

  return {
    distance,
    duration,
    avgHr: hrs.length > 0 ? Math.round(avg(hrs)) : undefined,
    maxHr: hrs.length > 0 ? Math.max(...hrs) : undefined,
    avgCadence: cadences.length > 0 ? Math.round(avg(cadences)) : undefined,
    avgPower: powers.length > 0 ? Math.round(avg(powers)) : undefined,
    maxSpeed: speeds.length > 0 ? Math.max(...speeds) : undefined,
    elevationGain: elevationGain > 0 ? Math.round(elevationGain) : undefined,
    elevationLoss: elevationLoss > 0 ? Math.round(elevationLoss) : undefined,
  }
}

function avg(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function parseOptionalFloat(text: string | null | undefined): number | undefined {
  if (!text) return undefined
  const val = parseFloat(text)
  return isNaN(val) ? undefined : val
}

// --- Export ---

export function exportGpx(gpxData: GpxData): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Lapcraft"',
    '  xmlns="http://www.topografix.com/GPX/1/1"',
    '  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">',
    `  <metadata><name>${escapeXml(gpxData.name)}</name></metadata>`,
  ]

  for (const lap of gpxData.laps) {
    lines.push('  <trk>')
    lines.push(`    <name>${escapeXml(lap.name)}</name>`)
    lines.push('    <trkseg>')

    for (const pt of lap.points) {
      lines.push(`      <trkpt lat="${pt.lat}" lon="${pt.lon}">`)
      if (pt.ele !== undefined) {
        lines.push(`        <ele>${pt.ele}</ele>`)
      }
      if (pt.time) {
        lines.push(`        <time>${pt.time}</time>`)
      }
      if (
        pt.hr !== undefined ||
        pt.cadence !== undefined ||
        pt.power !== undefined ||
        pt.temperature !== undefined
      ) {
        lines.push('        <extensions>')
        if (pt.power !== undefined) {
          lines.push(`          <power>${pt.power}</power>`)
        }
        if (pt.hr !== undefined || pt.cadence !== undefined || pt.temperature !== undefined) {
          lines.push('          <gpxtpx:TrackPointExtension>')
          if (pt.hr !== undefined) lines.push(`            <gpxtpx:hr>${pt.hr}</gpxtpx:hr>`)
          if (pt.cadence !== undefined)
            lines.push(`            <gpxtpx:cad>${pt.cadence}</gpxtpx:cad>`)
          if (pt.temperature !== undefined)
            lines.push(`            <gpxtpx:atemp>${pt.temperature}</gpxtpx:atemp>`)
          lines.push('          </gpxtpx:TrackPointExtension>')
        }
        lines.push('        </extensions>')
      }
      lines.push('      </trkpt>')
    }

    lines.push('    </trkseg>')
    lines.push('  </trk>')
  }

  lines.push('</gpx>')
  return lines.join('\n')
}

export function exportTcx(gpxData: GpxData): string {
  const firstTime = gpxData.laps[0]?.startTime || new Date().toISOString()
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase',
    '  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
    '  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
    '  xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">',
    '  <Activities>',
    '    <Activity Sport="Running">',
    `      <Id>${firstTime}</Id>`,
    `      <Notes>${escapeXml(gpxData.name)}</Notes>`,
  ]

  for (const lap of gpxData.laps) {
    const startTime = lap.startTime || firstTime
    const { stats } = lap
    lines.push(`      <Lap StartTime="${startTime}">`)
    lines.push(`        <TotalTimeSeconds>${stats.duration.toFixed(3)}</TotalTimeSeconds>`)
    lines.push(`        <DistanceMeters>${stats.distance.toFixed(2)}</DistanceMeters>`)
    if (stats.maxSpeed !== undefined) {
      lines.push(`        <MaximumSpeed>${stats.maxSpeed}</MaximumSpeed>`)
    }
    if (stats.calories !== undefined) {
      lines.push(`        <Calories>${stats.calories}</Calories>`)
    }
    if (stats.avgHr !== undefined) {
      lines.push(
        `        <AverageHeartRateBpm><Value>${Math.round(stats.avgHr)}</Value></AverageHeartRateBpm>`,
      )
    }
    if (stats.maxHr !== undefined) {
      lines.push(`        <MaximumHeartRateBpm><Value>${stats.maxHr}</Value></MaximumHeartRateBpm>`)
    }
    lines.push('        <Intensity>Active</Intensity>')
    lines.push('        <TriggerMethod>Manual</TriggerMethod>')
    lines.push('        <Track>')

    for (const pt of lap.points) {
      lines.push('          <Trackpoint>')
      if (pt.time) {
        lines.push(`            <Time>${pt.time}</Time>`)
      }
      lines.push('            <Position>')
      lines.push(`              <LatitudeDegrees>${pt.lat}</LatitudeDegrees>`)
      lines.push(`              <LongitudeDegrees>${pt.lon}</LongitudeDegrees>`)
      lines.push('            </Position>')
      if (pt.ele !== undefined) {
        lines.push(`            <AltitudeMeters>${pt.ele}</AltitudeMeters>`)
      }
      if (pt.hr !== undefined) {
        lines.push(`            <HeartRateBpm><Value>${pt.hr}</Value></HeartRateBpm>`)
      }
      if (pt.cadence !== undefined) {
        lines.push(`            <Cadence>${pt.cadence}</Cadence>`)
      }
      if (pt.speed !== undefined || pt.power !== undefined) {
        lines.push('            <Extensions>')
        lines.push('              <ns3:TPX>')
        if (pt.speed !== undefined) lines.push(`                <ns3:Speed>${pt.speed}</ns3:Speed>`)
        if (pt.power !== undefined) lines.push(`                <ns3:Watts>${pt.power}</ns3:Watts>`)
        lines.push('              </ns3:TPX>')
        lines.push('            </Extensions>')
      }
      lines.push('          </Trackpoint>')
    }

    lines.push('        </Track>')
    lines.push('      </Lap>')
  }

  lines.push('    </Activity>')
  lines.push('  </Activities>')
  lines.push('</TrainingCenterDatabase>')
  return lines.join('\n')
}

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// --- Formatting ---

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(2)} km`
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '-'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function formatPace(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return '-'
  const paceSecondsPerKm = seconds / (meters / 1000)
  const paceMin = Math.floor(paceSecondsPerKm / 60)
  const paceSec = Math.floor(paceSecondsPerKm % 60)
  return `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`
}

export function formatSpeed(ms: number): string {
  return `${(ms * 3.6).toFixed(1)} km/h`
}

export function formatAvgSpeed(meters: number, seconds: number): string {
  if (meters <= 0 || seconds <= 0) return '-'
  return formatSpeed(meters / seconds)
}
