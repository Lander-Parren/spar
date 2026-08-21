import { loadConfig, trackedProject } from '../core/config.js'
import { readState, resetTask, writeState } from '../core/store.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'
import type { SessionState } from '../core/types.js'

/**
 * Runs on every user prompt. Its only job: decide whether the gate should fire again.
 *
 * Get this wrong in one direction and spar interrogates you about "also rename that
 * variable". Get it wrong in the other and you predict once on Monday and coast all
 * week. This single function sets how the whole tool feels.
 */
export function boundary(event: NormalizedEvent): NormalizedDecision {
  try {
    const config = loadConfig()
    if (!trackedProject(event.cwd, config)) return { type: 'noop' }

    const state = readState(event.sessionId)
    const prompt = event.prompt ?? ''

    if (isNewTask(prompt, state)) {
      writeState({ ...resetTask(state), taskPrompt: prompt })
    }
    return { type: 'noop' }
  } catch {
    return { type: 'noop' }
  }
}

/**
 * Is this prompt the start of new work, or a follow-up on what we are already doing?
 *
 * Returning true re-arms the gate: the next write will stop and ask for a prediction.
 * Returning false lets the current task continue untouched.
 *
 * Signals available on `state`:
 *   state.taskPrompt            the prompt that opened the current task
 *   state.predicted             whether a prediction has been recorded yet
 *   state.predictedAt           ISO timestamp of that prediction
 *   state.editsSincePrediction  writes let through since then
 *
 * TODO(spar): implement this. Roughly 5-10 lines. Some directions, with their costs:
 *
 *   A. Always true. Never misses a task; asks about trivia constantly.
 *   B. Text heuristic. Back-references ("also", "and now", "fix that", "it", very short
 *      prompts) read as follow-ups; a fresh imperative with a new noun reads as new work.
 *      Cheap and legible, but language-dependent and easy to fool.
 *   C. Elapsed time / edit count. Re-arm after N minutes or M edits since the prediction.
 *      Language-independent and dead simple, but a long careful task gets interrupted
 *      while a burst of unrelated small tasks slips through on one prediction.
 *   D. Hybrid: treat it as a follow-up only while the prediction is fresh AND the prompt
 *      back-references; otherwise re-arm.
 *
 * Whatever you pick, `/spar:stats` will later show how often the gate fired versus how
 * often you overrode it — so this is a decision you can revise from evidence, not taste.
 */
export function isNewTask(prompt: string, state: SessionState): boolean {
  // Placeholder: option A, the bluntest one. Correct but maximally annoying —
  // replace it once you have felt how often it fires.
  void prompt
  void state
  return true
}
