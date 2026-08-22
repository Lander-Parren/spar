import type { Gap, Level } from './types.js'

/** Sentinel written when you answer a question with "no idea". Not a failure: a signal. */
export const NO_IDEA = '(no idea)'

/** A gap is still open while it sits in one of the low Leitner boxes. */
const OPEN_BOX_MAX = 2

export interface LevelInput {
  /** Concepts the agent thinks this task touches. Matched case-insensitively. */
  concepts: string[]
  gaps: Gap[]
  /** Concepts the user flagged in the dashboard. Bumps the result by one. */
  focused?: string[]
  /** Session-scoped rush flag. Short-circuits everything. */
  rush?: boolean
}

export interface LevelSuggestion {
  level: Level
  /** Shown to the user verbatim. A suggestion without a reason is an order. */
  reason: string
}

/**
 * Pick how much of the work you should do yourself.
 *
 * The whole point of this function is that you never have to decide to work hard:
 * friction lands where the log says you are weak, and stays out of the way elsewhere.
 */
export function suggestLevel(input: LevelInput): LevelSuggestion {
  if (input.rush) {
    return { level: 0, reason: 'rush mode is on for this session' }
  }

  const wanted = normalizeAll(input.concepts)
  if (wanted.length === 0) {
    return { level: 1, reason: 'no concept identified for this task' }
  }

  const related = input.gaps.filter((g) => wanted.includes(normalize(g.concept)))
  const open = related.filter((g) => g.box <= OPEN_BOX_MAX)
  const everBlank = related.some((g) => g.your_model.trim() === NO_IDEA)

  let base: Level
  let reason: string

  if (open.length >= 3) {
    base = 3
    reason = `${open.length} open gaps on ${quote(open)}, so write this one yourself`
  } else if (everBlank) {
    base = 3
    reason = `you answered "no idea" here before (${quote(related)})`
  } else if (open.length >= 1) {
    base = 2
    reason = `${open.length} open gap${open.length === 1 ? '' : 's'} on ${quote(open)}`
  } else if (related.length > 0) {
    base = 1
    reason = `${related.length} gap${related.length === 1 ? '' : 's'} here, all consolidated`
  } else {
    base = 1
    reason = 'no history on this concept yet'
  }

  const focused = normalizeAll(input.focused ?? [])
  if (focused.some((f) => wanted.includes(f))) {
    const bumped = Math.min(3, base + 1) as Level
    if (bumped !== base) {
      return { level: bumped, reason: `${reason}; you flagged this concept as a focus` }
    }
  }

  return { level: base, reason }
}

function normalize(concept: string): string {
  return concept.trim().toLowerCase()
}

function normalizeAll(concepts: string[]): string[] {
  return [...new Set(concepts.map(normalize).filter(Boolean))]
}

function quote(gaps: Gap[]): string {
  const names = [...new Set(gaps.map((g) => g.concept))]
  return names.length === 1 ? `"${names[0]}"` : names.map((n) => `"${n}"`).join(', ')
}
