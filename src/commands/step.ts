import { loadConfig, trackedProject } from '../core/config.js'
import { advance, isComplete, readPlan, writePlan } from '../core/plan.js'
import { readTask } from '../core/task-state.js'
import { GUIDE } from '../core/guide.js'

/**
 * `spar step done` — finish the active step and start the next.
 *
 * Applies the same bar as the handover: at level 2 or 3 the step is not done until a
 * failing test exists. A tick box that can be ticked regardless is a tick box that means
 * nothing. The step is not done because you say so; it is done when it meets what the
 * level asked for.
 */
export function cmdStepDone(opts: { sessionId?: string; cwd?: string }): number {
  const cwd = opts.cwd ?? process.cwd()
  const project = trackedProject(cwd, loadConfig())
  if (!project) {
    process.stderr.write('spar: not inside a tracked project.\n')
    return 1
  }

  const plan = readPlan(project.path)
  // Finishing a step you never started is the kind of confusion worth naming.
  if (!plan || isComplete(plan)) {
    process.stderr.write('spar: no plan in progress. Create one with spar plan.\n')
    return 1
  }

  const task = readTask(opts.sessionId ?? 'step-done', cwd)
  const level = task.level ?? 1
  if (!task.rush && (level === 2 || level === 3) && !task.testWritten) {
    process.stderr.write(
      `spar: this step is at level ${level} and no test was written, so it is not done.\n` +
        `Write one that fails first. Why: spar guide ${GUIDE.handover}\n`,
    )
    return 1
  }

  const next = advance(plan)
  writePlan(project.path, next)

  if (isComplete(next)) {
    console.log('step done. The plan is complete, and the gate is back on the idle boundary.')
  } else {
    console.log(`step done. Next: "${next.steps[next.current]!.title}"`)
  }
  return 0
}
