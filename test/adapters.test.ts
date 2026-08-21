import { describe, expect, it } from 'vitest'
import { claudeCode } from '../src/adapters/claude-code.js'
import { cursor } from '../src/adapters/cursor.js'
import type { Adapter, NormalizedDecision } from '../src/adapters/types.js'

const ADAPTERS: Adapter[] = [claudeCode, cursor]

const DENY: NormalizedDecision = { type: 'deny', agentMessage: 'predict first', userMessage: 'your turn' }
const CONTEXT: NormalizedDecision = { type: 'context', context: 'a gap is due' }
const FEEDBACK: NormalizedDecision = { type: 'feedback', message: 'no marker left' }

describe.each(ADAPTERS.map((a) => [a.name, a] as const))('%s adapter', (_name, adapter) => {
  it('stays completely silent on allow, so it can never widen permissions', () => {
    for (const kind of ['pre-tool', 'post-tool', 'prompt', 'session-start'] as const) {
      const out = adapter.render({ type: 'allow' }, kind)
      expect(out.stdout).toBe('')
      expect(out.exitCode).toBe(0)
      expect(out.stdout).not.toContain('allow')
    }
  })

  it('emits valid JSON for every decision it speaks', () => {
    for (const decision of [DENY, CONTEXT, FEEDBACK]) {
      for (const kind of ['pre-tool', 'post-tool', 'prompt', 'session-start'] as const) {
        const out = adapter.render(decision, kind)
        if (out.stdout) expect(() => JSON.parse(out.stdout)).not.toThrow()
      }
    }
  })

  it('carries the agent message through on a deny', () => {
    const out = adapter.render(DENY, 'pre-tool')
    expect(out.stdout).toContain('predict first')
  })

  it('carries the context through on session start', () => {
    expect(adapter.render(CONTEXT, 'session-start').stdout).toContain('a gap is due')
  })

  it('gets the complaint back to the agent somehow after a write', () => {
    const out = adapter.render(FEEDBACK, 'post-tool')
    // Claude Code uses exit 2 + stderr; Cursor has no blocking channel and uses context.
    expect(out.stderr.includes('no marker left') || out.stdout.includes('no marker left')).toBe(true)
  })

  it('finds a session id and a working directory in its own payload shape', () => {
    const payloads: Record<string, unknown>[] = [
      { session_id: 's1', cwd: '/work/api', tool_name: 'Write', tool_input: { file_path: '/work/api/a.cs' } },
      { conversation_id: 'c1', workspace_roots: ['/work/api'], tool_name: 'Write', tool_input: { file_path: '/work/api/a.cs' } },
    ]
    for (const raw of payloads) {
      const event = adapter.parse(raw, 'pre-tool')
      expect(event.sessionId.length).toBeGreaterThan(0)
      expect(event.cwd.length).toBeGreaterThan(0)
      expect(event.agent).toBe(adapter.name)
    }
  })

  it('never throws on a payload that is missing everything', () => {
    expect(() => adapter.parse({}, 'pre-tool')).not.toThrow()
    expect(adapter.parse({}, 'pre-tool').sessionId).toBeTruthy()
  })
})

describe('parity between adapters', () => {
  it('agrees on whether a decision blocks, whatever the wire shape', () => {
    const blocks = (a: Adapter) => {
      const out = a.render(DENY, 'pre-tool')
      const body = out.stdout ? JSON.parse(out.stdout) : {}
      return body.permission === 'deny' || body.hookSpecificOutput?.permissionDecision === 'deny'
    }
    expect(blocks(claudeCode)).toBe(true)
    expect(blocks(cursor)).toBe(true)
  })

  it('reads the same file path out of each harness payload', () => {
    const cc = claudeCode.parse({ session_id: 's', cwd: '/w', tool_input: { file_path: '/w/a.cs' } }, 'pre-tool')
    const cu = cursor.parse({ conversation_id: 'c', cwd: '/w', tool_input: { file_path: '/w/a.cs' } }, 'pre-tool')
    expect(cc.filePath).toBe(cu.filePath)
  })

  it('uses the Cursor-native prompt stop rather than a permission field', () => {
    const out = JSON.parse(cursor.render(DENY, 'prompt').stdout)
    expect(out.continue).toBe(false)
    expect(out.permission).toBeUndefined()
  })
})
