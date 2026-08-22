import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
let project: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: [{ path: project }] }))
  mkdirSync(join(home, 'state'), { recursive: true })
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

function state(patch: Record<string, unknown>) {
  writeFileSync(join(home, 'state', 's1.json'), JSON.stringify({
    sessionId: 's1', predicted: true, rush: false, trivial: false,
    editsSincePrediction: 2, testWritten: false, ...patch,
  }))
}

async function run() {
  const { handover } = await import('../src/hooks/handover.js')
  return handover({ kind: 'stop', agent: 'claude-code', sessionId: 's1', cwd: project } as never)
}

describe('handover', () => {
  it('blocks a level 2 handover that left no test behind', async () => {
    state({ level: 2 })
    const decision = await run()
    expect(decision.type).toBe('block')
    if (decision.type === 'block') expect(decision.reason).toMatch(/test/i)
  })

  it('blocks at level 3 for the same reason', async () => {
    state({ level: 3 })
    expect((await run()).type).toBe('block')
  })

  it('lets it through once a test was written', async () => {
    state({ level: 2, testWritten: true })
    expect((await run()).type).toBe('noop')
  })

  it('says nothing at levels that do not hand work over', async () => {
    for (const level of [0, 1]) {
      state({ level })
      expect((await run()).type).toBe('noop')
    }
  })

  it('says nothing when the agent wrote nothing this task', async () => {
    state({ level: 2, editsSincePrediction: 0 })
    expect((await run()).type).toBe('noop')
  })

  it('stays out of rush mode and trivial tasks', async () => {
    state({ level: 2, rush: true })
    expect((await run()).type).toBe('noop')
    state({ level: 2, trivial: true })
    expect((await run()).type).toBe('noop')
  })

  it('stays out of untracked projects', async () => {
    state({ level: 2 })
    const { handover } = await import('../src/hooks/handover.js')
    const decision = handover({ kind: 'stop', agent: 'claude-code', sessionId: 's1', cwd: tmpdir() } as never)
    expect(decision.type).toBe('noop')
  })

  it('with a testCommand, refuses a test that already passes against the stub', async () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({
      projects: [{ path: project, testCommand: 'exit 0' }],
    }))
    state({ level: 2, testWritten: true })
    const decision = await run()
    expect(decision.type).toBe('block')
    if (decision.type === 'block') expect(decision.reason).toMatch(/passes/i)
  })

  it('with a testCommand, a red suite is exactly what it wants', async () => {
    writeFileSync(join(home, 'config.json'), JSON.stringify({
      projects: [{ path: project, testCommand: 'exit 1' }],
    }))
    state({ level: 2, testWritten: true })
    expect((await run()).type).toBe('noop')
  })

  it('never blocks twice for the same task, so it cannot trap the agent', async () => {
    state({ level: 2 })
    expect((await run()).type).toBe('block')
    expect((await run()).type).toBe('noop')
  })
})
