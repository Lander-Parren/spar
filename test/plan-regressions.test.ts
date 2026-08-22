import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { makePlan, readPlan, writePlan } from '../src/core/plan.js'
import { readTask, writeTask } from '../src/core/task-state.js'
import { gate } from '../src/hooks/gate.js'
import { cmdMarkTrivial, cmdPredict, cmdRush } from '../src/commands/session.js'
import { cmdStepDone } from '../src/commands/step.js'
import { cmdLog } from '../src/commands/log.js'
import { readGaps } from '../src/core/store.js'

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

function ev(e: Record<string, unknown> = {}) {
  return gate({
    kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: project,
    toolName: 'Write', filePath: join(project, 'src', 'a.ts'), ...e,
  } as never)
}

/**
 * The session and the active step are two stores for the same fields. Switching between
 * them must never expose what the other was holding, or the gate silently stops gating.
 */
describe('finishing a plan does not resurrect what the session was holding', () => {
  it('a prediction made before the plan does not reopen the gate after it', () => {
    writeTask('s1', project, { level: 1, predicted: true })
    expect(ev().type).toBe('allow')

    writePlan(project, makePlan('ticket', ['one']))
    expect(ev().type).toBe('deny')

    writeTask('s1', project, { level: 1, predicted: true })
    expect(ev().type).toBe('allow')
    expect(cmdStepDone({ sessionId: 's1', cwd: project })).toBe(0)

    expect(readTask('s1', project).fromPlan).toBe(false)
    expect(ev().type).toBe('deny')
  })

  it('a trivial mark made before the plan does not turn the gate off after it', () => {
    writeTask('s1', project, { trivial: true, level: 0 })
    writePlan(project, makePlan('ticket', ['one']))
    writeTask('s1', project, { level: 1, predicted: true })
    cmdStepDone({ sessionId: 's1', cwd: project })

    expect(readTask('s1', project).trivial).toBe(false)
    expect(ev().type).toBe('deny')
  })
})

/**
 * The gate matches by working directory OR by target file. The commands it names only see
 * the working directory, so from a parent directory they would write where the gate is not
 * reading: a deny with no way out.
 */
describe('an agent running one directory up can still get out of the gate', () => {
  const parent = () => dirname(project)

  it('names the project in its instructions when the cwd is not the project', () => {
    writePlan(project, makePlan('ticket', ['one']))
    const decision = ev({ cwd: parent() })
    expect(decision.type).toBe('deny')
    expect(decision.agentMessage).toContain(`--cwd ${project}`)
  })

  it('does not add the flag when the cwd is already the project', () => {
    writePlan(project, makePlan('ticket', ['one']))
    expect(ev().agentMessage).not.toContain('--cwd')
  })

  it('following those instructions actually opens the gate', () => {
    writePlan(project, makePlan('ticket', ['one']))
    expect(ev({ cwd: parent() }).type).toBe('deny')

    // Exactly what the deny message tells the agent to run.
    writeTask('s1', project, { level: 1 })
    cmdPredict('s1', { q1: 'a', q2: 'b', q3: 'c' }, project)

    expect(ev({ cwd: parent() }).type).toBe('allow')
  })

  it('and marking it trivial is an escape too', () => {
    writePlan(project, makePlan('ticket', ['one']))
    cmdMarkTrivial('s1', project)
    expect(ev({ cwd: parent() }).type).toBe('allow')
  })
})

describe('rush stays an escape hatch with a plan active', () => {
  it('lets a level 2 step be finished without a test', () => {
    writePlan(project, makePlan('ticket', ['one', 'two']))
    cmdRush('s1', false, project)
    writeTask('s1', project, { level: 2, predicted: true })

    expect(cmdStepDone({ sessionId: 's1', cwd: project })).toBe(0)
  })

  it('still refuses without rush, so the bar is real', () => {
    writePlan(project, makePlan('ticket', ['one', 'two']))
    writeTask('s1', project, { level: 2, predicted: true })

    expect(cmdStepDone({ sessionId: 's1', cwd: project })).toBe(1)
  })
})

describe('a gap logged during a plan knows which step produced it', () => {
  it('labels the gap with the step title', () => {
    writePlan(project, makePlan('ticket', ['add the cancel endpoint']))
    writeTask('s1', project, { level: 1 })
    cmdPredict('s1', { q1: 'a', q2: 'b', q3: 'c' }, project)
    cmdLog({ sessionId: 's1', concept: 'c', yourModel: 'm', reality: 'r', cwd: project })

    expect(readGaps()[0]!.task).toBe('add the cancel endpoint')
  })
})
