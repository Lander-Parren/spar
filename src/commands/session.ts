import { readGaps, readState, resetTask, writeState } from '../core/store.js'
import { NO_IDEA, suggestLevel } from '../core/level.js'
import { LEVEL_NAMES, type Level } from '../core/types.js'
import { readFocus } from '../core/focus.js'
import { clearProposals } from '../core/proposals.js'
import { appendEvent } from '../core/events.js'

/** `spar suggest-level` — ask the gap log how hard this task should be. */
export function cmdSuggestLevel(sessionId: string, concepts: string[]): number {
  const state = readState(sessionId)
  const suggestion = suggestLevel({
    concepts,
    gaps: readGaps(),
    focused: readFocus(),
    rush: state.rush,
  })
  console.log(
    `level ${suggestion.level} (${LEVEL_NAMES[suggestion.level]}) — ${suggestion.reason}`,
  )
  // Recorded, not committed: the user still gets to override before predicting.
  writeState({ ...state, level: suggestion.level })
  appendEvent({ type: 'suggest', session: sessionId, level: suggestion.level, concepts })
  return 0
}

/** `spar level` — the user overrides the suggestion. */
export function cmdLevel(sessionId: string, level: Level): number {
  const state = readState(sessionId)
  // Counted, because a user who constantly corrects the suggestion is telling you the
  // thresholds are wrong — that is a fact about the design, not about them.
  appendEvent({ type: 'override', session: sessionId, from: state.level, to: level })
  writeState({ ...state, level })
  console.log(`level set to ${level} (${LEVEL_NAMES[level]})`)
  return 0
}

/** `spar predict` — record the three answers and open the gate for this task. */
export function cmdPredict(
  sessionId: string,
  answers: { q1?: string; q2?: string; q3?: string },
): number {
  const state = readState(sessionId)
  const normalized = {
    q1: normalizeAnswer(answers.q1),
    q2: normalizeAnswer(answers.q2),
    q3: normalizeAnswer(answers.q3),
  }
  writeState({
    ...state,
    predicted: true,
    predictedAt: new Date().toISOString(),
    editsSincePrediction: 0,
    task: state.task ?? state.taskPrompt,
  })
  const blanks = Object.values(normalized).filter((a) => a === NO_IDEA).length
  appendEvent({
    type: 'predict',
    session: sessionId,
    level: state.level ?? 1,
    blanks,
    concepts: [],
  })
  console.log(
    blanks === 3
      ? 'prediction recorded (all three blank — that is data, not failure)'
      : `prediction recorded${blanks ? ` (${blanks} blank)` : ''}`,
  )
  return 0
}

/** `spar mark --trivial` — the agent judged this change not worth gating. */
export function cmdMarkTrivial(sessionId: string): number {
  const state = readState(sessionId)
  appendEvent({ type: 'trivial', session: sessionId })
  writeState({ ...state, trivial: true, level: state.level ?? 0 })
  console.log('marked trivial for this task')
  return 0
}

/** `spar rush` — degrade to level 0 for the rest of the session. Never off, only down. */
export function cmdRush(sessionId: string, off: boolean): number {
  const state = readState(sessionId)
  appendEvent({ type: 'rush', session: sessionId, on: !off })
  writeState({ ...state, rush: !off })
  console.log(off ? 'rush mode off' : 'rush mode on for this session')
  return 0
}

function normalizeAnswer(answer: string | undefined): string {
  const trimmed = (answer ?? '').trim()
  if (!trimmed) return NO_IDEA
  return /^(no idea|geen idee|dunno|idk|\?+)$/i.test(trimmed) ? NO_IDEA : trimmed
}

/** `spar next` — say out loud that this is new work, without waiting for the idle timer. */
export function cmdNext(sessionId: string): number {
  clearProposals(sessionId)
  writeState(resetTask(readState(sessionId)))
  console.log('new task — the gate will ask again on the next write')
  return 0
}
