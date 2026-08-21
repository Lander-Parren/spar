import { resolve } from 'node:path'
import { loadConfig, saveConfig } from '../core/config.js'
import { paths } from '../core/paths.js'

/** `spar setup --project <path>` — the one step that makes spar do anything at all. */
export function cmdSetup(opts: { project?: string; stack?: string; language?: string }): number {
  const config = loadConfig()

  if (opts.language) config.language = opts.language

  if (opts.project) {
    const path = resolve(opts.project)
    const existing = config.projects.find((p) => resolve(p.path) === path)
    if (existing) {
      if (opts.stack) existing.stack = opts.stack
    } else {
      config.projects.push({ path, ...(opts.stack ? { stack: opts.stack } : {}) })
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
    for (const p of config.projects) console.log(`  ${p.path}${p.stack ? `  [${p.stack}]` : ''}`)
  }
  return 0
}
