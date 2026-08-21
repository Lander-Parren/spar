import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

interface Target {
  agent: string
  /** Where this agent keeps its hook configuration, given a home directory. */
  file(home: string): string
  /** Merge spar's hooks into whatever is already there. */
  merge(existing: Record<string, unknown>): Record<string, unknown>
}

/** Every command spar owns starts with this, which is how uninstall finds them again. */
const OWNED = 'spar hook '

const CLAUDE_EVENTS: Record<string, { matcher: string; hook: string; timeout: number }> = {
  PreToolUse: { matcher: 'Write|Edit|MultiEdit', hook: 'gate', timeout: 5 },
  PostToolUse: { matcher: 'Write|Edit|MultiEdit', hook: 'skeleton', timeout: 5 },
  UserPromptSubmit: { matcher: '*', hook: 'boundary', timeout: 5 },
  SessionStart: { matcher: '*', hook: 'due', timeout: 10 },
}

const CURSOR_EVENTS: Record<string, { hook: string; timeout: number }> = {
  preToolUse: { hook: 'gate', timeout: 5 },
  postToolUse: { hook: 'skeleton', timeout: 5 },
  beforeSubmitPrompt: { hook: 'boundary', timeout: 5 },
  sessionStart: { hook: 'due', timeout: 10 },
}

const TARGETS: Target[] = [
  {
    agent: 'claude-code',
    file: (home) => join(home, '.claude', 'settings.json'),
    merge(existing) {
      const hooks = asRecord(existing.hooks)
      for (const [event, spec] of Object.entries(CLAUDE_EVENTS)) {
        const groups = stripOwned(asArray(hooks[event]), (g) =>
          asArray(asRecord(g).hooks).some((h) => String(asRecord(h).command ?? '').startsWith(OWNED)),
        )
        groups.push({
          matcher: spec.matcher,
          hooks: [{ type: 'command', command: `${OWNED}${spec.hook} --agent claude-code`, timeout: spec.timeout }],
        })
        hooks[event] = groups
      }
      return { ...existing, hooks }
    },
  },
  {
    agent: 'cursor',
    file: (home) => join(home, '.cursor', 'hooks.json'),
    merge(existing) {
      const hooks = asRecord(existing.hooks)
      for (const [event, spec] of Object.entries(CURSOR_EVENTS)) {
        const entries = stripOwned(asArray(hooks[event]), (e) =>
          String(asRecord(e).command ?? '').startsWith(OWNED),
        )
        entries.push({
          command: `${OWNED}${spec.hook} --agent cursor`,
          timeout: spec.timeout,
          // Cursor's default already, stated explicitly: spar must never block on its own failure.
          failClosed: false,
        })
        hooks[event] = entries
      }
      return { ...existing, version: existing.version ?? 1, hooks }
    },
  },
]

/**
 * `spar install` — wire the hooks into whichever agents are on this machine.
 *
 * Three rules, because this edits files the user did not write:
 *   merge, never overwrite; back up before touching anything; and only ever replace
 *   entries spar itself put there, identified by their command prefix. Running it
 *   twice changes nothing the second time.
 */
export function cmdInstall(opts: { agent?: string; dryRun: boolean; home?: string }): number {
  // Injected rather than read at module load: paths computed at import time cannot be
  // pointed at a scratch directory, which makes this command untestable and therefore
  // exactly the kind of code that quietly stops working.
  const home = opts.home ?? homedir()
  const wanted = TARGETS.filter((t) =>
    opts.agent ? t.agent === opts.agent : existsSync(dirname(t.file(home))),
  )

  if (wanted.length === 0) {
    console.log(
      opts.agent
        ? `spar: unknown agent "${opts.agent}". Known: ${TARGETS.map((t) => t.agent).join(', ')}`
        : 'spar: found no supported agent on this machine.\n' +
          `Looked for: ${TARGETS.map((t) => t.file(home)).join(', ')}\n` +
          'Use --agent <name> to write the config anyway.',
    )
    return opts.agent ? 1 : 0
  }

  for (const target of wanted) {
    const file = target.file(home)
    const existing = readJson(file)
    const merged = target.merge(existing)
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
    console.log(`installed  ${target.agent} -> ${file}`)
  }

  if (!opts.dryRun) {
    console.log(
      '\nspar does nothing until a project is named:\n' +
        '  spar setup --project /path/to/repo --stack "<your stack>"',
    )
  }
  return 0
}

function readJson(file: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    // Missing is normal. Unparseable is not, but refusing to write would leave the
    // user stuck; the backup above means nothing is lost either way.
    return {}
  }
}

function stripOwned(list: unknown[], isOurs: (item: unknown) => boolean): Record<string, unknown>[] {
  return list.filter((item) => !isOurs(item)) as Record<string, unknown>[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? [...value] : []
}
