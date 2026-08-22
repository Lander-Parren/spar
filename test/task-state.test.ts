import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makePlan, readPlan, writePlan } from '../src/core/plan.js'
import { readTask, resetTaskState, writeTask } from '../src/core/task-state.js'
import { readState } from '../src/core/store.js'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

describe('with no plan', () => {
  it('reads and writes session state, exactly as before', () => {
    writeTask('s1', project, { level: 2, predicted: true })
    expect(readTask('s1', project)).toMatchObject({ level: 2, predicted: true, fromPlan: false })
    expect(readState('s1').level).toBe(2)
  })

  it('starts empty', () => {
    expect(readTask('s1', project)).toMatchObject({
      predicted: false,
      testWritten: false,
      trivial: false,
      rush: false,
      editsSincePrediction: 0,
      fromPlan: false,
    })
  })
})

describe('with a plan', () => {
  beforeEach(() => writePlan(project, makePlan('t', ['one', 'two'])))

  it('reads and writes the active step', () => {
    writeTask('s1', project, { level: 3, predicted: true })
    expect(readTask('s1', project)).toMatchObject({ level: 3, predicted: true, fromPlan: true })
    expect(readPlan(project)!.steps[0]).toMatchObject({ level: 3, predicted: true })
  })

  it('keeps task fields out of session state, so the two cannot disagree', () => {
    writeTask('s1', project, { level: 3, predicted: true })
    expect(readState('s1').level).toBeUndefined()
    expect(readState('s1').predicted).toBe(false)
  })

  it('keeps the prediction when the session id changes, which is the whole point', () => {
    writeTask('s1', project, { level: 3, predicted: true })
    expect(readTask('a-different-session', project)).toMatchObject({
      level: 3,
      predicted: true,
    })
  })

  it('does not leak one step into the next', () => {
    writeTask('s1', project, { level: 3, predicted: true })
    const plan = readPlan(project)!
    plan.steps[0]!.status = 'done'
    plan.steps[1]!.status = 'active'
    plan.current = 1
    writePlan(project, plan)
    expect(readTask('s1', project)).toMatchObject({ predicted: false, level: undefined })
  })

  it('keeps rush in the session, because it is about this sitting', () => {
    writeTask('s1', project, { rush: true })
    expect(readTask('s1', project).rush).toBe(true)
    expect(readPlan(project)!.steps[0]!.predicted).toBeUndefined()
    expect(readTask('another-session', project).rush).toBe(false)
  })

  it('matches by target file too, so a parent cwd still finds the plan', () => {
    writeTask('s1', join(project, '..'), { level: 1 }, join(project, 'src', 'a.ts'))
    expect(readPlan(project)!.steps[0]!.level).toBe(1)
  })

  it('resets the active step rather than the session', () => {
    writeTask('s1', project, { level: 2, predicted: true, testWritten: true })
    resetTaskState('s1', project)
    expect(readTask('s1', project)).toMatchObject({
      level: undefined,
      predicted: false,
      testWritten: false,
    })
  })

  it('falls back to the session once every step is done', () => {
    const plan = readPlan(project)!
    for (const step of plan.steps) step.status = 'done'
    writePlan(project, plan)
    writeTask('s1', project, { level: 1 })
    expect(readTask('s1', project)).toMatchObject({ level: 1, fromPlan: false })
  })
})

describe('outside a tracked project', () => {
  it('uses session state', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'spar-other-'))
    writeTask('s1', elsewhere, { level: 2 })
    expect(readTask('s1', elsewhere)).toMatchObject({ level: 2, fromPlan: false })
    rmSync(elsewhere, { recursive: true, force: true })
  })
})

describe('a project reached through a symlink', () => {
  it('still matches, because macOS hides /tmp and /var behind one', () => {
    const link = join(home, 'link-to-project')
    symlinkSync(project, link, 'dir')
    writePlan(project, makePlan('t', ['one']))

    writeTask('s1', link, { level: 2, predicted: true })

    // Written through the link, readable through the real path: one project, not two.
    expect(readPlan(project)!.steps[0]).toMatchObject({ level: 2, predicted: true })
    expect(readTask('s1', link)).toMatchObject({ level: 2, fromPlan: true })
  })

  it('matches a file that does not exist yet, which is what the gate is usually asked about', () => {
    const link = join(home, 'link-to-project')
    symlinkSync(project, link, 'dir')
    writePlan(project, makePlan('t', ['one']))

    writeTask('s1', tmpdir(), { level: 3 }, join(link, 'src', 'not-written-yet.ts'))
    expect(readPlan(project)!.steps[0]!.level).toBe(3)
  })
})
