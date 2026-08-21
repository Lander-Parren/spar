import { readState } from '../core/store.js'
import { LEVEL_NAMES } from '../core/types.js'

/**
 * `spar done` — the closing review, at levels 2 and 3.
 *
 * This is the step Cursor never gave you: copying code out of a chat teaches you
 * something only if someone checks afterwards whether you understood it or merely
 * typed it. Slice 1 prints the protocol; slice 2 wires the automatic diff.
 */
export function cmdDone(sessionId: string): number {
  const state = readState(sessionId)
  const level = state.level ?? 1

  if (level < 2) {
    console.log(`spar: level ${level} (${LEVEL_NAMES[level]}) has no closing review — nothing to do.`)
    return 0
  }

  console.log(
    [
      `spar: closing review for level ${level} (${LEVEL_NAMES[level]}).`,
      '',
      'Read what the user actually wrote and compare it against what you proposed.',
      'Sort every difference into exactly one of three kinds, and say which:',
      '',
      '  misconception  they misunderstood something -> log it',
      '  typo-bug       they mistyped or mis-wired it -> log it too, it is still a gap',
      '  improvement    theirs is better than yours   -> say so plainly, do not log it as a gap',
      '',
      'Then ask them WHY they placed it where they did. That question is the actual test;',
      'it survives copy-paste, so you never need to police how the code got there.',
      '',
      'Log each of the first two kinds:',
      `  spar log --session ${sessionId} --concept "<concept>" --model "<what they thought>" --reality "<what is true>" --kind <misconception|typo-bug>`,
    ].join('\n'),
  )
  return 0
}
