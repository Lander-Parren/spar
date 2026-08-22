import { spawnSync } from 'node:child_process'
import { loadConfig, trackedFor } from '../core/config.js'
import { readState, writeState } from '../core/store.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'

/**
 * Runs when the agent wants to end its turn.
 *
 * At levels 2 and 3 the agent hands work to you. A `TODO(spar:)` with no test hands you
 * a guess and nothing to check it against, which puts you straight back into asking the
 * agent whether you got it right. That is the dependency spar exists to break, so the
 * handover is refused until a test exists.
 *
 * It objects at most once per task. A stop hook that always blocks traps the agent in a
 * loop, and a learning tool that hangs your session is worse than one that misses a case.
 */
export function handover(event: NormalizedEvent): NormalizedDecision {
  try {
    const config = loadConfig()
    const project = trackedFor(event.cwd, event.filePath, config)
    if (!project) return { type: 'noop' }

    const state = readState(event.sessionId)
    if (state.rush || state.trivial) return { type: 'noop' }
    if (state.level !== 2 && state.level !== 3) return { type: 'noop' }
    if (state.handoverBlocked) return { type: 'noop' }
    if (state.testWritten) {
      if (!project.testCommand || suiteIsRed(project.testCommand, project.path)) {
        return { type: 'noop' }
      }
      writeState({ ...state, handoverBlocked: true })
      return {
        type: 'block',
        reason: [
          'spar: the test you wrote passes already, against a stub that does nothing.',
          '',
          'A green test pins no behaviour, so it tells the user nothing about whether their',
          'implementation is right. Make it fail first, then hand it over.',
        ].join('\n'),
      }
    }
    // Nothing was written yet, so there is nothing to hand over.
    if (state.editsSincePrediction === 0) return { type: 'noop' }

    writeState({ ...state, handoverBlocked: true })
    return {
      type: 'block',
      reason: [
        `spar: level ${state.level} hands this work to the user, but no test was written.`,
        '',
        'Write a test that pins the behaviour and currently fails, so they can tell whether',
        'they got it right without asking you. That is the whole point of handing it over:',
        'a marker with no test leaves them alone with a guess.',
        '',
        state.level === 3
          ? 'At level 3 you may write the test file and nothing else.'
          : 'Then stop again.',
      ].join('\n'),
    }
  } catch {
    return { type: 'noop' }
  }
}

/**
 * Run the project's suite and report whether it failed.
 *
 * Fails open in every unclear case: a missing command, a crash, a timeout. Blocking a
 * handover because a test runner was slow would make spar the reason someone cannot
 * finish, which is the one thing it must never be.
 */
function suiteIsRed(command: string, cwd: string): boolean {
  try {
    const result = spawnSync(command, { cwd, shell: true, timeout: 45_000, stdio: 'ignore' })
    if (result.error || result.status === null) return true
    return result.status !== 0
  } catch {
    return true
  }
}
