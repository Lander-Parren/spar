import { loadConfig, trackedFor, trackedProject } from '../core/config.js'
import { writeTargets } from '../core/shell-writes.js'
import { readState, touchTask, writeState } from '../core/store.js'
import { isTestPath } from '../core/test-paths.js'
import { LEVEL_NAMES } from '../core/types.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'

/** Tools that put text on disk. Anything else is none of our business. */
const WRITE_TOOLS = /^(Write|Edit|MultiEdit|str_replace|create_file|write_file)$/i

/** Tools that run a shell command, where a write hides inside the command string. */
const SHELL_TOOLS = /^(Bash|Shell|run_command|run_terminal_cmd|execute_command)$/i

/**
 * The gate. Cheap checks first, so the common case costs a few milliseconds.
 *
 * Every branch that is not a deliberate block returns `allow`, including every
 * error path: a learning tool must never be the reason someone cannot ship.
 */
export function gate(event: NormalizedEvent): NormalizedDecision {
  try {
    const config = loadConfig()

    let targets: string[] = []
    if (event.toolName && SHELL_TOOLS.test(event.toolName)) {
      // A shell command is a write only if it actually writes somewhere tracked. This
      // is where most writes really happen: an agent reaches for `cat > f <<EOF` far
      // more often than for a write tool, and some setups tell it to.
      targets = writeTargets(event.command ?? '', event.cwd)
      if (!targets.some((path) => trackedProject(path, config))) return { type: 'allow' }
    } else if (event.toolName && !WRITE_TOOLS.test(event.toolName)) {
      return { type: 'allow' }
    } else if (event.filePath) {
      targets = [event.filePath]
    }
    // By working directory or by target file: starting the agent a level up must not
    // quietly switch the gate off.
    const project = trackedFor(event.cwd, event.filePath, config)
    // Neither is tracked: the inert guarantee. A fresh install does nothing.
    if (!project) return { type: 'allow' }

    let state = readState(event.sessionId)
    if (state.rush) return { type: 'allow' }
    if (state.trivial) return { type: 'allow' }

    const s = event.sessionId

    if (state.level === undefined) {
      return {
        type: 'deny',
        userMessage: 'spar: predict before you look.',
        agentMessage: [
          'spar: this task has not been gated yet. Do NOT retry the edit until these steps are done.',
          '',
          'Follow the `spar` skill. In short:',
          '1. Judge whether this change is non-trivial. If it is trivial (rename, formatting,',
          `   comment, test data, mechanical repetition of an existing pattern), run:`,
          `     spar mark --session ${s} --trivial`,
          '   and continue as normal.',
          '2. Otherwise name 1-3 concepts this change touches and ask for a level:',
          `     spar suggest-level --session ${s} --concept "<concept>"`,
          '3. Put the suggested level (with its reason) to the user, then ask them the three',
          '   questions from the skill and record their answers:',
          `     spar predict --session ${s} --q1 "..." --q2 "..." --q3 "..."`,
          '',
          'Then make the edit.',
        ].join('\n'),
      }
    }

    const level = state.level
    if (level === 0) return { type: 'allow' }

    // At every level, a test being written is worth remembering: handover checks that
    // the user was left something to measure themselves against.
    if (targets.length > 0 && targets.every(isTestPath)) {
      // Keep the local copy in step: touchTask below writes state back, and handing it a
      // stale object would erase the flag we just set.
      if (!state.testWritten) {
        state = { ...state, testWritten: true }
        writeState(state)
      }
      // At level 3 the agent writes the test and nothing else. The test is the brief;
      // the implementation is the user's.
      if (level === 3) return { type: 'allow' }
    }

    if (level === 3) {
      return {
        type: 'deny',
        userMessage: 'spar level 3: you write this one.',
        agentMessage: [
          'spar is at level 3 (transcript) for this task. You may not write files.',
          '',
          'Deliver the full implementation in chat instead, with enough explanation that the',
          'user can place it themselves: which file, where in it, and why there. Then stop and',
          'wait. When the user says they are done, run:',
          `  spar done --session ${s}`,
          'and compare what they actually wrote against what you proposed.',
          '',
          `If this task turns out not to warrant level 3, the user can lower it with:  spar level --session ${s} <0-2>`,
        ].join('\n'),
      }
    }

    if (!state.predicted) {
      return {
        type: 'deny',
        userMessage: 'spar: answer the three questions first.',
        agentMessage: [
          `spar is at level ${level} (${LEVEL_NAMES[level]}) but the user has not`,
          'predicted yet. Ask them the three questions from the skill, then record the answers:',
          `  spar predict --session ${s} --q1 "..." --q2 "..." --q3 "..."`,
          '',
          '"no idea" is a valid answer to any of them — record it verbatim, do not coach them',
          'into a guess. Then make the edit.',
        ].join('\n'),
      }
    }

    // Level 2 is allowed through here; the skeleton check verifies it after the write.
    // Touching keeps this task alive so the boundary measures silence, not age.
    touchTask(state)
    return { type: 'allow' }
  } catch {
    // Fail open, always.
    return { type: 'allow' }
  }
}
