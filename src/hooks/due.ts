import { loadConfig, trackedProject } from '../core/config.js'
import { readGaps } from '../core/store.js'
import { readFocus } from '../core/focus.js'
import { pickDue } from '../core/schedule.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'

/**
 * Runs at session start. Brings back one gap that has come due.
 *
 * This is the component the plan calls non-optional, and it is where almost every
 * home-made learning system quietly dies: gaps get written down, nothing brings them
 * back, and the log becomes a graveyard nobody opens.
 *
 * It arrives as context in the session you are already in, so there is no separate
 * app and no inbox to ignore. And it is a suggestion, not an interruption — the agent
 * is told to wait for a natural moment, because a quiz fired mid-debugging teaches
 * nothing and gets you switched off.
 */
export function due(event: NormalizedEvent): NormalizedDecision {
  try {
    const config = loadConfig()
    if (!trackedProject(event.cwd, config)) return { type: 'noop' }

    const gap = pickDue(readGaps(), readFocus())
    if (!gap) return { type: 'noop' }

    return {
      type: 'context',
      context: [
        'spar: one gap has come due for review.',
        '',
        `  id:       ${gap.id}`,
        `  concept:  ${gap.concept}`,
        `  context:  ${gap.task || '(no task recorded)'}`,
        `  they thought: ${gap.your_model}`,
        `  reality:      ${gap.reality}`,
        '',
        'Do NOT bring this up now. Wait for a natural pause — a task finishing, a related',
        'file coming up, the user asking something adjacent. Then ask them to explain the',
        'concept in their own words, without showing them the answer above first.',
        '',
        'Judge their answer against "reality" and record it:',
        `  spar review --session ${event.sessionId} ${gap.id} --ok    (they had it)`,
        `  spar review --session ${event.sessionId} ${gap.id} --nok   (they did not)`,
        '',
        'Be honest in that judgement. Marking a shaky answer correct removes the gap from',
        'the rotation and quietly hides it, which is the one failure this system cannot see.',
      ].join('\n'),
    }
  } catch {
    return { type: 'noop' }
  }
}
