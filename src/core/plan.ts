import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Level } from './types.js'

export type StepStatus = 'todo' | 'active' | 'done'

/**
 * One step of a plan, and the task state that belongs to it.
 *
 * The task-scoped fields mirror SessionState deliberately: when a plan is active they
 * are where the current task's state lives, and core/task-state.ts moves them across.
 */
export interface PlanStep {
  title: string
  status: StepStatus
  concepts?: string[]
  level?: Level
  predicted?: boolean
  testWritten?: boolean
  trivial?: boolean
  predictedAt?: string
  editsSincePrediction?: number
  handoverBlocked?: boolean
}

export interface Plan {
  title: string
  created: string
  /** Zero-based index of the active step, kept in step with the statuses. */
  current: number
  steps: PlanStep[]
}

export function planPath(root: string): string {
  return join(root, '.spar', 'plan.json')
}

/**
 * The plan lives with the project rather than in the home directory, because how a
 * ticket was broken up is about the work. What you do not yet understand is about you,
 * and that stays in ~/.spar.
 */
export function readPlan(root: string): Plan | undefined {
  try {
    const parsed = JSON.parse(readFileSync(planPath(root), 'utf8')) as Plan
    return Array.isArray(parsed?.steps) && parsed.steps.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

export function writePlan(root: string, plan: Plan): void {
  mkdirSync(join(root, '.spar'), { recursive: true })
  writeFileSync(planPath(root), JSON.stringify(plan, null, 2) + '\n', 'utf8')
}

export function clearPlan(root: string): void {
  rmSync(planPath(root), { force: true })
}

export function makePlan(title: string, titles: string[], now = new Date()): Plan {
  if (titles.length === 0) throw new Error('a plan needs at least one step')
  return {
    title,
    created: now.toISOString(),
    current: 0,
    steps: titles.map((t, i) => ({ title: t, status: i === 0 ? 'active' : 'todo' })),
  }
}

export function activeStep(plan: Plan): PlanStep | undefined {
  const step = plan.steps[plan.current]
  return step?.status === 'active' ? step : undefined
}

export function isComplete(plan: Plan): boolean {
  return plan.steps.every((s) => s.status === 'done')
}

/** Mark the active step done and activate the next. A complete plan stays complete. */
export function advance(plan: Plan): Plan {
  const steps = plan.steps.map((s) => ({ ...s }))
  const current = steps[plan.current]
  if (current && current.status === 'active') current.status = 'done'

  const next = steps.findIndex((s) => s.status === 'todo')
  if (next === -1) return { ...plan, steps, current: Math.max(0, steps.length - 1) }
  steps[next]!.status = 'active'
  return { ...plan, steps, current: next }
}
