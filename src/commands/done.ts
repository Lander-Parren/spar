import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, relative } from 'node:path'
import { readTask } from '../core/task-state.js'
import { loadConfig, trackedProject } from '../core/config.js'
import { readProposals } from '../core/proposals.js'
import { diffLines, hasChanges, renderDiff } from '../core/diff.js'
import { LEVEL_NAMES, type Config } from '../core/types.js'
import { MARKER } from '../hooks/skeleton.js'
import { GUIDE } from '../core/guide.js'

/**
 * `spar done` — the closing review, at levels 2 and 3.
 *
 * This is the step the Cursor workflow never had. Copying an implementation out of a
 * chat teaches you something only if somebody checks afterwards whether you
 * understood it or merely typed it. The diff is the check.
 */
export function cmdDone(sessionId: string, cwd: string = process.cwd()): number {
  const state = readTask(sessionId, cwd)
  const level = state.level ?? 1

  if (level < 2) {
    console.log(`spar: level ${level} (${LEVEL_NAMES[level]}) has no closing review. Nothing to do.`)
    return 0
  }

  const proposals = readProposals(sessionId)
  if (proposals.length === 0) {
    console.log(
      [
        `spar: level ${level} (${LEVEL_NAMES[level]}), but nothing was recorded to compare against.`,
        level === 3
          ? 'At level 3, record what you offered before the user writes it:\n' +
            `  spar propose --session ${sessionId} --file <path> < proposal.txt`
          : 'At level 2 the skeleton is recorded automatically when you write it.',
      ].join('\n'),
    )
    return 0
  }

  const config = loadConfig()
  console.log(`spar: closing review for level ${level} (${LEVEL_NAMES[level]}).\n`)

  let anyDiff = false
  for (const proposal of proposals) {
    const current = read(proposal.file)
    const name = displayPath(proposal.file, config)

    if (current === undefined) {
      console.log(`## ${name}\n  not on disk. The user has not written this one yet.\n`)
      continue
    }

    const lines = diffLines(proposal.content, current)
    const leftover = current.includes(MARKER)

    if (!hasChanges(lines)) {
      console.log(
        `## ${name}\n  identical to what was proposed.` +
          (level === 3
            ? '\n  Worth asking why they placed it where they did. A clean copy tells you nothing yet.\n'
            : '\n'),
      )
      continue
    }

    anyDiff = true
    console.log(`## ${name}   (- proposed, + written)`)
    console.log(renderDiff(lines))
    if (leftover) console.log(`\n  NOTE: ${MARKER} markers are still in this file. Unfinished, not a gap.`)
    console.log()
  }

  console.log(
    [
      '---',
      '',
      anyDiff
        ? 'Sort every difference above into one kind, log the first two, and ask why they'
        : 'No textual differences. Do not stop here.',
      anyDiff ? 'placed it where they did.' : 'Ask why they placed it where they did.',
      '',
      `  spar log --session ${sessionId} --concept "<concept>" \\`,
      '    --model "<the belief, no framing words>" --reality "<what is true>" \\',
      '    --kind <misconception|typo-bug>',
      '',
      `Follow the spar skill. Without it: spar guide ${GUIDE.review}`,
    ].join('\n'),
  )
  return 0
}

/**
 * Show a path relative to the project it belongs to, not to the working directory.
 *
 * The project root is the frame the user actually thinks in ("src/Api/Orders.cs"),
 * and it stays stable wherever `spar done` happens to be run from. Falls back to
 * the working directory, then to the absolute path — which also covers macOS, where
 * /var is a symlink to /private/var and a naive relative() degenerates into `../..`.
 */
function displayPath(file: string, config: Config): string {
  const project = trackedProject(dirname(file), config)
  for (const base of [project?.path, process.cwd()]) {
    if (!base) continue
    const rel = relative(base, file)
    if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return rel
  }
  return file
}

function read(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}
