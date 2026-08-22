import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPlan } from '../src/core/plan.js'
import { cmdPlan, type PlanArgs } from '../src/commands/plan.js'

let home: string
let project: string
let said: string[]

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
  said = []
  vi.spyOn(console, 'log').mockImplementation((s?: unknown) => {
    said.push(String(s))
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
    said.push(String(s))
    return true
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const make = (over: Partial<PlanArgs> = {}) =>
  cmdPlan({
    title: 'PROJ-1',
    steps: ['one', 'two'],
    clear: false,
    replace: false,
    cwd: project,
    ...over,
  })

describe('spar plan', () => {
  it('creates a plan and activates the first step', () => {
    expect(make()).toBe(0)
    expect(readPlan(project)!.steps.map((s) => s.status)).toEqual(['active', 'todo'])
    expect(readPlan(project)!.title).toBe('PROJ-1')
  })

  it('reads steps out of a markdown plan', () => {
    const file = join(project, 'plan.md')
    writeFileSync(file, '### Task 1: One\n### Task 2: Two\n### Task 3: Three')
    expect(make({ steps: [], from: file })).toBe(0)
    expect(readPlan(project)!.steps).toHaveLength(3)
  })

  it('refuses a markdown file with no tasks, rather than making an empty plan', () => {
    const file = join(project, 'notes.md')
    writeFileSync(file, '# just prose')
    expect(make({ steps: [], from: file })).toBe(1)
    expect(readPlan(project)).toBeUndefined()
  })

  it('refuses a file it cannot read', () => {
    expect(make({ steps: [], from: join(project, 'nope.md') })).toBe(1)
  })

  it('refuses to replace an unfinished plan without being told to', () => {
    make()
    expect(make({ steps: ['three'] })).toBe(1)
    expect(said.join('\n')).toMatch(/--replace/)
    expect(readPlan(project)!.steps).toHaveLength(2)
  })

  it('replaces when told to, and says what it discarded', () => {
    make()
    expect(make({ steps: ['three'], replace: true })).toBe(0)
    expect(readPlan(project)!.steps).toHaveLength(1)
    expect(said.join('\n')).toMatch(/2 steps/)
  })

  it('replaces a finished plan without asking', () => {
    make({ steps: ['only'] })
    const plan = readPlan(project)!
    plan.steps[0]!.status = 'done'
    writeFileSync(join(project, '.spar', 'plan.json'), JSON.stringify(plan))
    expect(make({ steps: ['next ticket'] })).toBe(0)
  })

  it('shows the plan when given nothing to do', () => {
    make()
    said.length = 0
    expect(cmdPlan({ steps: [], clear: false, replace: false, cwd: project })).toBe(0)
    expect(said.join('\n')).toContain('one')
    expect(said.join('\n')).toMatch(/active/i)
  })

  it('says so when there is no plan to show', () => {
    expect(cmdPlan({ steps: [], clear: false, replace: false, cwd: project })).toBe(0)
    expect(said.join('\n')).toMatch(/no plan/i)
  })

  it('clears', () => {
    make()
    expect(cmdPlan({ steps: [], clear: true, replace: false, cwd: project })).toBe(0)
    expect(readPlan(project)).toBeUndefined()
  })

  it('refuses outside a tracked project rather than writing somewhere arbitrary', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'spar-other-'))
    expect(make({ cwd: elsewhere })).toBe(1)
    expect(readPlan(elsewhere)).toBeUndefined()
    rmSync(elsewhere, { recursive: true, force: true })
  })
})
