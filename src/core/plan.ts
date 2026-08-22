import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
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
  suiteCheckedAtEdits?: number
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

/**
 * Write to a temporary file and rename over the target, the way store.ts updates a gap.
 * Rename is atomic on POSIX, so a crash mid-write leaves the previous plan rather than a
 * truncated one. The gate writes here on every edit it lets through, so "mid-write" is
 * not a rare moment.
 */
export function writePlan(root: string, plan: Plan): void {
  mkdirSync(join(root, '.spar'), { recursive: true })
  const target = planPath(root)
  const temp = `${target}.tmp`
  writeFileSync(temp, JSON.stringify(plan, null, 2) + '\n', 'utf8')
  renameSync(temp, target)
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

/**
 * Step titles out of a markdown plan.
 *
 * Matches the `## Task` and `### Task` headings that superpowers writing-plans and the
 * OMC planners produce. Anything else is left alone: this is a convenience in front of
 * the same entrance as --step, not a second way in, so a format it does not know yields
 * nothing and the caller says so.
 */
export function parseSteps(markdown: string): string[] {
  const titles: string[] = []
  for (const line of markdown.split('\n')) {
    const heading = /^#{2,3}\s+Task\s*\d*\s*[:.-]?\s*(.+?)\s*$/i.exec(line)
    if (heading?.[1]) titles.push(heading[1])
  }
  return titles
}
