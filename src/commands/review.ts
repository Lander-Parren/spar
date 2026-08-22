import { findGap, updateGap } from '../core/store.js'
import { INTERVALS, MAX_BOX, review } from '../core/schedule.js'
import { appendEvent } from '../core/events.js'

/** `spar review <id> --ok|--nok` — the answer to a returning gap. */
export function cmdReview(sessionId: string, gapId: string, correct: boolean): number {
  const gap = findGap(gapId)
  if (!gap) {
    process.stderr.write(`spar: no gap with id ${gapId}\n`)
    return 1
  }

  const next = review(gap, correct)
  updateGap(gapId, next)
  appendEvent({ type: 'review', session: sessionId, gap: gapId, correct })

  console.log(
    correct
      ? `${gapId}: box ${gap.box} -> ${next.box}${next.box === MAX_BOX ? ' (consolidated)' : ''}, back on ${next.due} (${INTERVALS[next.box - 1]}d)`
      : `${gapId}: back to box 1, returns ${next.due}. Not a setback. It is the point.`,
  )
  return 0
}
