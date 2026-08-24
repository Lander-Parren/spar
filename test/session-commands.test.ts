import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makePlan, readPlan, writePlan } from '../src/core/plan.js'
import { readState } from '../src/core/store.js'
import {
  cmdEngage,
  cmdLevel,
  cmdMarkTrivial,
  cmdNext,
  cmdPredict,
  cmdRush,
} from '../src/commands/session.js'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const step = () => readPlan(project)!.steps[0]!

describe('with a plan', () => {
  beforeEach(() => writePlan(project, makePlan('t', ['one', 'two'])))

  it('records the level on the step', () => {
    cmdLevel('s1', 2, project)
    expect(step().level).toBe(2)
    expect(readState('s1').level).toBeUndefined()
  })

  it('records the prediction on the step, which is what the gate reads', () => {
    cmdLevel('s1', 1, project)
    cmdPredict('s1', { q1: 'a', q2: 'b', q3: 'c' }, project)
    expect(step()).toMatchObject({ predicted: true, editsSincePrediction: 0 })
    expect(step().predictedAt).toBeTruthy()
  })

  it('records trivial on the step', () => {
    cmdMarkTrivial('s1', project)
    expect(step().trivial).toBe(true)
  })

  it('keeps rush in the session', () => {
    cmdRush('s1', false, project)
    expect(readState('s1').rush).toBe(true)
    expect(step().trivial).toBeUndefined()
  })

  it('keeps engaged in the session, like rush', () => {
    cmdEngage('s1', true, project)
    expect(readState('s1').engaged).toBe(true)
    expect(step()).not.toHaveProperty('engaged')
  })

  it('lets spar next start the step over', () => {
    cmdLevel('s1', 2, project)
    cmdPredict('s1', { q1: 'a' }, project)
    cmdNext('s1', project)
    expect(step().predicted).toBe(false)
    // Written back as a missing key rather than an explicit null: JSON.stringify drops
    // undefined, which is exactly the shape a fresh step has.
    expect(step().level).toBeUndefined()
  })
})

describe('with no plan', () => {
  it('writes session state exactly as before', () => {
    cmdLevel('s1', 2, project)
    cmdPredict('s1', { q1: 'a' }, project)
    expect(readState('s1')).toMatchObject({ level: 2, predicted: true })
  })

  it('turns spar on and off again', () => {
    cmdEngage('s1', true, project)
    expect(readState('s1').engaged).toBe(true)
    cmdEngage('s1', false, project)
    expect(readState('s1').engaged).toBe(false)
  })

  it('keeps one session out of what another session decided', () => {
    cmdEngage('s1', true, project)
    expect(readState('s2').engaged).toBe(false)
  })
})
