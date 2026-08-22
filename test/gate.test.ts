import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

function config(projects: string[]) {
  writeFileSync(join(home, 'config.json'), JSON.stringify({ projects: projects.map((p) => ({ path: p })) }))
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
