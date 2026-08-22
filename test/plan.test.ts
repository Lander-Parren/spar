import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  activeStep,
  advance,
  clearPlan,
  isComplete,
  makePlan,
  planPath,
  readPlan,
  writePlan,
} from '../src/core/plan.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'spar-plan-'))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const three = () => makePlan('PROJ-1', ['one', 'two', 'three'], new Date('2026-08-22T10:00:00Z'))

describe('makePlan', () => {
  it('activates the first step and leaves the rest to do', () => {
    const plan = three()
    expect(plan.steps.map((s) => s.status)).toEqual(['active', 'todo', 'todo'])
    expect(plan.current).toBe(0)
    expect(plan.created).toBe('2026-08-22T10:00:00.000Z')
  })

  it('refuses a plan with no steps, which would gate nothing', () => {
    expect(() => makePlan('t', [])).toThrow(/at least one step/i)
  })
})

describe('activeStep', () => {
  it('returns the step at current', () => {
    expect(activeStep(three())?.title).toBe('one')
  })

  it('returns nothing once the plan is complete', () => {
    let plan = three()
    for (let i = 0; i < 3; i++) plan = advance(plan)
    expect(activeStep(plan)).toBeUndefined()
    expect(isComplete(plan)).toBe(true)
  })
})

describe('advance', () => {
  it('marks the active step done and activates the next', () => {
    const plan = advance(three())
    expect(plan.steps.map((s) => s.status)).toEqual(['done', 'active', 'todo'])
    expect(plan.current).toBe(1)
  })

  it('keeps current in step with the active status', () => {
    const plan = advance(advance(three()))
    expect(plan.steps[plan.current]!.status).toBe('active')
  })

  it('leaves what the finished step recorded intact', () => {
    const started = three()
    started.steps[0]!.level = 2
    started.steps[0]!.predicted = true
    const plan = advance(started)
    expect(plan.steps[0]).toMatchObject({ status: 'done', level: 2, predicted: true })
  })

  it('is a no-op on a complete plan rather than an error', () => {
    let plan = three()
    for (let i = 0; i < 5; i++) plan = advance(plan)
    expect(isComplete(plan)).toBe(true)
    expect(plan.steps.every((s) => s.status === 'done')).toBe(true)
  })

  it('does not mutate the plan it was given', () => {
    const before = three()
    advance(before)
    expect(before.steps[0]!.status).toBe('active')
  })
})

describe('storage', () => {
  it('round-trips through the project', () => {
    writePlan(root, three())
    expect(readPlan(root)?.steps).toHaveLength(3)
    expect(planPath(root)).toBe(join(root, '.spar', 'plan.json'))
  })

  it('returns nothing when there is no plan', () => {
    expect(readPlan(root)).toBeUndefined()
  })

  it('returns nothing rather than throwing on a corrupt file', () => {
    mkdirSync(join(root, '.spar'), { recursive: true })
    writeFileSync(planPath(root), 'not json')
    expect(readPlan(root)).toBeUndefined()
  })

  it('clears, and clearing twice is not an error', () => {
    writePlan(root, three())
    clearPlan(root)
    expect(existsSync(planPath(root))).toBe(false)
    expect(() => clearPlan(root)).not.toThrow()
  })
})
