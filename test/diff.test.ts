import { describe, expect, it } from 'vitest'
import { diffLines, hasChanges, renderDiff } from '../src/core/diff.js'

const ops = (a: string, b: string) => diffLines(a, b).map((l) => l.op)

describe('diffLines', () => {
  it('reports no changes for identical text', () => {
    expect(hasChanges(diffLines('a\nb\nc', 'a\nb\nc'))).toBe(false)
  })

  it('spots a single changed line without disturbing its neighbours', () => {
    expect(ops('a\nb\nc', 'a\nB\nc')).toEqual(['same', 'remove', 'add', 'same'])
  })

  it('handles a pure insertion', () => {
    expect(ops('a\nc', 'a\nb\nc')).toEqual(['same', 'add', 'same'])
  })

  it('handles a pure deletion', () => {
    expect(ops('a\nb\nc', 'a\nc')).toEqual(['same', 'remove', 'same'])
  })

  it('handles an empty side in both directions', () => {
    expect(hasChanges(diffLines('', 'a\nb'))).toBe(true)
    expect(hasChanges(diffLines('a\nb', ''))).toBe(true)
  })

  it('keeps every original line accounted for', () => {
    const before = 'one\ntwo\nthree\nfour'
    const after = 'one\nTWO\nthree\nfour\nfive'
    const result = diffLines(before, after)
    const reconstructedBefore = result.filter((l) => l.op !== 'add').map((l) => l.text).join('\n')
    const reconstructedAfter = result.filter((l) => l.op !== 'remove').map((l) => l.text).join('\n')
    expect(reconstructedBefore).toBe(before)
    expect(reconstructedAfter).toBe(after)
  })

  it('degrades instead of hanging on very large inputs', () => {
    const huge = Array.from({ length: 4000 }, (_, i) => `line ${i}`).join('\n')
    const result = diffLines(huge, huge + '\nextra')
    expect(result.length).toBe(2)
    expect(result[1]!.text).toContain('too large')
  })
})

describe('renderDiff', () => {
  it('elides unchanged stretches but keeps context around a change', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l10', 'CHANGED')
    const out = renderDiff(diffLines(before, after))
    expect(out).toContain('- l10')
    expect(out).toContain('+ CHANGED')
    expect(out).toContain('  l9')
    expect(out).toContain('...')
    expect(out).not.toContain('l2')
  })

  it('marks additions and removals unambiguously', () => {
    const out = renderDiff(diffLines('a', 'b'))
    expect(out.split('\n').some((l) => l.startsWith('- a'))).toBe(true)
    expect(out.split('\n').some((l) => l.startsWith('+ b'))).toBe(true)
  })
})
