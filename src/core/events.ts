import { appendFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths.js'
import type { Level } from './types.js'

/**
 * Everything that happened that is not a gap.
 *
 * gaps.jsonl holds divergences — the numerator. Without this file there is no
 * denominator, and "you have 40 gaps" means nothing: forty out of two hundred
 * predictions is good, forty out of fifty is not. Worse, a bare count only ever
 * goes up, so it would read as decline exactly while you improve.
 */
export type SparEvent =
  | { ts: string; type: 'predict'; session: string; level: Level; blanks: number; concepts: string[] }
  | { ts: string; type: 'suggest'; session: string; level: Level; concepts: string[] }
  | { ts: string; type: 'override'; session: string; from?: Level; to: Level }
  | { ts: string; type: 'trivial'; session: string }
  | { ts: string; type: 'rush'; session: string; on: boolean }
  | { ts: string; type: 'review'; session: string; gap: string; correct: boolean }

/**
 * Omit across a union member-by-member. A plain Omit<SparEvent, 'ts'> collapses the
 * union to its shared keys, which would silently reject every event-specific field.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type NewEvent = DistributiveOmit<SparEvent, 'ts'> & { ts?: string }

export function appendEvent(event: NewEvent): void {
  try {
    const line = JSON.stringify({ ts: event.ts ?? new Date().toISOString(), ...event })
    mkdirSync(dirname(paths.events()), { recursive: true })
    appendFileSync(paths.events(), line + '\n', 'utf8')
  } catch {
    // Statistics are worth less than the work; never fail a command over them.
  }
}

export function readEvents(): SparEvent[] {
  let raw: string
  try {
    raw = readFileSync(paths.events(), 'utf8')
  } catch {
    return []
  }
  const events: SparEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      events.push(JSON.parse(line) as SparEvent)
    } catch {
      /* one bad line, not the whole history */
    }
  }
  return events
}
