import { loadConfig, trackedProject } from '../core/config.js'
import { readTask, resetTaskState, writeTask } from '../core/task-state.js'
import { clearProposals } from '../core/proposals.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'
import type { SessionState } from '../core/types.js'

/**
 * Runs on every user prompt. Its only job: decide whether the gate should re-arm.
 *
 * The two mistakes here do not cost the same. Re-arming on a follow-up costs thirty
 * seconds — but its real consequence is that you reach for `spar rush`, and an
 * abandoned tool teaches nothing at all. Failing to re-arm on genuinely new work
 * costs one gap, and that concept will come round again.
 *
 * So this leans, deliberately, towards "still the same task".
 */
export function boundary(event: NormalizedEvent): NormalizedDecision {
  try {
    const config = loadConfig()
    if (!trackedProject(event.cwd, config)) return { type: 'noop' }

    const state = readTask(event.sessionId, event.cwd)
    // With a plan, the step says where the task ends. Silence says nothing, so an idle
    // stretch must not throw away a prediction the step is still holding.
    if (state.fromPlan) return { type: 'noop' }

    if (isNewTask(state, config.idleMinutes * 60_000)) {
      clearProposals(event.sessionId)
      resetTaskState(event.sessionId, event.cwd)
      writeTask(event.sessionId, event.cwd, { taskPrompt: event.prompt ?? '' })
    }
    return { type: 'noop' }
  } catch {
    return { type: 'noop' }
  }
}

/**
 * A task stays alive while there is movement in it, and expires on silence.
 *
 * Note this measures idleness, not age: `predictedAt` is refreshed by the gate on
 * every write it lets through. Without that refresh this would be "30 minutes since
 * you predicted", which would interrupt a long careful task halfway — exactly when
 * it is going well. With it, an active task keeps its prediction indefinitely and an
 * abandoned one lapses.
 *
 * Time was chosen over reading the prompt text on purpose. A text heuristic sounds
 * smarter and is more brittle: it is language-dependent (this ships publicly), easy
 * to fool, and — worst of all — unpredictable. When the gate fires you should always
 * know why it fired. Being occasionally strict beats being occasionally mysterious.
 *
 * The threshold is one number in config, so it can be corrected later from what
 * `/spar:stats` shows about how often you overrode the gate — evidence, not taste.
 */
export function isNewTask(
  state: Pick<SessionState, 'predicted' | 'predictedAt'>,
  idleMs: number,
  now = Date.now(),
): boolean {
  // Nothing predicted yet: the gate is already armed, nothing to decide.
  if (!state.predicted || !state.predictedAt) return true

  const last = Date.parse(state.predictedAt)
  if (!Number.isFinite(last)) return true

  return now - last > idleMs
}
