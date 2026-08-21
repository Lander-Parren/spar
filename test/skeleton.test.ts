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
  writeFileSync(
    join(home, 'state', 's1.json'),
    JSON.stringify({ sessionId: 's1', predicted: true, rush: false, trivial: false, editsSincePrediction: 0, ...patch }),
  )
}

function writeFile(name: string, content: string): string {
  const path = join(project, name)
  writeFileSync(path, content)
  return path
}

async function run(filePath: string) {
  const { skeleton } = await import('../src/hooks/skeleton.js')
  return skeleton({ kind: 'post-tool', agent: 'claude-code', sessionId: 's1', cwd: project, toolName: 'Write', filePath } as never)
}

describe('skeleton check', () => {
  it('stays silent at levels other than 2', async () => {
    state({ level: 1 })
    expect((await run(writeFile('a.cs', 'done()'))).type).toBe('noop')
  })

  it('complains when a level 2 write left nothing for the user', async () => {
    state({ level: 2 })
    const decision = await run(writeFile('a.cs', 'var x = OpenTransaction();'))
    expect(decision.type).toBe('feedback')
    if (decision.type === 'feedback') expect(decision.message).toContain('TODO(spar:')
  })

  it('accepts a write that leaves a marker', async () => {
    state({ level: 2 })
    expect((await run(writeFile('a.cs', '// TODO(spar: pick the transaction boundary)'))).type).toBe('noop')
  })

  it('finds the marker regardless of comment syntax', async () => {
    state({ level: 2 })
    for (const [name, body] of [
      ['a.py', '# TODO(spar: choose the session scope)'],
      ['a.sql', '-- TODO(spar: decide the isolation level)'],
      ['a.css', '/* TODO(spar: pick the breakpoint) */'],
      ['a.erl', '% TODO(spar: supervision strategy)'],
    ]) {
      rmSync(join(home, 'state', 's1-proposals.json'), { force: true })
      expect((await run(writeFile(name!, body!))).type).toBe('noop')
    }
  })

  it('judges the task, not the file: a marker anywhere clears later writes', async () => {
    state({ level: 2 })
    expect((await run(writeFile('service.cs', '// TODO(spar: the real decision)'))).type).toBe('noop')
    // A test file with no decision in it must not trigger a complaint.
    expect((await run(writeFile('service.tests.cs', 'Assert.True(true);'))).type).toBe('noop')
  })

  it('stays silent in rush mode and on trivial tasks', async () => {
    state({ level: 2, rush: true })
    expect((await run(writeFile('a.cs', 'x'))).type).toBe('noop')
    state({ level: 2, trivial: true })
    expect((await run(writeFile('b.cs', 'x'))).type).toBe('noop')
  })

  it('stays silent outside a tracked project', async () => {
    state({ level: 2 })
    const outside = mkdtempSync(join(tmpdir(), 'spar-other-'))
    const { skeleton } = await import('../src/hooks/skeleton.js')
    const decision = skeleton({ kind: 'post-tool', agent: 'claude-code', sessionId: 's1', cwd: outside, toolName: 'Write', filePath: join(outside, 'a.cs') } as never)
    expect(decision.type).toBe('noop')
    rmSync(outside, { recursive: true, force: true })
  })

  it('records the skeleton so the closing review has something to diff', async () => {
    state({ level: 2 })
    await run(writeFile('a.cs', '// TODO(spar: decide)'))
    const { readProposals } = await import('../src/core/proposals.js')
    const proposals = readProposals('s1')
    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.source).toBe('skeleton')
  })
})
