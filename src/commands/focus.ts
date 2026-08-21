import { loadConfig } from '../core/config.js'
import { readFocus, writeFocus } from '../core/focus.js'

/**
 * `spar focus "<concept>" ...` — flag concepts to work on, from the dashboard.
 *
 * A flag that changes nothing is theatre, so focus has teeth: it raises the suggested
 * level by one on those concepts and gives their gaps priority when they come back.
 * And it expires, because a priority list where everything is priority is a list of
 * nothing.
 */
export function cmdFocus(concepts: string[], clear: boolean): number {
  const config = loadConfig()

  if (clear) {
    writeFocus([], config.focusDays)
    console.log('focus cleared')
    return 0
  }

  if (concepts.length === 0) {
    const current = readFocus()
    console.log(
      current.length
        ? `focused (expires after ${config.focusDays}d):\n` + current.map((c) => `  ${c}`).join('\n')
        : 'nothing focused',
    )
    return 0
  }

  writeFocus(concepts, config.focusDays)
  console.log(
    `focusing ${concepts.length} concept${concepts.length === 1 ? '' : 's'} for ${config.focusDays} days:\n` +
      concepts.map((c) => `  ${c}`).join('\n') +
      '\n\nLevels on these go up by one, and their gaps come back first.',
  )
  return 0
}
