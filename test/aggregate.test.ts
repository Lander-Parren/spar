import { describe, expect, it } from 'vitest'
import { aggregate, weekOf } from '../src/core/aggregate.js'
import type { SparEvent } from '../src/core/events.js'
import type { Gap } from '../src/core/types.js'

const NOW = new Date('2026-08-21T12:00:00Z')

function gap(patch: Partial<Gap> = {}): Gap {
  return {
    id: 'g-1', ts: '2026-08-18T00:00:00Z', project: 'api', task: 't', agent: 'cli',
    session: 's1', level: 1, kind: 'misconception', your_model: 'a', reality: 'b',
    concept: 'orm', box: 1, due: '2026-08-21', hits: 0, misses: 0, ...patch,
  }
}

function predict(session: string, ts: string, blanks = 0): SparEvent {
  return { ts, type: 'predict', session, level: 1, blanks, concepts: [] }
}

describe('aggregate', () => {
  it('survives an empty history without dividing by zero', () => {
    const stats = aggregate([], [], [], NOW)
    expect(stats.totals.predictions).toBe(0)
    expect(stats.noIdea.ratio).toBe(0)
    expect(stats.health.overrideRatio).toBe(0)
    expect(stats.calibration).toEqual([])
  })

  it('counts a prediction clean when it produced no misconception', () => {
    const events = [predict('s1', '2026-08-18T09:00:00Z'), predict('s2', '2026-08-18T10:00:00Z')]
    const stats = aggregate([gap({ session: 's1' })], events, [], NOW)
    expect(stats.calibration[0]!.predictions).toBe(2)
    expect(stats.calibration[0]!.clean).toBe(1)
    expect(stats.calibration[0]!.rate).toBe(0.5)
  })

  it('does not punish a session twice for two gaps from one prediction', () => {
    const events = [predict('s1', '2026-08-18T09:00:00Z'), predict('s2', '2026-08-18T10:00:00Z')]
    const gaps = [gap({ id: 'g-1', session: 's1' }), gap({ id: 'g-2', session: 's1' })]
    expect(aggregate(gaps, events, [], NOW).calibration[0]!.rate).toBe(0.5)
  })

  it('does not count typo-bugs or improvements against calibration', () => {
    const events = [predict('s1', '2026-08-18T09:00:00Z')]
    const gaps = [gap({ session: 's1', kind: 'improvement' })]
    expect(aggregate(gaps, events, [], NOW).calibration[0]!.rate).toBe(1)
  })

  it('buckets by week, oldest first', () => {
    const events = [predict('s1', '2026-08-04T09:00:00Z'), predict('s2', '2026-08-18T09:00:00Z')]
    const weeks = aggregate([], events, [], NOW).calibration.map((c) => c.week)
    expect(weeks).toEqual(['2026-08-03', '2026-08-17'])
  })

  it('orders concepts by weakness, with focused ones pinned on top', () => {
    const gaps = [
      gap({ id: 'a', concept: 'caching', box: 1 }),
      gap({ id: 'b', concept: 'caching', box: 1 }),
      gap({ id: 'c', concept: 'di', box: 5 }),
    ]
    const plain = aggregate(gaps, [], [], NOW).concepts.map((c) => c.concept)
    expect(plain[0]).toBe('caching')
    const focused = aggregate(gaps, [], ['di'], NOW).concepts
    expect(focused[0]!.concept).toBe('di')
    expect(focused[0]!.focused).toBe(true)
  })

  it('reports the no-idea ratio over answers, not over predictions', () => {
    const events = [predict('s1', '2026-08-18T09:00:00Z', 3), predict('s2', '2026-08-18T10:00:00Z', 0)]
    const stats = aggregate([], events, [], NOW)
    expect(stats.noIdea.answers).toBe(6)
    expect(stats.noIdea.blanks).toBe(3)
    expect(stats.noIdea.ratio).toBe(0.5)
  })

  it('splits the due queue into overdue, today and the coming week', () => {
    const gaps = [
      gap({ id: 'a', due: '2026-08-01' }),
      gap({ id: 'b', due: '2026-08-21' }),
      gap({ id: 'c', due: '2026-08-25' }),
      gap({ id: 'd', due: '2026-10-01' }),
    ]
    const due = aggregate(gaps, [], [], NOW).due
    expect(due).toMatchObject({ overdue: 1, today: 1, withinWeek: 1, total: 2 })
  })

  it('measures override rate against suggestions, not against tasks', () => {
    const events: SparEvent[] = [
      { ts: '2026-08-18T09:00:00Z', type: 'suggest', session: 's1', level: 2, concepts: [] },
      { ts: '2026-08-18T09:01:00Z', type: 'suggest', session: 's2', level: 2, concepts: [] },
      { ts: '2026-08-18T09:02:00Z', type: 'override', session: 's1', from: 2, to: 1 },
    ]
    expect(aggregate([], events, [], NOW).health.overrideRatio).toBe(0.5)
  })
})

describe('weekOf', () => {
  it('snaps to the Monday of that week', () => {
    expect(weekOf('2026-08-21T12:00:00Z')).toBe('2026-08-17') // Friday -> Monday
    expect(weekOf('2026-08-17T00:00:00Z')).toBe('2026-08-17') // Monday stays
    expect(weekOf('2026-08-23T23:59:00Z')).toBe('2026-08-17') // Sunday belongs to it
  })

  it('does not throw on a broken timestamp', () => {
    expect(weekOf('not a date')).toBe('unknown')
  })
})
