import { describe, expect, it } from 'vitest'
import { isNewTask } from '../src/hooks/boundary.js'
import { emptyState, type SessionState } from '../src/core/types.js'

const IDLE = 30 * 60_000
const NOW = Date.parse('2026-08-21T12:00:00Z')

function active(minutesAgo: number): SessionState {
  return {
    ...emptyState('s1'),
    predicted: true,
    predictedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
  }
}

describe('isNewTask', () => {
  it('re-arms when nothing has been predicted yet', () => {
    expect(isNewTask(emptyState('s1'), IDLE, NOW)).toBe(true)
  })

  it('keeps an actively worked task alive', () => {
    expect(isNewTask(active(1), IDLE, NOW)).toBe(false)
    expect(isNewTask(active(29), IDLE, NOW)).toBe(false)
  })

  it('re-arms once the task has gone quiet past the threshold', () => {
    expect(isNewTask(active(31), IDLE, NOW)).toBe(true)
    expect(isNewTask(active(60 * 8), IDLE, NOW)).toBe(true)
  })

  it('re-arms on a corrupt timestamp rather than trusting it', () => {
    const state = { ...active(1), predictedAt: 'not a date' }
    expect(isNewTask(state, IDLE, NOW)).toBe(true)
  })

  it('re-arms when predicted is set but the timestamp is missing', () => {
    const state = { ...emptyState('s1'), predicted: true }
    expect(isNewTask(state, IDLE, NOW)).toBe(true)
  })

  it('honours a shorter threshold from config', () => {
    expect(isNewTask(active(10), 5 * 60_000, NOW)).toBe(true)
    expect(isNewTask(active(10), 60 * 60_000, NOW)).toBe(false)
  })

  it('leans towards "same task" exactly at the boundary', () => {
    // Re-arming on a follow-up costs the tool; missing a task costs one gap.
    expect(isNewTask(active(30), IDLE, NOW)).toBe(false)
  })
})
