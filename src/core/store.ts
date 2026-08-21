import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths.js'
import { emptyState, type Gap, type SessionState } from './types.js'

/** Append one gap. JSONL means a partial write can only ever cost the last line. */
export function appendGap(gap: Gap): void {
  mkdirSync(dirname(paths.gaps()), { recursive: true })
  appendFileSync(paths.gaps(), JSON.stringify(gap) + '\n', 'utf8')
}

/** Read every gap, skipping unparseable lines rather than failing the whole read. */
export function readGaps(): Gap[] {
  let raw: string
  try {
    raw = readFileSync(paths.gaps(), 'utf8')
  } catch {
    return []
  }
  const gaps: Gap[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      gaps.push(JSON.parse(line) as Gap)
    } catch {
      // A corrupt line loses one incident, not the whole history.
    }
  }
  return gaps
}

export function nextGapId(existing: Gap[]): string {
  const max = existing.reduce((acc, g) => {
    const n = Number.parseInt(g.id.replace(/^g-/, ''), 10)
    return Number.isFinite(n) && n > acc ? n : acc
  }, 0)
  return `g-${String(max + 1).padStart(4, '0')}`
}

export function readState(sessionId: string): SessionState {
  try {
    const parsed = JSON.parse(readFileSync(paths.state(sessionId), 'utf8')) as SessionState
    return { ...emptyState(sessionId), ...parsed, sessionId }
  } catch {
    return emptyState(sessionId)
  }
}

export function writeState(state: SessionState): void {
  mkdirSync(paths.stateDir(), { recursive: true })
  writeFileSync(paths.state(state.sessionId), JSON.stringify(state, null, 2) + '\n', 'utf8')
}

/** Clear task-scoped fields at a task boundary. `rush` survives: it is session-scoped. */
export function resetTask(state: SessionState): SessionState {
  return {
    ...state,
    task: undefined,
    level: undefined,
    predicted: false,
    trivial: false,
    predictedAt: undefined,
    editsSincePrediction: 0,
    taskPrompt: undefined,
  }
}

/**
 * Mark the current task as still active.
 *
 * Called by the gate on every write it lets through. This is what turns the task
 * boundary from "time since you predicted" into "time since anything happened" —
 * without it, a long task would be interrupted mid-flow.
 */
export function touchTask(state: SessionState): void {
  try {
    writeState({
      ...state,
      predictedAt: new Date().toISOString(),
      editsSincePrediction: state.editsSincePrediction + 1,
    })
  } catch {
    // Keeping the clock warm is a nicety; never let it block a write.
  }
}
