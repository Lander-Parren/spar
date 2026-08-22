import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig, saveConfig } from '../core/config.js'
import { paths } from '../core/paths.js'

/**
 * Keep `.spar/` out of the project's history.
 *
 * The plan belongs to the project but not to its pull requests: it changes constantly
 * and it is one person's working state. A team that wants to share it can delete this
 * line. Never fatal, because failing to write someone else's .gitignore must not be the
 * reason setup fails.
 */
function ignoreSparDir(root: string): void {
  try {
    const file = join(root, '.gitignore')
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (/^\.spar\/?$/m.test(existing)) return
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    appendFileSync(file, `${prefix}.spar/\n`, 'utf8')
  } catch {
    // Not worth failing setup over.
  }
}

/** `spar setup --project <path>` — the one step that makes spar do anything at all. */
export function cmdSetup(opts: {
  project?: string
  stack?: string
  language?: string
  testCommand?: string
}): number {
  const config = loadConfig()

  if (opts.language) config.language = opts.language

  if (opts.project) {
    const path = resolve(opts.project)
    ignoreSparDir(path)
    const existing = config.projects.find((p) => resolve(p.path) === path)
    if (existing) {
      if (opts.stack) existing.stack = opts.stack
      if (opts.testCommand) existing.testCommand = opts.testCommand
    } else {
      config.projects.push({
        path,
        ...(opts.stack ? { stack: opts.stack } : {}),
        ...(opts.testCommand ? { testCommand: opts.testCommand } : {}),
      })
    }
  }

  saveConfig(config)

  console.log(`config: ${paths.config()}`)
  console.log(`language: ${config.language}`)
  if (config.projects.length === 0) {
    console.log('projects: none — spar is inert until you add one')
    console.log('  spar setup --project /path/to/repo --stack ".NET"')
  } else {
    console.log('projects:')
    for (const p of config.projects) {
      console.log(
        `  ${p.path}${p.stack ? `  [${p.stack}]` : ''}${p.testCommand ? `  test: ${p.testCommand}` : ''}`,
      )
    }
  }
  return 0
}
