import { appendFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig, saveConfig } from '../core/config.js'
import { paths } from '../core/paths.js'
import type { Activation } from '../core/types.js'

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Keep `.spar/` out of the project's history.
 *
 * The plan belongs to the project but not to its pull requests: it changes constantly
 * and it is one person's working state. A team that wants to share it can delete this
 * line. Never fatal, because failing to write someone else's .gitignore must not be the
 * reason setup fails.
 *
 * Called from `spar plan` as well as from setup, so the entry is guaranteed to exist the
 * moment `.spar/` is first created. A user upgrading from 0.3.0 never ran a setup that
 * knew about plans, and would otherwise commit the directory before noticing it.
 */
export function ignoreSparDir(root: string): void {
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

function activationLine(activation: Activation): string {
  return activation === 'always'
    ? 'activation: always. Every write in a tracked project is gated'
    : 'activation: skill. spar is dormant until a session turns it on with spar on'
}

/**
 * `spar activation <skill|always>`. Who decides when the gate fires.
 *
 * Named separately from `spar on` because the two answer different questions: this one is
 * the standing default for every session, that one is this session only.
 */
export function cmdActivation(value: string | undefined): number {
  if (value !== 'skill' && value !== 'always') {
    process.stderr.write('spar: activation must be skill or always. Nothing was saved.\n')
    return 1
  }
  const config = loadConfig()
  config.activation = value
  saveConfig(config)
  console.log(activationLine(value))
  return 0
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
    // A path that matches nothing looks exactly like the inert guarantee working as
    // designed, so a typo here produces a dead install with no way to tell the two apart.
    if (!isDirectory(path)) {
      process.stderr.write(`spar: ${path} is not a directory. Nothing was saved.\n`)
      return 1
    }
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
  console.log(activationLine(config.activation))
  if (config.projects.length === 0) {
    console.log('projects: none. spar is inert until you add one')
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
