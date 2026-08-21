import { describe, expect, it } from 'vitest'
import { INTERVALS, MAX_BOX, isDue, pickDue, review } from '../src/core/schedule.js'
import type { Gap } from '../src/core/types.js'

const NOW = new Date('2026-08-21T12:00:00Z')

function gap(patch: Partial<Gap> = {}): Gap {
  return {
    id: 'g-0001', ts: '2026-08-01T00:00:00Z', project: 'api', task: 't', agent: 'cli',
    level: 1, kind: 'misconception', your_model: 'a', reality: 'b', concept: 'orm',
    box: 1, due: '2026-08-21', hits: 0, misses: 0, ...patch,
  }
}

describe('review', () => {
  it('moves a correct answer up one box and further away', () => {
    const next = review(gap({ box: 1 }), true, NOW)
    expect(next.box).toBe(2)
    expect(next.due).toBe('2026-08-24') // +3 days
    expect(next.hits).toBe(1)
  })

  it('sends a wrong answer back to box 1, returning tomorrow', () => {
    const next = review(gap({ box: 4, hits: 3 }), false, NOW)
    expect(next.box).toBe(1)
    expect(next.due).toBe('2026-08-22')
    expect(next.misses).toBe(1)
    expect(next.hits).toBe(3) // hits are history, not a score to lose
  })

  it('caps at the top box instead of running off the end of the intervals', () => {
    const next = review(gap({ box: MAX_BOX }), true, NOW)
    expect(next.box).toBe(MAX_BOX)
    expect(next.due).toBe('2026-09-25') // +35 days
  })

  it('repairs a nonsense box rather than producing an invalid date', () => {
    for (const box of [0, -3, Number.NaN, 99]) {
      const next = review(gap({ box }), true, NOW)
      expect(next.box).toBeGreaterThanOrEqual(1)
      expect(next.box).toBeLessThanOrEqual(MAX_BOX)
      expect(next.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('walks the full ladder in the documented steps', () => {
    let current = gap({ box: 1 })
    const seen: number[] = []
    for (let i = 0; i < 6; i++) {
      const next = review(current, true, NOW)
      seen.push(next.box)
      current = { ...current, ...next }
    }
    expect(seen).toEqual([2, 3, 4, 5, 5, 5])
    expect(INTERVALS).toEqual([1, 3, 7, 16, 35])
  })
})

describe('isDue / pickDue', () => {
  it('counts today as due', () => {
    expect(isDue(gap({ due: '2026-08-21' }), NOW)).toBe(true)
    expect(isDue(gap({ due: '2026-08-22' }), NOW)).toBe(false)
  })

  it('returns nothing when nothing is due', () => {
    expect(pickDue([gap({ due: '2026-09-01' })], [], NOW)).toBeUndefined()
  })

  it('returns exactly one gap, never a list', () => {
    const gaps = [gap({ id: 'a', due: '2026-08-01' }), gap({ id: 'b', due: '2026-08-02' })]
    expect(pickDue(gaps, [], NOW)?.id).toBe('a')
  })

  it('prefers the longest overdue, so a skipped gap does not sink', () => {
    const gaps = [gap({ id: 'recent', due: '2026-08-20' }), gap({ id: 'ancient', due: '2026-07-01' })]
    expect(pickDue(gaps, [], NOW)?.id).toBe('ancient')
  })

  it('puts a focused concept ahead of an older unfocused one', () => {
    const gaps = [
      gap({ id: 'old', concept: 'caching', due: '2026-07-01' }),
      gap({ id: 'focused', concept: 'orm', due: '2026-08-20' }),
    ]
    expect(pickDue(gaps, ['ORM'], NOW)?.id).toBe('focused')
  })
})
