import type { ActivityDocument, LapHandle } from './dom-model'
import type { TrackPoint, LapStats } from './gpx-parser'
import { computeStats, parseGpxPoints, parseOptionalFloat, parseTcxTrackpoints } from './gpx-parser'

// --- Parsing ---

/**
 * Generate a deterministic lap ID from element content so the same XML
 * always produces the same IDs across page loads. This is critical for
 * column values stored in Convex which are keyed by lapId.
 */
function deterministicLapId(el: Element, format: 'gpx' | 'tcx', index: number): string {
  // TCX: use StartTime attribute (always present on <Lap>)
  if (format === 'tcx') {
    const startTime = el.getAttribute('StartTime')
    if (startTime) return `lap-tcx-${startTime}`
  }

  // GPX: use first trackpoint's lat/lon/time
  const firstPt = el.getElementsByTagName(format === 'gpx' ? 'trkpt' : 'Trackpoint')[0]
  if (firstPt) {
    const lat = firstPt.getAttribute('lat') ?? ''
    const lon = firstPt.getAttribute('lon') ?? ''
    const time =
      firstPt.getElementsByTagName('time')[0]?.textContent ??
      firstPt.getElementsByTagName('Time')[0]?.textContent ??
      ''
    const fingerprint = `${lat},${lon},${time}`
    if (fingerprint !== ',,') return `lap-${format}-${index}-${fingerprint}`
  }

  // Fallback: index only (stable as long as lap order doesn't change)
  return `lap-${format}-idx-${index}`
}

export function parseToDocument(xml: string): ActivityDocument {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('Invalid XML file: ' + parseError.textContent)
  }

  const sourceFormat = detectFormat(doc)
  const name = extractName(doc, sourceFormat)

  const actDoc: ActivityDocument = { doc, sourceFormat, name, lapNames: new Map() }

  const laps = getLapElements(actDoc)
  const usedIds = new Set<string>()
  laps.forEach((el, i) => {
    let id = deterministicLapId(el, sourceFormat, i)
    // Ensure uniqueness in case two laps fingerprint identically
    if (usedIds.has(id)) {
      let suffix = 2
      while (usedIds.has(`${id}-${suffix}`)) suffix++
      id = `${id}-${suffix}`
    }
    usedIds.add(id)
    el.setAttribute('data-lap-id', id)
    if (sourceFormat === 'tcx') {
      actDoc.lapNames.set(id, `Lap ${i + 1}`)
    }
  })

  return actDoc
}

function detectFormat(doc: Document): 'gpx' | 'tcx' {
  if (doc.getElementsByTagName('TrainingCenterDatabase').length > 0) return 'tcx'
  if (doc.getElementsByTagName('gpx').length > 0) return 'gpx'
  throw new Error('Unrecognized file format. Expected GPX or TCX.')
}

function extractName(doc: Document, format: 'gpx' | 'tcx'): string {
  if (format === 'gpx') {
    const nameEl = doc.querySelector('trk > name') || doc.querySelector('metadata > name')
    return nameEl?.textContent || 'Unnamed Track'
  }
  const activity = doc.getElementsByTagName('Activity')[0]
  if (!activity) throw new Error('No Activity found in TCX file')
  const notes = activity.getElementsByTagName('Notes')[0]?.textContent
  const sport = activity.getAttribute('Sport') || 'Activity'
  return notes || sport
}

// --- Lap access ---

export function countLaps(actDoc: ActivityDocument): number {
  return getLapElements(actDoc).length
}

function getLapElements(actDoc: ActivityDocument): Element[] {
  const { doc, sourceFormat } = actDoc
  if (sourceFormat === 'gpx') {
    return Array.from(doc.getElementsByTagName('trk'))
  }
  const activity = doc.getElementsByTagName('Activity')[0]
  if (!activity) return []
  // Only direct Lap children of Activity (not nested)
  return Array.from(activity.getElementsByTagName('Lap'))
}

function getLapId(el: Element): string {
  return el.getAttribute('data-lap-id') || ''
}

export function getLapHandles(actDoc: ActivityDocument): LapHandle[] {
  const elements = getLapElements(actDoc)
  return elements
    .map((el) => {
      const id = getLapId(el)
      if (!id) return null
      const name = getLapName(actDoc, el, id)
      const pointCount = countPoints(el, actDoc.sourceFormat)
      if (pointCount === 0) return null
      const stats = computeStatsFromElement(el, actDoc.sourceFormat)
      return { id, element: el, name, stats, pointCount } as LapHandle
    })
    .filter((h): h is LapHandle => h !== null)
}

function getLapName(actDoc: ActivityDocument, el: Element, id: string): string {
  if (actDoc.sourceFormat === 'gpx') {
    // Direct child <name> of <trk>
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i]
      if (child.nodeType === 1 && (child as Element).tagName === 'name') {
        return (child as Element).textContent || 'Unnamed Track'
      }
    }
    return 'Unnamed Track'
  }
  return actDoc.lapNames.get(id) || 'Unnamed Lap'
}

function countPoints(el: Element, format: 'gpx' | 'tcx'): number {
  if (format === 'gpx') {
    return el.getElementsByTagName('trkpt').length
  }
  return el.getElementsByTagName('Trackpoint').length
}

// --- Stats computation from DOM ---

export function computeStatsFromElement(el: Element, format: 'gpx' | 'tcx'): LapStats {
  if (format === 'tcx') {
    return computeTcxLapStats(el)
  }
  // GPX: parse points and compute
  const points = getTrackPointsFromElement(el, format)
  return computeStats(points)
}

function computeTcxLapStats(lapEl: Element): LapStats {
  // Read summary values from DOM first (they're authoritative for TCX)
  const totalTime = parseOptionalFloat(getDirectChildText(lapEl, 'TotalTimeSeconds'))
  const distance = parseOptionalFloat(getDirectChildText(lapEl, 'DistanceMeters'))
  const maxSpeed = parseOptionalFloat(getDirectChildText(lapEl, 'MaximumSpeed'))
  const calories = parseOptionalFloat(getDirectChildText(lapEl, 'Calories'))

  const avgHrEl = lapEl.getElementsByTagName('AverageHeartRateBpm')[0]
  const maxHrEl = lapEl.getElementsByTagName('MaximumHeartRateBpm')[0]
  const avgHr = avgHrEl
    ? parseOptionalFloat(avgHrEl.getElementsByTagName('Value')[0]?.textContent)
    : undefined
  const maxHr = maxHrEl
    ? parseOptionalFloat(maxHrEl.getElementsByTagName('Value')[0]?.textContent)
    : undefined

  // For fields not in TCX summary, compute from trackpoints
  const points = getTrackPointsFromElement(lapEl, 'tcx')
  const computedStats = computeStats(points)

  return {
    distance: distance ?? computedStats.distance,
    duration: totalTime ?? computedStats.duration,
    avgHr: avgHr ?? computedStats.avgHr,
    maxHr: maxHr ?? computedStats.maxHr,
    avgCadence: computedStats.avgCadence,
    avgPower: computedStats.avgPower,
    maxSpeed: maxSpeed ?? computedStats.maxSpeed,
    calories: calories !== undefined ? Math.round(calories) : undefined,
    elevationGain: computedStats.elevationGain,
    elevationLoss: computedStats.elevationLoss,
  }
}

function getDirectChildText(parent: Element, tagName: string): string | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      return (child as Element).textContent
    }
  }
  return null
}

// --- TrackPoint extraction (for SplitDialog) ---

export function getTrackPointsFromElement(el: Element, format: 'gpx' | 'tcx'): TrackPoint[] {
  if (format === 'gpx') {
    const segs = el.getElementsByTagName('trkseg')
    if (segs.length === 0) return []
    return parseGpxPoints(segs[0])
  }
  return parseTcxTrackpoints(el)
}

/** Strip "(N)" suffix from a lap name to get the base name for re-splitting. */
function stripSplitSuffix(name: string): string {
  return name.replace(/\s*\(\d+\)$/, '')
}

// --- DOM operations ---

function findLapElement(actDoc: ActivityDocument, lapId: string): Element | null {
  const elements = getLapElements(actDoc)
  return elements.find((el) => getLapId(el) === lapId) || null
}

export function renameLap(actDoc: ActivityDocument, lapId: string, name: string): void {
  if (actDoc.sourceFormat === 'gpx') {
    const el = findLapElement(actDoc, lapId)
    if (!el) return
    // Find or create direct child <name>
    let nameEl: Element | null = null
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i]
      if (child.nodeType === 1 && (child as Element).tagName === 'name') {
        nameEl = child as Element
        break
      }
    }
    if (nameEl) {
      nameEl.textContent = name
    } else {
      const ns = el.namespaceURI
      nameEl = ns ? actDoc.doc.createElementNS(ns, 'name') : actDoc.doc.createElement('name')
      nameEl.textContent = name
      el.insertBefore(nameEl, el.firstChild)
    }
  } else {
    actDoc.lapNames.set(lapId, name)
  }
}

export function renameActivity(actDoc: ActivityDocument, name: string): void {
  actDoc.name = name
  if (actDoc.sourceFormat === 'gpx') {
    // Update <trk><name> or <metadata><name>
    const nameEl =
      actDoc.doc.querySelector('trk > name') || actDoc.doc.querySelector('metadata > name')
    if (nameEl) {
      nameEl.textContent = name
    }
  } else {
    // TCX: update <Activity><Notes>
    const activity = actDoc.doc.getElementsByTagName('Activity')[0]
    if (activity) {
      let notes = activity.getElementsByTagName('Notes')[0]
      if (notes) {
        notes.textContent = name
      } else {
        const ns = activity.namespaceURI
        notes = ns ? actDoc.doc.createElementNS(ns, 'Notes') : actDoc.doc.createElement('Notes')
        notes.textContent = name
        activity.insertBefore(notes, activity.firstChild)
      }
    }
  }
}

export function mergeLaps(actDoc: ActivityDocument, id1: string, id2: string): void {
  const el1 = findLapElement(actDoc, id1)
  const el2 = findLapElement(actDoc, id2)
  if (!el1 || !el2 || !el2.parentNode) return

  const { sourceFormat } = actDoc

  if (sourceFormat === 'gpx') {
    // Move trkpt from el2's trkseg into el1's trkseg
    const seg1 = el1.getElementsByTagName('trkseg')[0]
    const seg2 = el2.getElementsByTagName('trkseg')[0]
    if (!seg1 || !seg2) return

    const points = Array.from(seg2.getElementsByTagName('trkpt'))
    for (const pt of points) {
      seg1.appendChild(pt)
    }

    // Update name
    const name1 = getLapName(actDoc, el1, id1)
    const name2 = getLapName(actDoc, el2, id2)
    renameLap(actDoc, id1, `${name1} + ${name2}`)
  } else {
    // TCX: move Trackpoints from el2's Track into el1's Track
    const track1 = el1.getElementsByTagName('Track')[0]
    const track2 = el2.getElementsByTagName('Track')[0]
    if (!track1 || !track2) return

    const points = Array.from(track2.getElementsByTagName('Trackpoint'))
    for (const pt of points) {
      track1.appendChild(pt)
    }

    // Update name
    const name1 = getLapName(actDoc, el1, id1)
    const name2 = getLapName(actDoc, el2, id2)
    actDoc.lapNames.set(id1, `${name1} + ${name2}`)

    // Recalculate TCX summary
    recalcTcxLapSummary(el1)
  }

  // Remove second lap
  el2.parentNode.removeChild(el2)
  actDoc.lapNames.delete(id2)
}

export function splitLap(actDoc: ActivityDocument, lapId: string, pointIndices: number[]): void {
  const el = findLapElement(actDoc, lapId)
  if (!el || !el.parentNode) return

  // Sort indices in ascending order and deduplicate
  const sorted = [...new Set(pointIndices)].sort((a, b) => a - b)
  if (sorted.length === 0) return

  const { sourceFormat } = actDoc

  // Split from right to left so earlier indices remain valid.
  // Each split peels off the right portion; the original element keeps points [0..splitIdx].
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sourceFormat === 'gpx') {
      splitGpxLap(actDoc, el, lapId, sorted[i], i)
    } else {
      splitTcxLap(actDoc, el, lapId, sorted[i], i)
    }
  }
}

function splitGpxLap(
  actDoc: ActivityDocument,
  el: Element,
  lapId: string,
  pointIndex: number,
  splitOrdinal: number,
): void {
  const { doc } = actDoc
  const seg = el.getElementsByTagName('trkseg')[0]
  if (!seg) return

  const allPts = Array.from(seg.getElementsByTagName('trkpt'))
  if (pointIndex <= 0 || pointIndex >= allPts.length) return

  // Clone the boundary point
  const boundaryClone = allPts[pointIndex].cloneNode(true)

  // Create new <trk> with same structure
  const ns = el.namespaceURI
  const newTrk = ns ? doc.createElementNS(ns, 'trk') : doc.createElement('trk')
  const newSeg = ns ? doc.createElementNS(ns, 'trkseg') : doc.createElement('trkseg')

  // Determine base name (strip existing numbering suffix if re-splitting)
  const origName = stripSplitSuffix(getLapName(actDoc, el, lapId))
  const nameEl = ns ? doc.createElementNS(ns, 'name') : doc.createElement('name')
  nameEl.textContent = `${origName} (${splitOrdinal + 2})`
  newTrk.appendChild(nameEl)
  newTrk.appendChild(newSeg)

  // Move points after splitIndex to new segment (clone boundary, move the rest)
  newSeg.appendChild(boundaryClone)
  const pointsToMove = allPts.slice(pointIndex + 1)
  for (const pt of pointsToMove) {
    newSeg.appendChild(pt)
  }

  // Rename original to (1) on the last iteration (leftmost split)
  if (splitOrdinal === 0) {
    renameLap(actDoc, lapId, `${origName} (1)`)
  }

  // Assign a deterministic ID so column values survive page reloads
  const existingIds = new Set(
    getLapElements(actDoc).map((e) => e.getAttribute('data-lap-id') ?? ''),
  )
  let newId = deterministicLapId(newTrk, 'gpx', -1)
  if (existingIds.has(newId)) {
    let suffix = 2
    while (existingIds.has(`${newId}-${suffix}`)) suffix++
    newId = `${newId}-${suffix}`
  }
  newTrk.setAttribute('data-lap-id', newId)
  el.parentNode!.insertBefore(newTrk, el.nextSibling)
}

function splitTcxLap(
  actDoc: ActivityDocument,
  el: Element,
  lapId: string,
  pointIndex: number,
  splitOrdinal: number,
): void {
  const track = el.getElementsByTagName('Track')[0]
  if (!track) return

  const allPts = Array.from(track.getElementsByTagName('Trackpoint'))
  if (pointIndex <= 0 || pointIndex >= allPts.length) return

  // Deep clone the entire Lap for the second half
  const newLap = el.cloneNode(true) as Element
  const newTrack = newLap.getElementsByTagName('Track')[0]

  // Remove points from second half that belong to first half (indices < pointIndex)
  const newPts = Array.from(newTrack.getElementsByTagName('Trackpoint'))
  for (let i = 0; i < pointIndex; i++) {
    newTrack.removeChild(newPts[i])
  }

  // Remove points from original that belong to second half (indices > pointIndex)
  // Keep the boundary point in both (clone already in newLap)
  const origPtsToRemove = allPts.slice(pointIndex + 1)
  for (const pt of origPtsToRemove) {
    track.removeChild(pt)
  }

  // Update StartTime on new lap to boundary point's time
  const newFirstTime = newLap
    .getElementsByTagName('Trackpoint')[0]
    ?.getElementsByTagName('Time')[0]?.textContent
  if (newFirstTime) {
    newLap.setAttribute('StartTime', newFirstTime)
  }

  // Assign ID and names
  const origName = stripSplitSuffix(getLapName(actDoc, el, lapId))
  if (splitOrdinal === 0) {
    actDoc.lapNames.set(lapId, `${origName} (1)`)
  }
  const existingIds = new Set(
    getLapElements(actDoc).map((e) => e.getAttribute('data-lap-id') ?? ''),
  )
  let newId = deterministicLapId(newLap, 'tcx', -1)
  if (existingIds.has(newId)) {
    let suffix = 2
    while (existingIds.has(`${newId}-${suffix}`)) suffix++
    newId = `${newId}-${suffix}`
  }
  newLap.setAttribute('data-lap-id', newId)
  actDoc.lapNames.set(newId, `${origName} (${splitOrdinal + 2})`)

  // Recalculate summaries for both laps
  recalcTcxLapSummary(el)
  recalcTcxLapSummary(newLap)

  // Insert after original
  el.parentNode!.insertBefore(newLap, el.nextSibling)
}

// --- TCX summary recalculation ---

function recalcTcxLapSummary(lapEl: Element): void {
  const points = parseTcxTrackpoints(lapEl)
  if (points.length === 0) return

  const stats = computeStats(points)

  setOrCreateChild(lapEl, 'TotalTimeSeconds', stats.duration.toFixed(3))
  setOrCreateChild(lapEl, 'DistanceMeters', stats.distance.toFixed(2))

  if (stats.avgHr != null) {
    setOrCreateHrChild(lapEl, 'AverageHeartRateBpm', Math.round(stats.avgHr))
  }
  if (stats.maxHr != null) {
    setOrCreateHrChild(lapEl, 'MaximumHeartRateBpm', stats.maxHr)
  }
  if (stats.maxSpeed != null) {
    setOrCreateChild(lapEl, 'MaximumSpeed', stats.maxSpeed.toString())
  }
}

function setOrCreateChild(parent: Element, tagName: string, value: string): void {
  // Find existing direct child
  for (let i = 0; i < parent.childNodes.length; i++) {
    const child = parent.childNodes[i]
    if (child.nodeType === 1 && (child as Element).tagName === tagName) {
      ;(child as Element).textContent = value
      return
    }
  }
  // Create if not found
  const ns = parent.namespaceURI
  const el = ns
    ? parent.ownerDocument.createElementNS(ns, tagName)
    : parent.ownerDocument.createElement(tagName)
  el.textContent = value
  // Insert before Track element to maintain order
  const track = parent.getElementsByTagName('Track')[0]
  if (track) {
    parent.insertBefore(el, track)
  } else {
    parent.appendChild(el)
  }
}

function setOrCreateHrChild(parent: Element, tagName: string, value: number): void {
  let hrEl = parent.getElementsByTagName(tagName)[0]
  if (hrEl) {
    const valEl = hrEl.getElementsByTagName('Value')[0]
    if (valEl) {
      valEl.textContent = value.toString()
    }
  } else {
    const ns = parent.namespaceURI
    hrEl = ns
      ? parent.ownerDocument.createElementNS(ns, tagName)
      : parent.ownerDocument.createElement(tagName)
    const valEl = ns
      ? parent.ownerDocument.createElementNS(ns, 'Value')
      : parent.ownerDocument.createElement('Value')
    valEl.textContent = value.toString()
    hrEl.appendChild(valEl)
    const track = parent.getElementsByTagName('Track')[0]
    if (track) {
      parent.insertBefore(hrEl, track)
    } else {
      parent.appendChild(hrEl)
    }
  }
}

// --- Export ---

export function exportOriginal(actDoc: ActivityDocument): string {
  // Remove data-lap-id attributes before serializing
  const clone = actDoc.doc.cloneNode(true) as Document
  const allElements = clone.getElementsByTagName('*')
  for (let i = 0; i < allElements.length; i++) {
    allElements[i].removeAttribute('data-lap-id')
  }
  const serializer = new XMLSerializer()
  return serializer.serializeToString(clone)
}
