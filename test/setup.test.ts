import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdActivation, cmdSetup } from '../src/commands/setup.js'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const ignore = () => readFileSync(join(project, '.gitignore'), 'utf8')

describe('setup and .gitignore', () => {
  it('adds .spar/ so a plan never lands in someone else pull request', () => {
    cmdSetup({ project })
    expect(ignore()).toMatch(/^\.spar\/$/m)
  })

  it('creates the file when the project has none', () => {
    expect(existsSync(join(project, '.gitignore'))).toBe(false)
    cmdSetup({ project })
    expect(existsSync(join(project, '.gitignore'))).toBe(true)
  })

  it('keeps what was already there', () => {
    writeFileSync(join(project, '.gitignore'), 'node_modules/\ndist/\n')
    cmdSetup({ project })
    expect(ignore()).toContain('node_modules/')
    expect(ignore()).toContain('dist/')
  })

  it('does not add it twice', () => {
    cmdSetup({ project })
    cmdSetup({ project })
    expect(ignore().match(/^\.spar\/$/gm)).toHaveLength(1)
  })

  it('leaves an existing entry alone whatever form it takes', () => {
    writeFileSync(join(project, '.gitignore'), '.spar\n')
    cmdSetup({ project })
    expect(ignore().match(/\.spar/g)).toHaveLength(1)
  })

  it('refuses a path that is not a directory, instead of saving a dead config', () => {
    // A project that matches nothing is indistinguishable from the inert guarantee
    // working as designed, so a typo here would produce a silently dead install.
    expect(cmdSetup({ project: join(project, 'does', 'not', 'exist') })).toBe(1)
  })
})

describe('activation', () => {
  const saved = () => JSON.parse(readFileSync(join(home, 'config.json'), 'utf8'))

  it('leaves a fresh install dormant, gating nothing until it is asked to', () => {
    cmdSetup({ project })
    expect(saved().activation).toBe('skill')
  })

  it('goes back to gating every write in one command', () => {
    cmdSetup({ project })
    expect(cmdActivation('always')).toBe(0)
    expect(saved().activation).toBe('always')
  })

  it('does not lose the projects it already knew about', () => {
    cmdSetup({ project })
    cmdActivation('always')
    expect(saved().projects).toHaveLength(1)
  })

  it('refuses a value it does not understand rather than guessing at one', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    cmdSetup({ project })
    expect(cmdActivation('sometimes')).toBe(1)
    expect(cmdActivation(undefined)).toBe(1)
    expect(saved().activation).toBe('skill')
    stderr.mockRestore()
  })
})
