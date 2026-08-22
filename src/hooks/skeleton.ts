import { readFileSync } from 'node:fs'
import { loadConfig, trackedFor } from '../core/config.js'
import { writeTargets } from '../core/shell-writes.js'
import { readState } from '../core/store.js'
import { addProposal, readProposals } from '../core/proposals.js'
import type { NormalizedDecision, NormalizedEvent } from '../adapters/types.js'

/**
 * The marker every level 2 skeleton must leave behind.
 *
 * Matched as a plain substring, never parsed as a comment. That one decision is why
 * this works identically in //, #, --, %, and block comments — no lexer, no per
 * language cases, nothing to keep up to date as people bring their own stacks.
 */
export const MARKER = 'TODO(spar:'

const WRITE_TOOLS = /^(Write|Edit|MultiEdit|str_replace|create_file|write_file)$/i
const SHELL_TOOLS = /^(Bash|Shell|run_command|run_terminal_cmd|execute_command)$/i

/**
 * Runs after a write. At level 2 it verifies the agent actually left the
 * decision-carrying lines for the user.
 *
 * This exists because at level 2 the agent is judging its own friction: it decides
 * how much to leave undone, and it has every incentive to leave nothing. A
 * deterministic check closes that door in a way a prompt cannot.
 */
export function skeleton(event: NormalizedEvent): NormalizedDecision {
  try {
    const shell = Boolean(event.toolName && SHELL_TOOLS.test(event.toolName))
    if (event.toolName && !shell && !WRITE_TOOLS.test(event.toolName)) return { type: 'noop' }

    const config = loadConfig()
    if (!trackedFor(event.cwd, event.filePath, config)) return { type: 'noop' }

    const state = readState(event.sessionId)
    if (state.level !== 2 || state.trivial || state.rush) return { type: 'noop' }

    // A shell write names its target inside the command, not in a file_path field.
    const path = event.filePath ?? (shell ? writeTargets(event.command ?? '', event.cwd)[0] : undefined)
    if (!path) return { type: 'noop' }

    const content = readWritten(path, event.content)
    if (content === undefined) return { type: 'noop' }

    // Record it either way: at level 2 the skeleton IS the proposal `spar done` diffs against.
    addProposal(event.sessionId, {
      file: path,
      content,
      source: 'skeleton',
      ts: new Date().toISOString(),
    })

    // Judged per task, not per file. A test file or a config tweak inside a level 2
    // task legitimately carries no decision; what matters is that the task as a whole
    // left something for the user.
    const anyMarker = readProposals(event.sessionId).some((p) => p.content.includes(MARKER))
    if (anyMarker) return { type: 'noop' }

    return {
      type: 'feedback',
      message: [
        `spar is at level 2 (skeleton) but nothing you have written this task contains ${MARKER}.`,
        '',
        'Level 2 means you write the ceremony and the user writes the meaning. Go back and',
        'replace the lines that carry the actual decision with a marker naming precisely what',
        'the user has to decide, for example:',
        '',
        `  // ${MARKER} choose the transaction boundary — who opens it, and what happens on failure)`,
        '',
        'Signatures, imports, wiring and error plumbing are yours. The 5-10 lines where the',
        'design could reasonably have gone another way are theirs.',
      ].join('\n'),
    }
  } catch {
    return { type: 'noop' }
  }
}

/** Prefer what is on disk; fall back to what the agent said it wrote. */
function readWritten(path: string, fallback: string | undefined): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return fallback
  }
}
