import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdInstall } from '../src/commands/install.js'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-install-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
})

const claudeSettings = () => join(home, '.claude', 'settings.json')
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'))
const ours = (cmd: unknown) => String(cmd ?? '').startsWith('spar hook ')

function install(opts: { agent?: string; dryRun?: boolean } = {}) {
  return cmdInstall({ dryRun: false, home, ...opts })
}

describe('spar install', () => {
  it('does nothing when no supported agent is present', async () => {
    expect(install()).toBe(0)
    expect(existsSync(claudeSettings())).toBe(false)
  })

  it('writes hooks for an agent that is present', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    install()
    const hooks = read(claudeSettings()).hooks
    expect(Object.keys(hooks).sort()).toEqual(['PostToolUse', 'PreToolUse', 'SessionStart', 'UserPromptSubmit'])
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('spar hook gate')
  })

  it('keeps settings and hooks the user already had', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(claudeSettings(), JSON.stringify({
      model: 'opus',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-linter' }] }] },
    }))
    install()
    const after = read(claudeSettings())
    expect(after.model).toBe('opus')
    const commands = after.hooks.PreToolUse.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command))
    expect(commands).toContain('my-linter')
    expect(commands.some(ours)).toBe(true)
  })

  it('is idempotent — running twice does not duplicate anything', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    install()
    const once = readFileSync(claudeSettings(), 'utf8')
    install()
    expect(readFileSync(claudeSettings(), 'utf8')).toBe(once)
  })

  it('replaces only its own entries when re-installed after a change', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    install()
    const settings = read(claudeSettings())
    settings.hooks.PreToolUse[0].hooks[0].timeout = 999
    settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'untouched' }] })
    writeFileSync(claudeSettings(), JSON.stringify(settings))
    install()
    const after = read(claudeSettings())
    const commands = after.hooks.PreToolUse.flatMap((g: { hooks: { command: string }[] }) => g.hooks.map((h) => h.command))
    expect(commands).toContain('untouched')
    expect(commands.filter(ours)).toHaveLength(1)
    expect(after.hooks.PreToolUse.find((g: { hooks: { timeout: number }[] }) => ours(g.hooks[0].command)).hooks[0].timeout).toBe(5)
  })

  it('backs up an existing file before touching it', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    writeFileSync(claudeSettings(), JSON.stringify({ model: 'sonnet' }))
    install()
    expect(read(`${claudeSettings()}.spar-backup`).model).toBe('sonnet')
  })

  it('writes nothing on a dry run', async () => {
    mkdirSync(join(home, '.claude'), { recursive: true })
    install({ dryRun: true })
    expect(existsSync(claudeSettings())).toBe(false)
  })

  it('marks Cursor hooks failClosed:false, so spar can never block on its own failure', async () => {
    mkdirSync(join(home, '.cursor'), { recursive: true })
    install()
    const hooks = read(join(home, '.cursor', 'hooks.json')).hooks
    for (const event of Object.keys(hooks)) {
      expect(hooks[event][0].failClosed).toBe(false)
    }
  })

  it('rejects an unknown agent instead of guessing', async () => {
    expect(install({ agent: 'emacs' })).toBe(1)
  })
})
