/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Operates on [lat, lon] coordinate pairs.
 * Uses index-based recursion to avoid intermediate array allocations.
 */

type LatLng = [number, number]

function perpendicularDistance(point: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
  const [px, py] = point
  const [sx, sy] = lineStart
  const [ex, ey] = lineEnd

  const dx = ex - sx
  const dy = ey - sy

  if (dx === 0 && dy === 0) {
    return Math.sqrt((px - sx) ** 2 + (py - sy) ** 2)
  }

  const t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
  const clampedT = Math.max(0, Math.min(1, t))
  const projX = sx + clampedT * dx
  const projY = sy + clampedT * dy

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}

/** Mark points to keep in the `keep` array using index-based recursion. */
function rdpMark(
  points: LatLng[],
  start: number,
  end: number,
  epsilon: number,
  keep: boolean[],
): void {
  if (end - start <= 1) return

  let maxDist = 0
  let maxIdx = start

  for (let i = start + 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[start], points[end])
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    keep[maxIdx] = true
    rdpMark(points, start, maxIdx, epsilon, keep)
    rdpMark(points, maxIdx, end, epsilon, keep)
  }
}

/**
 * Simplify a coordinate array using Ramer-Douglas-Peucker.
 * @param coords Array of [lat, lon] pairs
 * @param epsilon Tolerance in degrees (~0.00005 = ~5m). Default auto-selects based on point count.
 * @returns Simplified coordinate array
 */
export function simplifyTrack(coords: LatLng[], epsilon?: number): LatLng[] {
  if (coords.length <= 100) return coords

  const eps = epsilon ?? (coords.length > 5000 ? 0.0001 : 0.00005)

  const keep = new Array<boolean>(coords.length).fill(false)
  keep[0] = true
  keep[coords.length - 1] = true
  rdpMark(coords, 0, coords.length - 1, eps, keep)

  const result: LatLng[] = []
  for (let i = 0; i < coords.length; i++) {
    if (keep[i]) result.push(coords[i])
  }
  return result
}
