import type { Gap } from './types.js'

/**
 * Days until a gap comes back, by box. Leitner, deliberately not SM-2.
 *
 * Five fixed steps are legible: you can look at box 3 and know it returns in a week.
 * A tuned algorithm would schedule marginally better and be impossible to reason
 * about, and reasoning about it is what keeps you trusting the queue.
 */
export const INTERVALS = [1, 3, 7, 16, 35] as const
export const MAX_BOX = INTERVALS.length

export interface Review {
  box: number
  due: string
  hits: number
  misses: number
}

/** Answering correctly moves a gap up one box; getting it wrong sends it back to the start. */
export function review(gap: Gap, correct: boolean, now = new Date()): Review {
  const box = correct ? Math.min(MAX_BOX, clampBox(gap.box) + 1) : 1
  return {
    box,
    due: addDays(now, INTERVALS[box - 1]!),
    hits: gap.hits + (correct ? 1 : 0),
    misses: gap.misses + (correct ? 0 : 1),
  }
}

export function isDue(gap: Gap, now = new Date()): boolean {
  return gap.due <= today(now)
}

/**
 * Pick the single gap to bring back this session.
 *
 * One, not a queue: this arrives in the middle of real work, and a list would be
 * something to dismiss rather than answer. Focused concepts first, then whatever has
 * been waiting longest — a gap that keeps being skipped should not sink.
 */
export function pickDue(gaps: Gap[], focused: string[] = [], now = new Date()): Gap | undefined {
  const wanted = new Set(focused.map((f) => f.trim().toLowerCase()))
  const due = gaps.filter((g) => isDue(g, now))
  if (due.length === 0) return undefined

  return due.sort((a, b) => {
    const aFocus = wanted.has(a.concept.trim().toLowerCase()) ? 0 : 1
    const bFocus = wanted.has(b.concept.trim().toLowerCase()) ? 0 : 1
    if (aFocus !== bFocus) return aFocus - bFocus
    if (a.due !== b.due) return a.due < b.due ? -1 : 1
    return a.ts < b.ts ? -1 : 1
  })[0]
}

function clampBox(box: number): number {
  return Number.isFinite(box) && box >= 1 ? Math.min(MAX_BOX, Math.floor(box)) : 1
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

function addDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}
