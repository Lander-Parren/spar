import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { readGaps } from '../core/store.js'
import { readEvents } from '../core/events.js'
import { readFocus } from '../core/focus.js'
import { aggregate } from '../core/aggregate.js'
import { renderHtml } from '../render/html.js'
import { paths } from '../core/paths.js'

/** `spar dashboard` — the same numbers as `spar stats`, drawn. */
export function cmdDashboard(open: boolean): number {
  const stats = aggregate(readGaps(), readEvents(), readFocus())
  const target = paths.dashboard()
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderHtml(stats), 'utf8')
  console.log(target)
  if (open) openInBrowser(target)
  return 0
}

function openInBrowser(file: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [file], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Printing the path is the contract; opening it is a convenience.
  }
}
