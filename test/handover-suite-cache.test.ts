import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handover } from '../src/hooks/handover.js'
import { writeTask } from '../src/core/task-state.js'

let home: string
let project: string
let counter: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-home-'))
  project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
  process.env.SPAR_HOME = home
  counter = join(project, 'runs.txt')
  // A "suite" that fails (red, which is what level 2 wants) and counts its own runs.
  const script = join(project, 'suite.sh')
  writeFileSync(script, `#!/bin/sh\necho x >> ${counter}\nexit 1\n`)
  chmodSync(script, 0o755)
  writeFileSync(
    join(home, 'config.json'),
    JSON.stringify({ projects: [{ path: project, testCommand: `sh ${script}` }] }),
  )
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  rmSync(project, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const runs = () => {
  try {
    return require('node:fs').readFileSync(counter, 'utf8').trim().split('\n').length
  } catch {
    return 0
  }
}

const stop = () =>
  handover({ kind: 'stop', agent: 'claude-code', sessionId: 's1', cwd: project } as never)

describe('the handover does not re-run the suite for nothing', () => {
  beforeEach(() => {
    writeTask('s1', project, { level: 2, predicted: true, testWritten: true, editsSincePrediction: 3 })
  })

  it('runs it once and lets the handover through', () => {
    expect(stop().type).toBe('noop')
    expect(runs()).toBe(1)
  })

  it('does not run it again while nothing has been edited', () => {
    stop()
    stop()
    stop()
    expect(runs()).toBe(1)
  })

  it('runs it again once there has been another edit', () => {
    stop()
    writeTask('s1', project, { editsSincePrediction: 4 })
    stop()
    expect(runs()).toBe(2)
  })
})
