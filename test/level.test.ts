import { describe, expect, it } from 'vitest'
import { NO_IDEA, suggestLevel } from '../src/core/level.js'
import type { Gap } from '../src/core/types.js'

function gap(concept: string, box: number, yourModel = 'thought X'): Gap {
  return {
    id: 'g-0001', ts: '2026-08-01T00:00:00Z', project: 'api', task: 't', agent: 'claude-code',
    level: 1, kind: 'misconception', your_model: yourModel, reality: 'actually Y',
    concept, box, due: '2026-08-02', hits: 0, misses: 0,
  }
}

describe('suggestLevel', () => {
  it('short-circuits to 0 when rush is on, whatever the log says', () => {
    const gaps = [gap('orm', 1), gap('orm', 1), gap('orm', 1)]
    expect(suggestLevel({ concepts: ['orm'], gaps, rush: true }).level).toBe(0)
  })

  it('suggests 1 for a concept with no history', () => {
    expect(suggestLevel({ concepts: ['grpc'], gaps: [] }).level).toBe(1)
  })

  it('suggests 1 when every gap on the concept is consolidated', () => {
    expect(suggestLevel({ concepts: ['orm'], gaps: [gap('orm', 5), gap('orm', 4)] }).level).toBe(1)
  })

  it('suggests 2 for one or two open gaps', () => {
    expect(suggestLevel({ concepts: ['orm'], gaps: [gap('orm', 1)] }).level).toBe(2)
    expect(suggestLevel({ concepts: ['orm'], gaps: [gap('orm', 1), gap('orm', 2)] }).level).toBe(2)
  })

  it('suggests 3 once three gaps are open', () => {
    const gaps = [gap('orm', 1), gap('orm', 2), gap('orm', 1)]
    expect(suggestLevel({ concepts: ['orm'], gaps }).level).toBe(3)
  })

  it('suggests 3 when you have answered "no idea" here before, even if consolidated', () => {
    expect(suggestLevel({ concepts: ['orm'], gaps: [gap('orm', 5, NO_IDEA)] }).level).toBe(3)
  })

  it('matches concepts case- and whitespace-insensitively', () => {
    expect(suggestLevel({ concepts: ['  ORM  '], gaps: [gap('orm', 1)] }).level).toBe(2)
  })

  it('bumps one level for a focused concept, but never past 3', () => {
    expect(suggestLevel({ concepts: ['orm'], gaps: [], focused: ['orm'] }).level).toBe(2)
    const many = [gap('orm', 1), gap('orm', 1), gap('orm', 1)]
    expect(suggestLevel({ concepts: ['orm'], gaps: many, focused: ['orm'] }).level).toBe(3)
  })

  it('always gives a reason, because a suggestion without one is an order', () => {
    for (const input of [
      { concepts: [], gaps: [] },
      { concepts: ['orm'], gaps: [] },
      { concepts: ['orm'], gaps: [gap('orm', 1)] },
    ]) {
      expect(suggestLevel(input).reason.length).toBeGreaterThan(0)
    }
  })

  it('ignores gaps on unrelated concepts', () => {
    const gaps = [gap('caching', 1), gap('caching', 1), gap('caching', 1)]
    expect(suggestLevel({ concepts: ['orm'], gaps }).level).toBe(1)
  })
})
