/** Returns true for sports where pace (min/km) is the natural metric */
export function isPaceSport(sport?: string): boolean {
  if (!sport) return true // default to pace when unknown
  const lower = sport.toLowerCase()
  return lower.includes('run') || lower.includes('hik') || lower.includes('walk')
}

/** Map sport type string to an emoji icon */
export function sportIcon(sport?: string): string {
  if (!sport) return '\u{1F3CB}\u{FE0F}'
  const lower = sport.toLowerCase()
  if (lower.includes('run')) return '\u{1F3C3}'
  if (lower.includes('rid') || lower.includes('cycl') || lower.includes('bik')) return '\u{1F6B4}'
  if (lower.includes('swim')) return '\u{1F3CA}'
  if (lower.includes('hik') || lower.includes('walk')) return '\u{1F6B6}'
  if (lower.includes('ski')) return '\u{26F7}\u{FE0F}'
  return '\u{1F3CB}\u{FE0F}'
}

/** Format an ISO date string for display */
export function formatActivityDate(iso: string, includeYear = true): string {
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear && { year: 'numeric' }),
  }
  return d.toLocaleDateString(undefined, opts)
}
