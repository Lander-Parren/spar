import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makePlan, readPlan, writePlan } from '../src/core/plan.js'
import { writeTask } from '../src/core/task-state.js'
import { cmdStepDone } from '../src/commands/step.js'

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
  writePlan(project, makePlan('t', ['one', 'two']))
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const done = () => cmdStepDone({ sessionId: 's1', cwd: project })

describe('spar step done', () => {
  it('advances a level 1 step', () => {
    writeTask('s1', project, { level: 1, predicted: true })
    expect(done()).toBe(0)
    expect(readPlan(project)!.steps.map((s) => s.status)).toEqual(['done', 'active'])
  })

  it('refuses a level 2 step with no test, and says why', () => {
    writeTask('s1', project, { level: 2, predicted: true })
    expect(done()).toBe(1)
    expect(said.join('\n')).toMatch(/test/i)
    expect(readPlan(project)!.steps[0]!.status).toBe('active')
  })

  it('accepts a level 2 step once a test exists', () => {
    writeTask('s1', project, { level: 2, predicted: true, testWritten: true })
    expect(done()).toBe(0)
  })

  it('refuses a level 3 step with no test as well', () => {
    writeTask('s1', project, { level: 3, predicted: true })
    expect(done()).toBe(1)
  })

  it('lets a rushed step through, which is what rush is for', () => {
    writeTask('s1', project, { level: 2, predicted: true, rush: true })
    expect(done()).toBe(0)
  })

  it('says the plan is complete on the last step', () => {
    writeTask('s1', project, { level: 1, predicted: true })
    done()
    writeTask('s1', project, { level: 1, predicted: true })
    expect(done()).toBe(0)
    expect(said.join('\n')).toMatch(/complete/i)
  })

  it('names the next step so the agent knows what it is gating', () => {
    writeTask('s1', project, { level: 1, predicted: true })
    done()
    expect(said.join('\n')).toContain('two')
  })

  it('is an error with no plan rather than a silent no-op', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'spar-other-'))
    expect(cmdStepDone({ sessionId: 's1', cwd: elsewhere })).toBe(1)
    rmSync(elsewhere, { recursive: true, force: true })
  })
})
