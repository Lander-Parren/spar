import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { AGENTS, OWNED, hooksObject, type AgentName } from '../core/hookconfig.js'

/** Where each agent keeps the hook configuration `spar install` merges into. */
const CONFIG_FILE: Record<AgentName, (home: string) => string> = {
  'claude-code': (home) => join(home, '.claude', 'settings.json'),
  cursor: (home) => join(home, '.cursor', 'hooks.json'),
}

/**
 * `spar install` — wire the hooks into whichever agents are on this machine.
 *
 * Three rules, because this edits files the user did not write:
 *   merge, never overwrite; back up before touching anything; and only ever replace
 *   entries spar itself put there, identified by their command prefix. Running it
 *   twice changes nothing the second time, and removing spar's lines by hand works.
 */
export function cmdInstall(opts: { agent?: string; dryRun: boolean; home?: string }): number {
  // Home is injected rather than read at module load: paths fixed at import time cannot
  // be pointed at a scratch directory, and code that edits other people's config files
  // is the last place to accept being untestable.
  const home = opts.home ?? homedir()

  if (opts.agent && !AGENTS.includes(opts.agent as AgentName)) {
    console.log(`spar: unknown agent "${opts.agent}". Known: ${AGENTS.join(', ')}`)
    return 1
  }

  const wanted = AGENTS.filter((agent) =>
    opts.agent ? agent === opts.agent : existsSync(dirname(CONFIG_FILE[agent](home))),
  )

  if (wanted.length === 0) {
    console.log(
      'spar: found no supported agent on this machine.\n' +
        `Looked for: ${AGENTS.map((a) => dirname(CONFIG_FILE[a](home))).join(', ')}\n` +
        'Use --agent <name> to write the config anyway.',
    )
    return 0
  }

  for (const agent of wanted) {
    const file = CONFIG_FILE[agent](home)
    const merged = merge(agent, readJson(file))
    const body = JSON.stringify(merged, null, 2) + '\n'

    if (opts.dryRun) {
      console.log(`--- ${file} (dry run, nothing written) ---`)
      console.log(body)
      continue
    }

    if (existsSync(file)) {
      const backup = `${file}.spar-backup`
      copyFileSync(file, backup)
      console.log(`backed up  ${backup}`)
    }
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body, 'utf8')
    console.log(`installed  ${agent} -> ${file}`)
  }

  if (!opts.dryRun) {
    console.log(
      '\nspar does nothing until a project is named:\n' +
        '  spar setup --project /path/to/repo --stack "<your stack>"',
    )
  }
  return 0
}

/** Add spar's hooks to an existing config, leaving everything else exactly as it was. */
function merge(agent: AgentName, existing: Record<string, unknown>): Record<string, unknown> {
  const hooks = asRecord(existing.hooks)
  for (const [event, entries] of Object.entries(hooksObject(agent))) {
    const theirs = asArray(hooks[event]).filter((item) => !isOurs(item))
    hooks[event] = [...theirs, ...entries]
  }
  return agent === 'cursor'
    ? { ...existing, version: existing.version ?? 1, hooks }
    : { ...existing, hooks }
}

/** Ours if any command inside it is one of spar's, at either nesting depth. */
function isOurs(item: unknown): boolean {
  const record = asRecord(item)
  if (String(record.command ?? '').startsWith(OWNED)) return true
  return asArray(record.hooks).some((h) => String(asRecord(h).command ?? '').startsWith(OWNED))
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    // Missing is normal. Unparseable is not, but refusing to write would leave the user
    // stuck; the backup above means nothing is lost either way.
    return {}
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : []
}
