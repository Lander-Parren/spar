# spar plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a ticket be broken into steps that spar gates one at a time, with the level chosen per step and the prediction surviving the session.

**Architecture:** A plan lives in `<project>/.spar/plan.json`. One accessor, `core/task-state.ts`, decides whether the current task's state lives on the active step or in session state, and everything that reads or writes task state goes through it: the four hooks and the session commands alike. That single indirection is what keeps the feature additive, because with no plan the accessor returns session state and nothing else changes.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, ESM, NodeNext), Node >= 20, vitest. No new runtime dependencies.

**Spec:** `docs/design/2026-08-22-plans.md`

> Plan location note: the writing-plans default is `docs/superpowers/plans/`. This repo keeps design docs in `docs/design/`, so the plan sits beside its spec.

## Global Constraints

- Node >= 20. TypeScript strict with `noUncheckedIndexedAccess`. ESM with `.js` import specifiers.
- Zero new runtime dependencies.
- User-facing copy contains no em dash or en dash.
- Fail open: any error in a hook path returns the permissive decision.
- The plan lives in the project and is gitignored. The gap log stays in `~/.spar/`.
- `rush`, `task` and `taskPrompt` stay session state in every case. `level`, `predicted`,
  `testWritten`, `trivial`, `predictedAt`, `editsSincePrediction` and `handoverBlocked`
  follow the task, which means the active step when a plan exists.
- Every task ends green: `npx tsc -p tsconfig.json` exits 0, `npx vitest run` passes,
  `npm run build && npm run validate:example` passes.

## Why Tasks 4 and 5 are both required

The gate reads the task's level and prediction. `spar predict` writes them. If only the
hooks are routed through the accessor, the gate reads the active step while `spar predict`
writes session state, and the gate denies forever. Neither task is useful alone, and the
end-to-end check in Task 8 is what proves the two halves meet.

---

### Task 1: The plan model

**Files:**
- Create: `src/core/plan.ts`
- Test: `test/plan.test.ts`

**Interfaces:**
- Consumes: `Level` from `src/core/types.js`.
- Produces: `StepStatus`, `PlanStep`, `Plan`, `planPath(root: string): string`,
  `readPlan(root: string): Plan | undefined`, `writePlan(root: string, plan: Plan): void`,
  `clearPlan(root: string): void`,
  `makePlan(title: string, titles: string[], now?: Date): Plan`,
  `activeStep(plan: Plan): PlanStep | undefined`, `advance(plan: Plan): Plan`,
  `isComplete(plan: Plan): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// test/plan.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  activeStep, advance, clearPlan, isComplete, makePlan, planPath, readPlan, writePlan,
} from '../src/core/plan.js'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'spar-plan-')) })
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/plan.test.ts`
Expected: FAIL, cannot resolve `../src/core/plan.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/plan.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/plan.test.ts && npx tsc -p tsconfig.json`
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/plan.ts test/plan.test.ts
git commit -m "Plan model: steps, statuses and project-local storage"
```

---

### Task 2: Reading steps out of a markdown plan

**Files:**
- Modify: `src/core/plan.ts`
- Test: `test/plan.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseSteps(markdown: string): string[]`.

- [ ] **Step 1: Write the failing test**

Append to `test/plan.test.ts`, and add `parseSteps` to the existing import from
`../src/core/plan.js`:

```ts
describe('parseSteps', () => {
  it('reads the task headings a superpowers plan produces', () => {
    const md = [
      '# Something Implementation Plan',
      '## Global Constraints',
      '### Task 1: The plan model',
      'body',
      '### Task 2: Reading steps',
      '- [ ] **Step 1: Write the failing test**',
      '### Task 3: The accessor',
    ].join('\n')
    expect(parseSteps(md)).toEqual(['The plan model', 'Reading steps', 'The accessor'])
  })

  it('reads two-hash task headings as well', () => {
    expect(parseSteps('## Task 1: One\n## Task 2: Two')).toEqual(['One', 'Two'])
  })

  it('copes with a heading that has no colon', () => {
    expect(parseSteps('### Task 1 do the thing')).toEqual(['do the thing'])
  })

  it('ignores headings that are not tasks', () => {
    expect(parseSteps('## Global Constraints\n## Testing\n### Task 1: Real')).toEqual(['Real'])
  })

  it('returns nothing for a file with no tasks, so the caller can say so', () => {
    expect(parseSteps('# Just a document\n\nsome prose')).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/plan.test.ts -t parseSteps`
Expected: FAIL, `parseSteps` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/core/plan.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/plan.test.ts && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/plan.ts test/plan.test.ts
git commit -m "Read step titles out of a markdown plan"
```

---

### Task 3: The task-state accessor

**Files:**
- Create: `src/core/task-state.ts`
- Test: `test/task-state.test.ts`

**Interfaces:**
- Consumes: `loadConfig`, `trackedFor` from `src/core/config.js`; `activeStep`, `readPlan`,
  `writePlan`, `PlanStep` from Task 1; `readState`, `writeState` from `src/core/store.js`;
  `SessionState` from `src/core/types.js`.
- Produces:
  - `type TaskState = Omit<SessionState, 'sessionId'> & { fromPlan: boolean }`
  - `type TaskPatch = Partial<Omit<SessionState, 'sessionId'>>`
  - `readTask(sessionId: string, cwd: string, filePath?: string): TaskState`
  - `writeTask(sessionId: string, cwd: string, patch: TaskPatch, filePath?: string): void`
  - `resetTaskState(sessionId: string, cwd: string): void`
  - `const RESET: TaskPatch`

Deriving `TaskState` from `SessionState` rather than restating the fields is deliberate:
adding a field to `SessionState` later cannot silently leave the plan path behind.

- [ ] **Step 1: Write the failing test**

```ts
// test/task-state.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  mkdirSync(home, { recursive: true })
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
      predicted: false, testWritten: false, trivial: false, rush: false,
      editsSincePrediction: 0, fromPlan: false,
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
      level: 3, predicted: true,
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
    const parent = join(project, '..')
    writeTask('s1', parent, { level: 1 }, join(project, 'src', 'a.ts'))
    expect(readPlan(project)!.steps[0]!.level).toBe(1)
  })

  it('resets the active step rather than the session', () => {
    writeTask('s1', project, { level: 2, predicted: true, testWritten: true })
    resetTaskState('s1', project)
    expect(readTask('s1', project)).toMatchObject({
      level: undefined, predicted: false, testWritten: false,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/task-state.test.ts`
Expected: FAIL, cannot resolve `../src/core/task-state.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/task-state.ts
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
  'level', 'predicted', 'testWritten', 'trivial',
  'predictedAt', 'editsSincePrediction', 'handoverBlocked',
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/task-state.test.ts && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/task-state.ts test/task-state.test.ts
git commit -m "One accessor decides where the current task's state lives

With a plan it is the active step, so a prediction survives the session
and does not follow you into the next step. Without one it is session
state, which is what keeps this additive."
```

---

### Task 4: Hooks read through the accessor

**Files:**
- Modify: `src/hooks/gate.ts`, `src/hooks/skeleton.ts`, `src/hooks/handover.ts`,
  `src/hooks/boundary.ts`, `src/core/store.ts`
- Test: `test/gate.test.ts`

**Interfaces:**
- Consumes: `readTask`, `writeTask`, `resetTaskState` from Task 3.
- Produces: no new exports. `isNewTask` widens its first parameter from `SessionState` to
  `Pick<SessionState, 'predicted' | 'predictedAt'>` so it accepts a `TaskState` too.
  `touchTask` is removed from `src/core/store.ts`.

- [ ] **Step 1: Write the failing test**

First make the `run` helper in `test/gate.test.ts` accept overrides, if it does not already,
so the persistence test can vary the session id:

```ts
async function run(event: Record<string, unknown> = {}) {
  const { gate } = await import('../src/hooks/gate.js')
  return gate({
    kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: project,
    toolName: 'Write', filePath: join(project, 'src', 'a.ts'),
    ...event,
  } as never)
}
```

Then append. `config()` and `project` are the helpers `test/gate.test.ts` already uses;
reuse them rather than building new ones.

```ts
describe('with a plan', () => {
  it('gates the active step and keeps the prediction across sessions', async () => {
    config([project])
    const { makePlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    writePlan(project, makePlan('t', ['step one', 'step two']))

    expect((await run()).type).toBe('deny')

    writeTask('s1', project, { level: 1, predicted: true })
    expect((await run()).type).toBe('allow')

    // A new session, the same step: the prediction is still good.
    expect((await run({ sessionId: 'a-totally-different-session' })).type).toBe('allow')
  })

  it('re-arms on the next step without waiting for silence', async () => {
    config([project])
    const { advance, makePlan, readPlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    writePlan(project, makePlan('t', ['one', 'two']))
    writeTask('s1', project, { level: 1, predicted: true })
    expect((await run()).type).toBe('allow')

    writePlan(project, advance(readPlan(project)!))
    expect((await run()).type).toBe('deny')
  })

  it('records a test against the step, not the session', async () => {
    config([project])
    const { makePlan, readPlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    writePlan(project, makePlan('t', ['one']))
    writeTask('s1', project, { level: 2, predicted: true })

    await run({ filePath: join(project, 'test', 'a.test.ts') })
    expect(readPlan(project)!.steps[0]!.testWritten).toBe(true)
  })

  it('lets the step be the boundary, so silence does not reset it', async () => {
    config([project])
    const { makePlan, readPlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    const { boundary } = await import('../src/hooks/boundary.js')
    writePlan(project, makePlan('t', ['one']))
    writeTask('s1', project, {
      level: 1, predicted: true, predictedAt: '2020-01-01T00:00:00.000Z',
    })

    boundary({
      kind: 'prompt', agent: 'claude-code', sessionId: 's1', cwd: project,
      prompt: 'something new',
    } as never)

    expect(readPlan(project)!.steps[0]!.predicted).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gate.test.ts -t "with a plan"`
Expected: FAIL. The gate still reads session state, so the second session sees no
prediction, the next step keeps the old one, and the boundary wipes the step.

- [ ] **Step 3: Write minimal implementation**

In `src/hooks/gate.ts`, replace the `store.js` import with:

```ts
import { readTask, writeTask } from '../core/task-state.js'
```

Replace `let state = readState(event.sessionId)` with:

```ts
    let state = readTask(event.sessionId, event.cwd, event.filePath)
```

Replace the test-written block:

```ts
      if (!state.testWritten) {
        state = { ...state, testWritten: true }
        writeTask(event.sessionId, event.cwd, { testWritten: true }, event.filePath)
      }
```

Replace `touchTask(state)` with the same idea, written as a patch:

```ts
    // Touching keeps this task alive so the boundary measures silence, not age.
    writeTask(
      event.sessionId,
      event.cwd,
      {
        predictedAt: new Date().toISOString(),
        editsSincePrediction: state.editsSincePrediction + 1,
      },
      event.filePath,
    )
```

In `src/hooks/skeleton.ts`, replace the `readState` import and its call:

```ts
import { readTask } from '../core/task-state.js'
```
```ts
    const state = readTask(event.sessionId, event.cwd, event.filePath)
```

In `src/hooks/handover.ts`, replace the import and the three call sites:

```ts
import { readTask, writeTask } from '../core/task-state.js'
```
```ts
    const state = readTask(event.sessionId, event.cwd, event.filePath)
```
```ts
      writeTask(event.sessionId, event.cwd, { handoverBlocked: true }, event.filePath)
```

(the same replacement for both `writeState({ ...state, handoverBlocked: true })` lines).

In `src/hooks/boundary.ts`, read through the accessor and skip the idle check entirely when
a plan is active, because the step is the boundary:

```ts
import { readTask, resetTaskState, writeTask } from '../core/task-state.js'
```
```ts
    const state = readTask(event.sessionId, event.cwd)
    // With a plan, the step says where the task ends. Silence says nothing, so an idle
    // stretch must not throw away a prediction the step is still holding.
    if (state.fromPlan) return { type: 'noop' }

    if (isNewTask(state, config.idleMinutes * 60_000)) {
      clearProposals(event.sessionId)
      resetTaskState(event.sessionId, event.cwd)
      writeTask(event.sessionId, event.cwd, { taskPrompt: event.prompt ?? '' })
    }
    return { type: 'noop' }
```

Drop the now-unused `readState`, `resetTask` and `writeState` imports and the local
`prompt` variable if it becomes unused. Widen `isNewTask` so it accepts a `TaskState`:

```ts
export function isNewTask(
  state: Pick<SessionState, 'predicted' | 'predictedAt'>,
  idleMs: number,
  now = Date.now(),
): boolean {
```

`touchTask` in `src/core/store.ts` now has no callers. Delete it and any test that covers
it directly, rather than leaving a second way to write task state that bypasses the
accessor.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS. Every existing hook test still passes untouched, which is the claim that
this stayed additive.

- [ ] **Step 5: Commit**

```bash
git add src/hooks src/core/store.ts test
git commit -m "Hooks read the task through the accessor

With a plan the active step is the task, so the gate fires once per step
and the prediction survives the session. With no plan every existing test
passes untouched, which is the point of routing through one accessor
rather than branching in four hooks."
```

---

### Task 5: Session commands read through the accessor

**Files:**
- Modify: `src/commands/session.ts`, `src/commands/done.ts`, `src/commands/log.ts`,
  `src/cli.ts`
- Test: `test/session-commands.test.ts`

**Interfaces:**
- Consumes: `readTask`, `writeTask`, `resetTaskState` from Task 3.
- Produces: each session command takes `cwd` as its last parameter:
  - `cmdSuggestLevel(sessionId: string, concepts: string[], cwd?: string): number`
  - `cmdLevel(sessionId: string, level: Level, cwd?: string): number`
  - `cmdPredict(sessionId: string, answers: { q1?: string; q2?: string; q3?: string }, cwd?: string): number`
  - `cmdMarkTrivial(sessionId: string, cwd?: string): number`
  - `cmdRush(sessionId: string, off: boolean, cwd?: string): number`
  - `cmdNext(sessionId: string, cwd?: string): number`
  - `cmdDone(sessionId: string, cwd?: string): number`
  - `cmdLog(args)` gains an optional `cwd?: string` field.
  - `src/cli.ts` gains `cwdOf(flags: Flags): string`.

  Each defaults to `process.cwd()`. The CLI passes `flags.string('cwd') ?? process.cwd()`,
  so `--cwd` exists as an escape hatch for scripts and for an agent running from outside
  the project. In normal use the agent runs the CLI in the project, which is the same
  directory the gate matched on.

- [ ] **Step 1: Write the failing test**

```ts
// test/session-commands.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makePlan, readPlan, writePlan } from '../src/core/plan.js'
import { readState } from '../src/core/store.js'
import { cmdLevel, cmdMarkTrivial, cmdNext, cmdPredict, cmdRush } from '../src/commands/session.js'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  mkdirSync(home, { recursive: true })
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

  it('lets spar next start the step over', () => {
    cmdLevel('s1', 2, project)
    cmdPredict('s1', { q1: 'a' }, project)
    cmdNext('s1', project)
    expect(step()).toMatchObject({ predicted: false, level: undefined })
  })
})

describe('with no plan', () => {
  it('writes session state exactly as before', () => {
    cmdLevel('s1', 2, project)
    cmdPredict('s1', { q1: 'a' }, project)
    expect(readState('s1')).toMatchObject({ level: 2, predicted: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/session-commands.test.ts`
Expected: FAIL. The commands take no `cwd`, so the extra argument is ignored and every
value lands in session state.

- [ ] **Step 3: Write minimal implementation**

In `src/commands/session.ts`, replace the state imports with the accessor, keeping
`readGaps`:

```ts
import { readGaps } from '../core/store.js'
import { readTask, resetTaskState, writeTask } from '../core/task-state.js'
```

The six bodies become:

```ts
/** `spar suggest-level` — ask the gap log how hard this task should be. */
export function cmdSuggestLevel(
  sessionId: string,
  concepts: string[],
  cwd: string = process.cwd(),
): number {
  const state = readTask(sessionId, cwd)
  const suggestion = suggestLevel({
    concepts,
    gaps: readGaps(),
    focused: readFocus(),
    rush: state.rush,
  })
  console.log(
    `level ${suggestion.level} (${LEVEL_NAMES[suggestion.level]}) — ${suggestion.reason}`,
  )
  // Recorded, not committed: the user still gets to override before predicting.
  // With a plan this lands on the active step, which is what gives each step its own
  // level instead of one level averaged over a whole ticket.
  writeTask(sessionId, cwd, { level: suggestion.level })
  appendEvent({ type: 'suggest', session: sessionId, level: suggestion.level, concepts })
  return 0
}

/** `spar level` — the user overrides the suggestion. */
export function cmdLevel(sessionId: string, level: Level, cwd: string = process.cwd()): number {
  const state = readTask(sessionId, cwd)
  // Counted, because a user who constantly corrects the suggestion is telling you the
  // thresholds are wrong — that is a fact about the design, not about them.
  appendEvent({ type: 'override', session: sessionId, from: state.level, to: level })
  writeTask(sessionId, cwd, { level })
  console.log(`level set to ${level} (${LEVEL_NAMES[level]})`)
  return 0
}

/** `spar predict` — record the three answers and open the gate for this task. */
export function cmdPredict(
  sessionId: string,
  answers: { q1?: string; q2?: string; q3?: string },
  cwd: string = process.cwd(),
): number {
  const state = readTask(sessionId, cwd)
  const normalized = {
    q1: normalizeAnswer(answers.q1),
    q2: normalizeAnswer(answers.q2),
    q3: normalizeAnswer(answers.q3),
  }
  writeTask(sessionId, cwd, {
    predicted: true,
    predictedAt: new Date().toISOString(),
    editsSincePrediction: 0,
    task: state.task ?? state.taskPrompt,
  })
  const blanks = Object.values(normalized).filter((a) => a === NO_IDEA).length
  appendEvent({
    type: 'predict',
    session: sessionId,
    level: state.level ?? 1,
    blanks,
    concepts: [],
  })
  console.log(
    blanks === 3
      ? 'prediction recorded (all three blank — that is data, not failure)'
      : `prediction recorded${blanks ? ` (${blanks} blank)` : ''}`,
  )
  return 0
}

/** `spar mark --trivial` — the agent judged this change not worth gating. */
export function cmdMarkTrivial(sessionId: string, cwd: string = process.cwd()): number {
  const state = readTask(sessionId, cwd)
  appendEvent({ type: 'trivial', session: sessionId })
  writeTask(sessionId, cwd, { trivial: true, level: state.level ?? 0 })
  console.log('marked trivial for this task')
  return 0
}

/** `spar rush` — degrade to level 0 for the rest of the session. Never off, only down. */
export function cmdRush(sessionId: string, off: boolean, cwd: string = process.cwd()): number {
  appendEvent({ type: 'rush', session: sessionId, on: !off })
  writeTask(sessionId, cwd, { rush: !off })
  console.log(off ? 'rush mode off' : 'rush mode on for this session')
  return 0
}

/** `spar next` — say out loud that this is new work, without waiting for the idle timer. */
export function cmdNext(sessionId: string, cwd: string = process.cwd()): number {
  clearProposals(sessionId)
  resetTaskState(sessionId, cwd)
  console.log('new task — the gate will ask again on the next write')
  return 0
}
```

In `src/commands/done.ts`, change the signature to
`cmdDone(sessionId: string, cwd: string = process.cwd())` and replace
`readState(sessionId)` with `readTask(sessionId, cwd)`, swapping the import.

In `src/commands/log.ts`, add an optional `cwd?: string` to the args object and replace
`readState(args.sessionId)` with `readTask(args.sessionId, args.cwd ?? process.cwd())`,
swapping `readState` out of the `store.js` import.

In `src/cli.ts`, thread the flag through every session command:

```ts
    case 'suggest-level':
      return cmdSuggestLevel(requireSession(flags), flags.all('concept'), cwdOf(flags))
    case 'level':
      return cmdLevel(requireSession(flags), parseLevel(flags.positional[0]), cwdOf(flags))
    case 'predict':
      return cmdPredict(
        requireSession(flags),
        { q1: flags.string('q1'), q2: flags.string('q2'), q3: flags.string('q3') },
        cwdOf(flags),
      )
    case 'done':
      return cmdDone(requireSession(flags), cwdOf(flags))
    case 'next':
      return cmdNext(requireSession(flags), cwdOf(flags))
    case 'mark':
      return cmdMarkTrivial(requireSession(flags), cwdOf(flags))
    case 'rush':
      return cmdRush(requireSession(flags), flags.bool('off'), cwdOf(flags))
```

and add `cwd: cwdOf(flags),` to the object passed to `cmdLog`. Add the helper beside
`requireSession`:

```ts
/**
 * Which project this command is about.
 *
 * Normally the directory the agent is running in, which is the same one the gate matched
 * on. `--cwd` exists for scripts and for the rare agent that runs the CLI from somewhere
 * else, so a plan is never invisible just because the shell started a level up.
 */
function cwdOf(flags: Flags): string {
  return flags.string('cwd') ?? process.cwd()
}
```

Add a line to `HELP` under the session commands:

```
  (any session command also takes --cwd <path> when it is not run inside the project)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands src/cli.ts test/session-commands.test.ts
git commit -m "Session commands write the task through the accessor

Without this the gate reads the active step while spar predict writes the
session, and the gate denies forever. The two halves have to meet."
```

---

### Task 6: `spar plan`

**Files:**
- Create: `src/commands/plan.ts`
- Modify: `src/cli.ts`
- Test: `test/plan-command.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2; `loadConfig`, `trackedProject` from
  `src/core/config.js`; `cwdOf` from Task 5.
- Produces: `PlanArgs` and `cmdPlan(args: PlanArgs): number`, where
  `PlanArgs = { title?: string; steps: string[]; from?: string; clear: boolean; replace: boolean; cwd?: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/plan-command.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
  said = []
  vi.spyOn(console, 'log').mockImplementation((s?: unknown) => { said.push(String(s)) })
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => { said.push(String(s)); return true })
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const make = (over: Partial<PlanArgs> = {}) =>
  cmdPlan({
    title: 'PROJ-1', steps: ['one', 'two'], clear: false, replace: false, cwd: project, ...over,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/plan-command.test.ts`
Expected: FAIL, cannot resolve `../src/commands/plan.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/commands/plan.ts
import { readFileSync } from 'node:fs'
import { loadConfig, trackedProject } from '../core/config.js'
import {
  activeStep, clearPlan, isComplete, makePlan, parseSteps, readPlan, writePlan,
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
      markdown = readFileSync(args.from, 'utf8')
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
```

In `src/cli.ts`, add the import and the case:

```ts
import { cmdPlan } from './commands/plan.js'
```

```ts
    case 'plan':
      return cmdPlan({
        title: flags.string('title'),
        steps: flags.all('step'),
        from: flags.string('from'),
        clear: flags.bool('clear'),
        replace: flags.bool('replace'),
        cwd: cwdOf(flags),
      })
```

Add to `HELP`, after the `spar setup` line:

```
  spar plan [--title <t>] [--step <s> ...] [--from <plan.md>] [--replace] [--clear]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/plan.ts src/cli.ts test/plan-command.test.ts
git commit -m "spar plan: create from steps or from a markdown plan, show, clear"
```

---

### Task 7: `spar step done`

**Files:**
- Create: `src/commands/step.ts`
- Modify: `src/cli.ts`
- Test: `test/step-command.test.ts`

**Interfaces:**
- Consumes: `advance`, `isComplete`, `readPlan`, `writePlan` from Task 1; `readTask` from
  Task 3; `GUIDE` from `src/core/guide.js`; `cwdOf` from Task 5.
- Produces: `cmdStepDone(opts: { sessionId?: string; cwd?: string }): number`.

The session id only matters for `rush`, the one field still read from the session. It
defaults to `'step-done'`, so a user who runs the command by hand gets the strict bar
rather than someone else's rush flag.

- [ ] **Step 1: Write the failing test**

```ts
// test/step-command.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  mkdirSync(home, { recursive: true })
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
  said = []
  vi.spyOn(console, 'log').mockImplementation((s?: unknown) => { said.push(String(s)) })
  vi.spyOn(process.stderr, 'write').mockImplementation((s) => { said.push(String(s)); return true })
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/step-command.test.ts`
Expected: FAIL, cannot resolve `../src/commands/step.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/commands/step.ts
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
```

In `src/cli.ts`, add the import and the case:

```ts
import { cmdStepDone } from './commands/step.js'
```

```ts
    case 'step':
      if (argv[1] !== 'done') {
        process.stderr.write('spar: the only step command is "spar step done"\n')
        return 1
      }
      return cmdStepDone({ sessionId: flags.string('session'), cwd: cwdOf(flags) })
```

Add to `HELP`, under the `spar plan` line:

```
  spar step done [--session <id>]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/step.ts src/cli.ts test/step-command.test.ts
git commit -m "spar step done, held to the same bar as the handover"
```

---

### Task 8: Ignore `.spar/`, prove it end to end, and say all this out loud

**Files:**
- Modify: `src/commands/setup.ts`, `scripts/validate-example.sh`, `skills/spar/SKILL.md`,
  `README.md`
- Test: `test/setup.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `spar setup --project <path>` writes `.spar/` into that project's `.gitignore`.

- [ ] **Step 1: Write the failing test**

```ts
// test/setup.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdSetup } from '../src/commands/setup.js'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const ignore = () => readFileSync(join(project, '.gitignore'), 'utf8')

describe('setup and .gitignore', () => {
  it('adds .spar/ so a plan never lands in someone else pull request', () => {
    cmdSetup({ project })
    expect(ignore()).toMatch(/^\.spar\/$/m)
  })

  it('creates the file when the project has none', () => {
    expect(existsSync(join(project, '.gitignore'))).toBe(false)
    cmdSetup({ project })
    expect(existsSync(join(project, '.gitignore'))).toBe(true)
  })

  it('keeps what was already there', () => {
    writeFileSync(join(project, '.gitignore'), 'node_modules/\ndist/\n')
    cmdSetup({ project })
    expect(ignore()).toContain('node_modules/')
    expect(ignore()).toContain('dist/')
  })

  it('does not add it twice', () => {
    cmdSetup({ project })
    cmdSetup({ project })
    expect(ignore().match(/^\.spar\/$/gm)).toHaveLength(1)
  })

  it('leaves an existing entry alone whatever form it takes', () => {
    writeFileSync(join(project, '.gitignore'), '.spar\n')
    cmdSetup({ project })
    expect(ignore().match(/\.spar/g)).toHaveLength(1)
  })

  it('does not fail setup when the gitignore cannot be written', () => {
    expect(cmdSetup({ project: join(project, 'does', 'not', 'exist') })).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/setup.test.ts`
Expected: FAIL, no `.gitignore` is written.

- [ ] **Step 3: Write minimal implementation**

In `src/commands/setup.ts`, extend the imports and add the helper:

```ts
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
```

```ts
/**
 * Keep `.spar/` out of the project's history.
 *
 * The plan belongs to the project but not to its pull requests: it changes constantly
 * and it is one person's working state. A team that wants to share it can delete this
 * line. Never fatal, because failing to write someone else's .gitignore must not be the
 * reason setup fails.
 */
function ignoreSparDir(root: string): void {
  try {
    const file = join(root, '.gitignore')
    const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
    if (/^\.spar\/?$/m.test(existing)) return
    const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : ''
    appendFileSync(file, `${prefix}.spar/\n`, 'utf8')
  } catch {
    // Not worth failing setup over.
  }
}
```

Call it inside the `if (opts.project)` branch, right after `const path = resolve(opts.project)`:

```ts
    ignoreSparDir(path)
```

Add to `scripts/validate-example.sh`, immediately before `section "the views"`:

```bash
section "working through a plan"
SPAR_ABS="$PWD/dist/cli.js"
in_project() { ( cd "$PROJECT" && node "$SPAR_ABS" "$@" ); }
check ".spar/ was gitignored by setup"           1     "$(grep -c '^\.spar/$' "$PROJECT/.gitignore")"
in_project plan --title "PROJ-1" --step one --step two >/dev/null
check "a plan can be created"                    0     $?
in_project plan --step three >/dev/null 2>&1
check "an unfinished plan is not replaced"       1     $?
check "the gate fires on the active step"        deny  "$(gate "$PROJECT" "$FILE" p1)"
$CLI level --session p1 --cwd "$PROJECT" 2 >/dev/null
$CLI predict --session p1 --cwd "$PROJECT" --q1 a --q2 b --q3 c >/dev/null
check "predicting opens the active step"         allow "$(gate "$PROJECT" "$FILE" p1)"
check "and the step holds in a new session"      allow "$(gate "$PROJECT" "$FILE" p2)"
in_project step done --session p1 >/dev/null 2>&1
check "a level 2 step needs a test to finish"    1     $?
gate "$PROJECT" "$PROJECT/test/orders.test.ts" p1 >/dev/null
in_project step done --session p1 >/dev/null
check "and finishes once a test exists"          0     $?
check "the next step re-arms the gate"           deny  "$(gate "$PROJECT" "$FILE" p1)"
in_project plan --clear >/dev/null
check "clearing returns to the idle boundary"    0     $?
```

Add to `skills/spar/SKILL.md`, before `## Honesty rules`:

````markdown
## Working through a plan

When a ticket is broken into steps, record them so each one is gated on its own:

```
spar plan --title "<ticket>" --step "..." --step "..."
spar plan --from <the plan file you already wrote>
```

While a plan is active the step is the task, so the questions come once per step rather
than once per stretch of silence, and each step gets its own level from the gap log. The
step that touches something the user has open gaps on will ask more of them than the one
that adds a field.

Finish a step with `spar step done`. At level 2 or 3 it refuses while no test exists, for
the same reason the handover does.

One prediction per step is the point. A whole ticket is too big to answer the third
question about: "where will this go wrong" is answerable for "add the cancel endpoint" and
is a guess for "implement cancellation with refunds and audit logging".

Run the spar commands from inside the project. That is where the plan lives, and it is the
directory the gate matched on. If you must run them from elsewhere, pass `--cwd <project>`.
````

Add to `README.md`, after the levels section and before "What each agent gets":

````markdown
## Working a ticket in steps

```sh
spar plan --from docs/plan.md          # or --step "..." --step "..."
spar plan                              # where am I
spar step done
```

While a plan is active the step is the task. The gate fires once per step instead of
guessing from silence, each step gets its own level from your gap log, and your prediction
is attached to the step rather than the session, so it is still there tomorrow.

That granularity is the point. "Where will this go wrong?" is a real question about "add
the cancel endpoint" and a guess about "implement cancellation with refunds", and a guess
makes the calibration number stop measuring anything.

spar does not plan. Your agent reads the ticket and your planner breaks it up; spar decides
how much of each step is yours. The plan lives in `.spar/` in the project, and `spar setup`
gitignores it.
````

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run && npx tsc -p tsconfig.json && npm run build && npm run validate:example && npx -y skills-ref@latest validate ./skills/spar
```
Expected: PASS on all five. The validation script's total rises by 11.

- [ ] **Step 5: Commit**

```bash
git add src/commands/setup.ts test/setup.test.ts scripts/validate-example.sh skills/spar/SKILL.md README.md
git commit -m "Gitignore .spar/, prove the plan loop end to end, document it"
```

---

## Verification after Task 8

By hand, because the tests prove the parts and this proves the workflow:

```sh
npm run build && npm link
cd example
spar setup --project "$(pwd)" --stack TypeScript
spar plan --title "PROJ-1 cancel an order" \
  --step "Add a cancelled status" \
  --step "Refund before the write, roll back on failure" \
  --step "Refuse cancelling a shipped order"
spar plan
```

Then ask the agent for the first step and check three things the tests cannot:

1. The gate fires once and the agent names step one, not the whole ticket.
2. `spar plan` shows a level on the active step after `suggest-level` has run, and a
   different level on a later step that touches a concept with no open gaps.
3. Closing the terminal and reopening it leaves the prediction in place, and the gate does
   not ask again for the same step.
