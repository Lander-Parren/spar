import { loadConfig, trackedFor } from './config.js'
import { activeStep, readPlan, writePlan, type PlanStep } from './plan.js'
import { readState, writeState } from './store.js'
import type { SessionState } from './types.js'

/** Session state as the current task sees it, plus where those values came from. */
export type TaskState = Omit<SessionState, 'sessionId'> & { fromPlan: boolean }

/**
 * Patch rather than replace.
 *
 * The gate once erased a flag by handing back a state object it had read moments
 * earlier; a patch makes that mistake impossible to express.
 */
export type TaskPatch = Partial<Omit<SessionState, 'sessionId'>>

/** Fields that follow the task, and therefore live on the step when a plan is active. */
const TASK_FIELDS = [
  'level',
  'predicted',
  'testWritten',
  'trivial',
  'predictedAt',
  'editsSincePrediction',
  'handoverBlocked',
] as const satisfies readonly (keyof TaskPatch)[]

/** Clear the task-scoped fields. `rush` survives: it is session-scoped. */
export const RESET: TaskPatch = {
  task: undefined,
  level: undefined,
  predicted: false,
  trivial: false,
  predictedAt: undefined,
  editsSincePrediction: 0,
  taskPrompt: undefined,
  testWritten: false,
  handoverBlocked: false,
}

/**
 * One place that decides where the current task's state lives.
 *
 * With a plan, on the active step, so it is still there tomorrow and does not follow you
 * into the next step. Without one, in session state, so a user who never runs `spar plan`
 * sees no change at all. Every hook and every session command reads through here rather
 * than carrying the branch itself, which is also why the two can never disagree about
 * which of the two sources is in play.
 */
export function readTask(sessionId: string, cwd: string, filePath?: string): TaskState {
  const { sessionId: _sessionId, ...session } = readState(sessionId)
  const base: TaskState = { ...session, fromPlan: false }

  const step = stepFor(cwd, filePath)
  if (!step) return base

  return {
    ...base,
    fromPlan: true,
    // The step's title IS the task label. Without this every gap logged during a plan
    // would record an empty task, because the boundary hook (which normally captures the
    // prompt) returns early while a plan is active.
    task: step.title,
    level: step.level,
    predicted: step.predicted ?? false,
    testWritten: step.testWritten ?? false,
    trivial: step.trivial ?? false,
    predictedAt: step.predictedAt,
    editsSincePrediction: step.editsSincePrediction ?? 0,
    handoverBlocked: step.handoverBlocked,
  }
}

export function writeTask(
  sessionId: string,
  cwd: string,
  patch: TaskPatch,
  filePath?: string,
): void {
  const root = projectRoot(cwd, filePath)
  const step = root ? stepFor(cwd, filePath) : undefined

  const sessionPatch: TaskPatch = { ...patch }
  if (step) for (const field of TASK_FIELDS) delete sessionPatch[field]
  writeState({ ...readState(sessionId), ...sessionPatch, sessionId })

  if (!step || !root) return
  const plan = readPlan(root)
  if (!plan) return
  const target = plan.steps[plan.current]
  if (!target) return
  for (const field of TASK_FIELDS) {
    if (field in patch) assign(target, field, patch[field])
  }
  writePlan(root, plan)
}

/** Start the task over, wherever its state lives. Used by the boundary and `spar next`. */
export function resetTaskState(sessionId: string, cwd: string): void {
  writeTask(sessionId, cwd, RESET)
}

function assign(step: PlanStep, field: string, value: unknown): void {
  ;(step as unknown as Record<string, unknown>)[field] = value
}

function projectRoot(cwd: string, filePath?: string): string | undefined {
  return trackedFor(cwd, filePath, loadConfig())?.path
}

function stepFor(cwd: string, filePath?: string): PlanStep | undefined {
  const root = projectRoot(cwd, filePath)
  if (!root) return undefined
  const plan = readPlan(root)
  return plan ? activeStep(plan) : undefined
}
