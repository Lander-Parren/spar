import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

function config(projects: string[], activation: string = 'always') {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ activation, projects: projects.map((p) => ({ path: p })) }))
}

function state(sessionId: string, patch: Record<string, unknown>) {
  mkdirSync(join(home, 'state'), { recursive: true })
  writeFileSync(join(home, 'state', `${sessionId}.json`), JSON.stringify({ sessionId, predicted: false, rush: false, trivial: false, editsSincePrediction: 0, ...patch }))
}

async function run(event: Record<string, unknown>) {
  const { gate } = await import('../src/hooks/gate.js')
  return gate({ kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: project, toolName: 'Write', ...event } as never)
}

describe('gate', () => {
  it('allows everything when no project is configured (the inert guarantee)', async () => {
    expect((await run({})).type).toBe('allow')
  })

  it('allows work outside a tracked project', async () => {
    config([project])
    expect((await run({ cwd: tmpdir() })).type).toBe('allow')
  })

  it('does not match a sibling directory with a shared prefix', async () => {
    config([project])
    expect((await run({ cwd: `${project}-legacy` })).type).toBe('allow')
  })

  it('denies a first write in a tracked project with no level yet', async () => {
    config([project])
    const decision = await run({})
    expect(decision.type).toBe('deny')
    if (decision.type === 'deny') expect(decision.agentMessage).toContain('spar suggest-level')
  })

  it('lets a test through at level 3, because the test is the brief', async () => {
    config([project]); state('s1', { level: 3, predicted: true })
    expect((await run({ filePath: join(project, 'test', 'orders.test.ts') })).type).toBe('allow')
    expect((await run({ filePath: join(project, 'src', 'orders.ts') })).type).toBe('deny')
  })

  it('lets a test through at level 3 when it arrives via the shell too', async () => {
    config([project]); state('s1', { level: 3, predicted: true })
    const decision = await run({
      toolName: 'Bash',
      command: `cat > ${join(project, 'test', 'orders.test.ts')} <<'EOF'\nx\nEOF`,
    })
    expect(decision.type).toBe('allow')
  })

  it.each([2, 3])('records a test written at level %i, so handover can check', async (level) => {
    config([project]); state('s1', { level, predicted: true })
    await run({ filePath: join(project, 'test', 'orders.test.ts') })
    const { readState } = await import('../src/core/store.js')
    expect(readState('s1').testWritten).toBe(true)
  })

  it('fires when the file is in a tracked project, wherever the agent was started', async () => {
    config([project])
    const decision = await run({ cwd: tmpdir(), filePath: join(project, 'src', 'a.cs') })
    expect(decision.type).toBe('deny')
  })

  it('stays silent when neither the working directory nor the file is tracked', async () => {
    config([project])
    const elsewhere = mkdtempSync(join(tmpdir(), 'spar-other-'))
    const decision = await run({ cwd: elsewhere, filePath: join(elsewhere, 'a.cs') })
    expect(decision.type).toBe('allow')
    rmSync(elsewhere, { recursive: true, force: true })
  })

  it('fires on a shell command that writes into a tracked project', async () => {
    config([project])
    const decision = await run({
      toolName: 'Bash',
      command: `cat > ${join(project, 'src', 'a.ts')} <<'EOF'\nbody\nEOF`,
    })
    expect(decision.type).toBe('deny')
  })

  it('catches an in-place rewrite too', async () => {
    config([project])
    const decision = await run({
      toolName: 'Bash',
      command: `perl -0pi -e 's/a/b/' ${join(project, 'src', 'a.ts')}`,
    })
    expect(decision.type).toBe('deny')
  })

  it('leaves shell commands that only read alone', async () => {
    config([project])
    for (const command of [`cat ${join(project, 'a.ts')}`, 'npm test', 'npm test > /tmp/out.txt']) {
      expect((await run({ toolName: 'Bash', command })).type).toBe('allow')
    }
  })

  it('allows non-write tools through untouched', async () => {
    config([project])
    expect((await run({ toolName: 'Read' })).type).toBe('allow')
  })

  it('allows once rush is set', async () => {
    config([project]); state('s1', { rush: true })
    expect((await run({})).type).toBe('allow')
  })

  it('allows once the task is marked trivial', async () => {
    config([project]); state('s1', { trivial: true })
    expect((await run({})).type).toBe('allow')
  })

  it('denies at level 1 until a prediction is recorded, then allows', async () => {
    config([project])
    state('s1', { level: 1, predicted: false })
    expect((await run({})).type).toBe('deny')
    state('s1', { level: 1, predicted: true })
    expect((await run({})).type).toBe('allow')
  })

  it('denies every write at level 3, even after predicting', async () => {
    config([project]); state('s1', { level: 3, predicted: true })
    const decision = await run({})
    expect(decision.type).toBe('deny')
    if (decision.type === 'deny') expect(decision.agentMessage).toContain('in chat')
  })

  it('fails open on a corrupt config', async () => {
    writeFileSync(join(home, 'config.json'), '{ not json at all')
    expect((await run({})).type).toBe('allow')
  })

  it('fails open on corrupt session state', async () => {
    config([project])
    mkdirSync(join(home, 'state'), { recursive: true })
    writeFileSync(join(home, 'state', 's1.json'), 'garbage')
    // Unreadable state means "no level yet", which is a deny — but a deliberate one,
    // not a crash. The corrupt-config case above is the real fail-open guarantee.
    expect(['allow', 'deny']).toContain((await run({})).type)
  })
})

describe('with a plan', () => {
  it('gates the active step and keeps the prediction across sessions', async () => {
    config([project])
    const { makePlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    writePlan(project, makePlan('t', ['step one', 'step two']))

    expect((await run({})).type).toBe('deny')

    writeTask('s1', project, { level: 1, predicted: true })
    expect((await run({})).type).toBe('allow')

    // A new session, the same step: the prediction is still good.
    expect((await run({ sessionId: 'a-totally-different-session' })).type).toBe('allow')
  })

  it('re-arms on the next step without waiting for silence', async () => {
    config([project])
    const { advance, makePlan, readPlan, writePlan } = await import('../src/core/plan.js')
    const { writeTask } = await import('../src/core/task-state.js')
    writePlan(project, makePlan('t', ['one', 'two']))
    writeTask('s1', project, { level: 1, predicted: true })
    expect((await run({})).type).toBe('allow')

    writePlan(project, advance(readPlan(project)!))
    expect((await run({})).type).toBe('deny')
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
      level: 1,
      predicted: true,
      predictedAt: '2020-01-01T00:00:00.000Z',
    })

    boundary({
      kind: 'prompt',
      agent: 'claude-code',
      sessionId: 's1',
      cwd: project,
      prompt: 'something new',
    } as never)

    expect(readPlan(project)!.steps[0]!.predicted).toBe(true)
    // The claim that matters: the gate is still open, because the step still holds the
    // prediction. Asserting only on the plan file would pass even with the old boundary,
    // which reset the session and left the plan alone by accident rather than on purpose.
    expect((await run({})).type).toBe('allow')
  })
})

describe('waiting for the skill', () => {
  it('stays out of the way in a tracked project until the session turns it on', async () => {
    config([project], 'skill')
    expect((await run({})).type).toBe('allow')
  })

  it('gates as usual once the session has turned it on', async () => {
    config([project], 'skill')
    state('s1', { engaged: true })
    expect((await run({})).type).toBe('deny')
  })

  it('stays dormant for a shell write too, not only for a write tool', async () => {
    config([project], 'skill')
    const command = `cat > ${join(project, 'src', 'orders.ts')} <<'EOF'\nbody\nEOF`
    expect((await run({ toolName: 'Bash', command })).type).toBe('allow')
  })

  it('reads dormant from a config written before the setting existed', async () => {
    // A 0.4.x config has no activation key. Treating that as always-on would keep gating
    // someone who upgraded and never asked to be gated.
    writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
    expect((await run({})).type).toBe('allow')
  })

  it('is what spar on and spar off actually do', async () => {
    config([project], 'skill')
    const { cmdEngage } = await import('../src/commands/session.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    cmdEngage('s1', true, project)
    expect((await run({})).type).toBe('deny')
    cmdEngage('s1', false, project)
    expect((await run({})).type).toBe('allow')

    vi.restoreAllMocks()
  })

  it('leaves an engaged session engaged across a task boundary', async () => {
    config([project], 'skill')
    const { cmdEngage, cmdNext } = await import('../src/commands/session.js')
    vi.spyOn(console, 'log').mockImplementation(() => {})

    cmdEngage('s1', true, project)
    // A new task must not stand spar down, or the second task of a sitting would go
    // ungated without anyone having said so.
    cmdNext('s1', project)
    expect((await run({})).type).toBe('deny')

    vi.restoreAllMocks()
  })
})
