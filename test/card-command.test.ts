import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cmdCard } from '../src/commands/card.js'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-card-'))
  process.env.SPAR_HOME = home
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  vi.restoreAllMocks()
  rmSync(home, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

const base = {
  layout: 'chain', title: 'Predict first', subtitle: 'One line',
  bullets: [] as string[], steps: ['you:You predict', 'ai:AI implements'],
  to: [] as string[], actors: [] as string[], messages: [] as string[], panes: [] as string[],
  open: false,
}

describe('spar card', () => {
  it('writes a card and returns 0', () => {
    expect(cmdCard(base)).toBe(0)
    const files = readdirSync(join(home, 'cards'))
    expect(files).toEqual(['predict-first.html'])
  })

  it('re-rendering the same title replaces the file rather than piling up copies', () => {
    cmdCard(base)
    cmdCard({ ...base, subtitle: 'A different line' })
    expect(readdirSync(join(home, 'cards'))).toHaveLength(1)
    expect(readFileSync(join(home, 'cards', 'predict-first.html'), 'utf8')).toContain('A different line')
  })

  it('exits 1 and writes nothing when there are too many steps', () => {
    expect(cmdCard({ ...base, steps: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6'] })).toBe(1)
    expect(existsSync(join(home, 'cards'))).toBe(false)
  })

  it('names the limit it hit, so the fix is obvious', () => {
    const said: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => { said.push(String(s)); return true })
    cmdCard({ ...base, steps: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6'] })
    expect(said.join('')).toMatch(/2 to 5/)
  })

  it('exits 1 when a fourth role appears', () => {
    expect(cmdCard({ ...base, steps: ['a:1', 'b:2', 'c:3', 'd:4'] })).toBe(1)
  })

  it('rejects an unknown layout instead of guessing', () => {
    expect(cmdCard({ ...base, layout: 'mindmap' })).toBe(1)
  })

  it('works with no config at all, because explaining is not gated', () => {
    expect(existsSync(join(home, 'config.json'))).toBe(false)
    expect(cmdCard(base)).toBe(0)
  })

  it('honours --out', () => {
    const out = join(home, 'elsewhere.html')
    expect(cmdCard({ ...base, out })).toBe(0)
    expect(readFileSync(out, 'utf8')).toContain('Predict first')
  })

  it('renders every layout end to end', () => {
    expect(cmdCard({ ...base, layout: 'fanout', steps: [], from: 'p:Protocol',
      to: ['a:Agent A', 'b:Agent B'], title: 'Fan' })).toBe(0)
    expect(cmdCard({ ...base, layout: 'sequence', steps: [],
      actors: ['a:Sender', 'b:Receiver'], messages: ['>:send', '<:ack'], title: 'Seq' })).toBe(0)
    expect(cmdCard({ ...base, layout: 'compare', steps: [],
      panes: ['g:Good|it works', 'b:Bad|it does not'], title: 'Cmp' })).toBe(0)
    expect(readdirSync(join(home, 'cards')).sort()).toEqual(['cmp.html', 'fan.html', 'seq.html'])
  })
})

describe('the two moments that ask for a card', () => {
  it('spar done suggests a compare card once there is something to compare', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    mkdirSync(join(home, 'state'), { recursive: true })
    writeFileSync(join(home, 'state', 's1.json'), JSON.stringify({
      sessionId: 's1', predicted: true, rush: false, trivial: false,
      editsSincePrediction: 0, level: 3,
    }))
    const file = join(home, 'Thing.cs')
    writeFileSync(file, 'written by the user\n')
    writeFileSync(join(home, 'state', 's1-proposals.json'), JSON.stringify([
      { file, content: 'proposed by the agent\n', source: 'chat', ts: '2026-08-21T00:00:00Z' },
    ]))

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((s?: unknown) => { lines.push(String(s)) })
    const { cmdDone } = await import('../src/commands/done.js')
    cmdDone('s1')
    expect(lines.join('\n')).toContain('spar card --layout compare')
  })

  it('the due hook asks for a card when the user cannot answer', async () => {
    const { readFileSync: read } = await import('node:fs')
    expect(read('src/hooks/due.ts', 'utf8')).toContain('spar card')
  })

  it('the skill tells the agent when a card is worth it', async () => {
    const { readFileSync: read } = await import('node:fs')
    const skill = read('skills/spar/SKILL.md', 'utf8')
    expect(skill).toContain('spar card')
    expect(skill).toMatch(/three or more moving parts/i)
  })
})
