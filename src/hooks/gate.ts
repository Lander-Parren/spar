import { loadConfig, trackedFor, trackedProject } from '../core/config.js'
import { writeTargets } from '../core/shell-writes.js'
import { readTask, writeTask } from '../core/task-state.js'
import { isTestPath } from '../core/test-paths.js'
import { GUIDE } from '../core/guide.js'
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
    /**
     * The file this event is really about. A write tool names it in `file_path`; a shell
     * command hides it inside the command string. Everything downstream needs it, because
     * matching on the working directory alone lets an agent one level up write into a
     * tracked project completely ungated.
     */
    let subject: string | undefined = event.filePath
    if (event.toolName && SHELL_TOOLS.test(event.toolName)) {
      // A shell command is a write only if it actually writes somewhere tracked. This
      // is where most writes really happen: an agent reaches for `cat > f <<EOF` far
      // more often than for a write tool, and some setups tell it to.
      targets = writeTargets(event.command ?? '', event.cwd)
      const tracked = targets.find((path) => trackedProject(path, config))
      if (!tracked) return { type: 'allow' }
      subject = tracked
    } else if (event.toolName && !WRITE_TOOLS.test(event.toolName)) {
      return { type: 'allow' }
    } else if (event.filePath) {
      targets = [event.filePath]
    }
    // By working directory or by target file: starting the agent a level up must not
    // quietly switch the gate off.
    const project = trackedFor(event.cwd, subject, config)
    // Neither is tracked: the inert guarantee. A fresh install does nothing.
    if (!project) return { type: 'allow' }

    let state = readTask(event.sessionId, event.cwd, subject)
    // Dormant unless this session said otherwise. The skill says so on its first step,
    // so spar asks for a prediction when you came looking for one and stays quiet when
    // you did not. `spar activation always` restores the unconditional gate.
    if (config.activation === 'skill' && !state.engaged) return { type: 'allow' }
    if (state.rush) return { type: 'allow' }
    if (state.trivial) return { type: 'allow' }

    const s = event.sessionId
    /**
     * The gate matches by working directory OR by target file, but the commands it names
     * only look at the working directory. Start the agent one level up and it would be
     * told to run commands that write somewhere the gate is not reading, which is a deny
     * with no way out. Name the project explicitly whenever the two differ.
     */
    const where = trackedProject(event.cwd, config) ? '' : ` --cwd ${project.path}`

    if (state.level === undefined) {
      return {
        type: 'deny',
        userMessage: 'spar: predict before you look.',
        agentMessage: [
          'spar: this task has not been gated yet. Do not retry the edit until it is.',
          '',
          `  spar mark --session ${s}${where} --trivial     (if this change decides nothing)`,
          `  spar suggest-level --session ${s}${where} --concept "<concept>"`,
          `  spar predict --session ${s}${where} --q1 "..." --q2 "..." --q3 "..."`,
          '',
          `Follow the spar skill. Without it: spar guide ${GUIDE.loop}`,
        ].join('\n'),
      }
    }

    const level = state.level
    if (level === 0) return { type: 'allow' }

    // At every level, a test being written is worth remembering: handover checks that
    // the user was left something to measure themselves against.
    if (targets.length > 0 && targets.every(isTestPath)) {
      if (!state.testWritten) {
        state = { ...state, testWritten: true }
        writeTask(event.sessionId, event.cwd, { testWritten: true }, subject)
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
          'spar is at level 3 for this task. You may write the test file, nothing else.',
          '',
          `  spar propose --session ${s} --file <path>     (record what you offer in chat)`,
          `  spar done --session ${s}${where}              (when the user says they are done)`,
          `  spar level --session ${s}${where} <0-2>       (if this does not warrant level 3)`,
          '',
          `Follow the spar skill. Without it: spar guide ${GUIDE.loop}`,
        ].join('\n'),
      }
    }

    if (!state.predicted) {
      return {
        type: 'deny',
        userMessage: 'spar: answer the three questions first.',
        agentMessage: [
          `spar is at level ${level} (${LEVEL_NAMES[level]}) and the user has not predicted yet.`,
          '',
          `  spar predict --session ${s}${where} --q1 "..." --q2 "..." --q3 "..."`,
          '',
          `Follow the spar skill. Without it: spar guide ${GUIDE.loop}`,
        ].join('\n'),
      }
    }

    // Level 2 is allowed through here; the skeleton check verifies it after the write.
    // Touching keeps this task alive so the boundary measures silence, not age.
    writeTask(
      event.sessionId,
      event.cwd,
      {
        predictedAt: new Date().toISOString(),
        editsSincePrediction: state.editsSincePrediction + 1,
      },
      subject,
    )
    return { type: 'allow' }
  } catch {
    // Fail open, always.
    return { type: 'allow' }
  }
}
