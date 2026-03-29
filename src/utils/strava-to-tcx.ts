/**
 * Converts Strava activity streams + laps into a valid TCX XML string
 * that can be fed into parseToDocument().
 */

import { escapeXml } from '~/utils/gpx-parser'

export interface StravaActivityData {
  name: string
  sportType: string
  startDate: string // ISO 8601
  laps: Array<{
    startIndex: number
    endIndex: number
    startDate: string
    totalTimeSeconds: number
    distance: number
    calories?: number
    averageHeartrate?: number
    maxHeartrate?: number
    averageCadence?: number
  }>
  streams: {
    latlng?: [number, number][]
    time?: number[] // seconds from start
    altitude?: number[]
    heartrate?: number[]
    cadence?: number[]
    watts?: number[]
    distance?: number[]
  }
}

function sportTypeToTcxSport(sportType: string): string {
  const lower = sportType.toLowerCase()
  if (lower.includes('run')) return 'Running'
  if (lower.includes('ride') || lower.includes('cycling') || lower.includes('bike')) return 'Biking'
  return 'Other'
}

export function stravaToTcx(data: StravaActivityData): string {
  const { streams, laps, startDate, name, sportType } = data
  const startMs = new Date(startDate).getTime()
  const sport = sportTypeToTcxSport(sportType)

  // If no laps from Strava, treat entire activity as one lap
  const effectiveLaps =
    laps.length > 0
      ? laps
      : [
          {
            startIndex: 0,
            endIndex: (streams.latlng?.length ?? streams.time?.length ?? 1) - 1,
            startDate,
            totalTimeSeconds: streams.time
              ? streams.time[streams.time.length - 1] - streams.time[0]
              : 0,
            distance: streams.distance
              ? streams.distance[streams.distance.length - 1] - streams.distance[0]
              : 0,
          },
        ]

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<TrainingCenterDatabase',
    '  xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"',
    '  xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"',
    '  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
    '  <Activities>',
    `    <Activity Sport="${sport}">`,
    `      <Id>${startDate}</Id>`,
    `      <Notes>${escapeXml(name)}</Notes>`,
  ]

  for (const lap of effectiveLaps) {
    const lapStartTime = lap.startDate || startDate
    lines.push(`      <Lap StartTime="${lapStartTime}">`)
    lines.push(`        <TotalTimeSeconds>${lap.totalTimeSeconds.toFixed(3)}</TotalTimeSeconds>`)
    lines.push(`        <DistanceMeters>${lap.distance.toFixed(2)}</DistanceMeters>`)
    if (lap.calories !== undefined) {
      lines.push(`        <Calories>${lap.calories}</Calories>`)
    }
    if (lap.averageHeartrate !== undefined) {
      lines.push(
        `        <AverageHeartRateBpm><Value>${Math.round(lap.averageHeartrate)}</Value></AverageHeartRateBpm>`,
      )
    }
    if (lap.maxHeartrate !== undefined) {
      lines.push(
        `        <MaximumHeartRateBpm><Value>${lap.maxHeartrate}</Value></MaximumHeartRateBpm>`,
      )
    }
    lines.push('        <Intensity>Active</Intensity>')
    lines.push('        <TriggerMethod>Manual</TriggerMethod>')
    lines.push('        <Track>')

    // Emit trackpoints for this lap's index range
    const start = lap.startIndex
    const end = lap.endIndex
    for (let i = start; i <= end; i++) {
      const hasPosition = streams.latlng && i < streams.latlng.length
      if (!hasPosition && !streams.time) continue

      const time =
        streams.time && i < streams.time.length
          ? new Date(startMs + streams.time[i] * 1000).toISOString()
          : undefined

      lines.push('          <Trackpoint>')
      if (time) {
        lines.push(`            <Time>${time}</Time>`)
      }
      if (hasPosition) {
        const [lat, lon] = streams.latlng![i]
        lines.push('            <Position>')
        lines.push(`              <LatitudeDegrees>${lat}</LatitudeDegrees>`)
        lines.push(`              <LongitudeDegrees>${lon}</LongitudeDegrees>`)
        lines.push('            </Position>')
      }
      if (streams.altitude && i < streams.altitude.length) {
        lines.push(`            <AltitudeMeters>${streams.altitude[i]}</AltitudeMeters>`)
      }
      if (streams.distance && i < streams.distance.length) {
        lines.push(`            <DistanceMeters>${streams.distance[i].toFixed(2)}</DistanceMeters>`)
      }
      if (streams.heartrate && i < streams.heartrate.length) {
        lines.push(
          `            <HeartRateBpm><Value>${streams.heartrate[i]}</Value></HeartRateBpm>`,
        )
      }
      if (streams.cadence && i < streams.cadence.length) {
        lines.push(`            <Cadence>${streams.cadence[i]}</Cadence>`)
      }
      const hasExtensions =
        (streams.watts && i < streams.watts.length) ||
        (streams.cadence && i < streams.cadence.length)
      if (hasExtensions) {
        lines.push('            <Extensions>')
        lines.push('              <ns3:TPX>')
        if (streams.watts && i < streams.watts.length) {
          lines.push(`                <ns3:Watts>${streams.watts[i]}</ns3:Watts>`)
        }
        if (streams.cadence && i < streams.cadence.length) {
          lines.push(`                <ns3:RunCadence>${streams.cadence[i]}</ns3:RunCadence>`)
        }
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
