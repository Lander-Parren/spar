import { loadConfig, trackedFor } from '../core/config.js'
import { readState, touchTask } from '../core/store.js'
import { LEVEL_NAMES } from '../core/types.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'

/** Tools that put text on disk. Anything else is none of our business. */
const WRITE_TOOLS = /^(Write|Edit|MultiEdit|str_replace|create_file|write_file)$/i

/**
 * The gate. Cheap checks first, so the common case costs a few milliseconds.
 *
 * Every branch that is not a deliberate block returns `allow`, including every
 * error path: a learning tool must never be the reason someone cannot ship.
 */
export function gate(event: NormalizedEvent): NormalizedDecision {
  try {
    if (event.toolName && !WRITE_TOOLS.test(event.toolName)) return { type: 'allow' }

    const config = loadConfig()
    // By working directory or by target file: starting the agent a level up must not
    // quietly switch the gate off.
    const project = trackedFor(event.cwd, event.filePath, config)
    // Neither is tracked: the inert guarantee. A fresh install does nothing.
    if (!project) return { type: 'allow' }

    const state = readState(event.sessionId)
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

    if (state.level === 0) return { type: 'allow' }

    if (state.level === 3) {
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
          `spar is at level ${state.level} (${LEVEL_NAMES[state.level]}) but the user has not`,
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
