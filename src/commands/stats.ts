import { readGaps } from '../core/store.js'
import { readEvents } from '../core/events.js'
import { readFocus } from '../core/focus.js'
import { aggregate } from '../core/aggregate.js'
import { renderStats } from '../render/terminal.js'

/**
 * `spar stats` — the terminal view.
 *
 * Shares its numbers with the dashboard by construction: both render the same object
 * from core/aggregate.ts, so the two can never quietly disagree about how you are doing.
 */
export function cmdStats(asJson: boolean): number {
  const stats = aggregate(readGaps(), readEvents(), readFocus())
  console.log(asJson ? JSON.stringify(stats, null, 2) : renderStats(stats))
  return 0
}
