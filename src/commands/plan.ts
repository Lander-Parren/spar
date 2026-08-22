import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadConfig, trackedProject } from '../core/config.js'
import { ignoreSparDir } from './setup.js'
import {
  activeStep,
  clearPlan,
  isComplete,
  makePlan,
  parseSteps,
  readPlan,
  writePlan,
} from '../core/plan.js'

export interface PlanArgs {
  title?: string
  steps: string[]
  from?: string
  clear: boolean
  replace: boolean
  cwd?: string
}

/**
 * `spar plan` — create, show or discard the plan for this project.
 *
 * spar does not plan. Your agent reads the ticket and your planner breaks it up; this
 * only records the result, so that each step can be gated on its own.
 */
export function cmdPlan(args: PlanArgs): number {
  const cwd = args.cwd ?? process.cwd()
  const project = trackedProject(cwd, loadConfig())
  if (!project) {
    process.stderr.write('spar: not inside a tracked project. Run spar setup --project first.\n')
    return 1
  }
  const root = project.path

  if (args.clear) {
    clearPlan(root)
    console.log('plan cleared. The gate is back on the idle boundary.')
    return 0
  }

  let titles = args.steps
  if (args.from) {
    let markdown: string
    try {
      // Relative to the project this command is about, not to wherever the shell is.
      markdown = readFileSync(resolve(cwd, args.from), 'utf8')
    } catch {
      process.stderr.write(`spar: cannot read ${args.from}\n`)
      return 1
    }
    titles = parseSteps(markdown)
    if (titles.length === 0) {
      process.stderr.write(
        `spar: no "## Task" or "### Task" headings in ${args.from}. Use --step instead.\n`,
      )
      return 1
    }
  }

  if (titles.length === 0) return show(root)

  const existing = readPlan(root)
  const unfinished = existing !== undefined && !isComplete(existing)
  // Losing a plan you were halfway through by accident is not a mistake worth allowing.
  if (unfinished && !args.replace) {
    process.stderr.write(
      `spar: a plan with ${existing.steps.length} steps is still going. ` +
        'Finish it, or pass --replace.\n',
    )
    return 1
  }
  if (unfinished) console.log(`replacing a plan of ${existing.steps.length} steps`)

  // Before the directory exists, not after somebody has already committed it.
  ignoreSparDir(root)
  writePlan(root, makePlan(args.title ?? 'untitled', titles))
  console.log(`plan: ${titles.length} steps, starting with "${titles[0]}"`)
  return 0
}

function show(root: string): number {
  const plan = readPlan(root)
  if (!plan) {
    console.log('no plan. Create one with spar plan --title "..." --step "..." --step "..."')
    return 0
  }
  console.log(plan.title)
  plan.steps.forEach((step, i) => {
    const mark = step.status === 'done' ? 'done  ' : step.status === 'active' ? 'active' : '      '
    const level = step.level === undefined ? '' : `  level ${step.level}`
    console.log(`  ${mark} ${i + 1}. ${step.title}${level}`)
  })
  if (isComplete(plan)) console.log('\ncomplete. The gate is back on the idle boundary.')
  else if (activeStep(plan)) console.log(`\nstep ${plan.current + 1} of ${plan.steps.length}`)
  return 0
}
