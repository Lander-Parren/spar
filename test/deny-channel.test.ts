import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { claudeCode } from '../src/adapters/claude-code.js'
import { cursor } from '../src/adapters/cursor.js'
import { gate } from '../src/hooks/gate.js'
import type { NormalizedDecision } from '../src/adapters/types.js'

const DENY: NormalizedDecision = {
  type: 'deny',
  agentMessage: 'spar: run spar predict --session s1 to open this',
  userMessage: 'spar: predict before you look.',
}

/**
 * A denial has two audiences and they need different things. The agent needs the command
 * that unblocks it; the person needs one line telling them why their editor paused. Put
 * the agent's copy in the person's channel and the gate becomes a wall with no door.
 */
describe('a denial reaches the agent, not just the user', () => {
  it('claude-code puts the instructions in permissionDecisionReason', () => {
    const body = JSON.parse(claudeCode.render(DENY, 'pre-tool').stdout)
    expect(body.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(body.hookSpecificOutput.permissionDecisionReason).toBe(DENY.agentMessage)
  })

  it('claude-code puts the human line in systemMessage', () => {
    const body = JSON.parse(claudeCode.render(DENY, 'pre-tool').stdout)
    expect(body.systemMessage).toBe(DENY.userMessage)
  })

  it('cursor keeps the same two channels, so the adapters cannot drift', () => {
    const body = JSON.parse(cursor.render(DENY, 'pre-tool').stdout)
    expect(body.agent_message).toBe(DENY.agentMessage)
    expect(body.user_message).toBe(DENY.userMessage)
  })

  it('never leaves the agent with an empty reason', () => {
    for (const adapter of [claudeCode, cursor]) {
      const body = JSON.parse(adapter.render(DENY, 'pre-tool').stdout)
      const reason = body.hookSpecificOutput?.permissionDecisionReason ?? body.agent_message
      expect(reason).toBeTruthy()
      expect(reason).toContain('spar predict')
    }
  })
})

/**
 * The gate matches by working directory OR by the file being written. For a shell command
 * the file is inside the command string, so re-deriving the project from the working
 * directory alone let every `cat > file` from a parent directory through ungated.
 */
describe('a shell write is gated by the file it writes', () => {
  let home: string
  let project: string
  let outside: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'spar-home-'))
    project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
    outside = mkdtempSync(join(tmpdir(), 'spar-out-'))
    process.env.SPAR_HOME = home
    writeFileSync(join(home, 'config.json'), JSON.stringify({ activation: 'always', projects: [{ path: project }] }))
  })
  afterEach(() => {
    for (const d of [home, project, outside]) rmSync(d, { recursive: true, force: true })
    delete process.env.SPAR_HOME
  })

  const shell = (cwd: string, command: string) =>
    gate({
      kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd, toolName: 'Bash', command,
    } as never)

  it('fires on a heredoc into the project from an untracked directory', () => {
    expect(shell(outside, `cat > ${project}/src/a.ts <<EOF\nx\nEOF`).type).toBe('deny')
  })

  it('fires on an in-place edit from an untracked directory', () => {
    expect(shell(outside, `perl -0pi -e 's/a/b/' ${project}/src/a.ts`).type).toBe('deny')
  })

  it('still ignores a shell write that lands outside every project', () => {
    expect(shell(outside, `cat > ${outside}/loose.ts <<EOF\nx\nEOF`).type).toBe('allow')
  })

  it('still ignores a command that writes nothing at all', () => {
    expect(shell(outside, 'npm test').type).toBe('allow')
  })

  it('names the project so the agent can escape from where it is standing', () => {
    const decision = shell(outside, `cat > ${project}/src/a.ts <<EOF\nx\nEOF`)
    expect(decision.agentMessage).toContain(`--cwd ${project}`)
  })
})

/**
 * Resolving symlinks fixed a project reached THROUGH a link. It also introduced the
 * mirror image: a linked directory inside a tracked project resolves to somewhere
 * outside it, which would have taken the write out of the gate's sight.
 */
describe('a symlinked directory inside a project cannot hide a write', () => {
  let home: string
  let project: string
  let elsewhere: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'spar-home-'))
    project = mkdtempSync(join(tmpdir(), 'spar-proj-'))
    elsewhere = mkdtempSync(join(tmpdir(), 'spar-vendor-'))
    process.env.SPAR_HOME = home
    writeFileSync(join(home, 'config.json'), JSON.stringify({ activation: 'always', projects: [{ path: project }] }))
    symlinkSync(elsewhere, join(project, 'vendor'), 'dir')
  })
  afterEach(() => {
    for (const d of [home, project, elsewhere]) rmSync(d, { recursive: true, force: true })
    delete process.env.SPAR_HOME
  })

  it('gates a write through the link, even from an untracked directory', () => {
    // cwd must NOT be the project, or the gate matches on cwd and never looks at the
    // path at all. The hole is only reachable when the file path is the sole evidence.
    const decision = gate({
      kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: tmpdir(),
      toolName: 'Write', filePath: join(project, 'vendor', 'a.ts'),
    } as never)
    expect(decision.type).toBe('deny')
  })

  it('gates a shell write through the link too', () => {
    const decision = gate({
      kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: tmpdir(),
      toolName: 'Bash', command: `cat > ${join(project, 'vendor', 'a.ts')} <<EOF\nx\nEOF`,
    } as never)
    expect(decision.type).toBe('deny')
  })

  it('and still ignores the same file addressed by its real path outside the project', () => {
    const decision = gate({
      kind: 'pre-tool', agent: 'claude-code', sessionId: 's1', cwd: elsewhere,
      toolName: 'Write', filePath: join(elsewhere, 'a.ts'),
    } as never)
    expect(decision.type).toBe('allow')
  })
})
