import { describe, expect, it } from 'vitest'
import {
  CardError, parseBullet, parseMessage, parsePane, parseRole, roleSlots, validate,
  type CardSpec,
} from '../src/core/card.js'

function chain(steps: string[], extra: Partial<CardSpec> = {}): CardSpec {
  return {
    layout: 'chain', title: 't', subtitle: 's', bullets: [],
    steps: steps.map(parseRole), ...extra,
  }
}

describe('parsing', () => {
  it('splits a role from its label', () => {
    expect(parseRole('you:You predict')).toEqual({ role: 'you', label: 'You predict' })
  })

  it('falls back to a neutral role when there is no colon', () => {
    expect(parseRole('You predict')).toEqual({ role: '_', label: 'You predict' })
  })

  it('keeps colons that appear inside the label', () => {
    expect(parseRole('you:a:b')).toEqual({ role: 'you', label: 'a:b' })
  })

  it('reads a two-tone bullet, muted half optional', () => {
    expect(parseBullet('You take a position|before the answer exists'))
      .toEqual({ visible: 'You take a position', muted: 'before the answer exists' })
    expect(parseBullet('Just this')).toEqual({ visible: 'Just this' })
  })

  it('reads a message direction', () => {
    expect(parseMessage('>:send handoff')).toEqual({ dir: '>', label: 'send handoff' })
    expect(parseMessage('<:acknowledge')).toEqual({ dir: '<', label: 'acknowledge' })
  })

  it('rejects a message without a usable direction', () => {
    expect(() => parseMessage('send handoff')).toThrow(CardError)
  })

  it('reads a compare pane', () => {
    expect(parsePane('good:Transparent failure|Returns a structured error'))
      .toEqual({ role: 'good', title: 'Transparent failure', body: 'Returns a structured error' })
  })
})

describe('limits', () => {
  it('accepts a chain within range', () => {
    expect(() => validate(chain(['a:one', 'b:two']))).not.toThrow()
    expect(() => validate(chain(['a:1', 'a:2', 'a:3', 'a:4', 'a:5']))).not.toThrow()
  })

  it('rejects a chain that is too short or too long, naming the limit', () => {
    expect(() => validate(chain(['a:only']))).toThrow(/2 to 5/)
    expect(() => validate(chain(['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6']))).toThrow(/2 to 5/)
  })

  it('caps bullets at three', () => {
    const four = [1, 2, 3, 4].map((n) => parseBullet(`b${n}`))
    expect(() => validate(chain(['a:1', 'a:2'], { bullets: four }))).toThrow(/at most 3/)
  })

  it('caps distinct roles at three', () => {
    const spec = chain(['a:1', 'b:2', 'c:3', 'd:4'])
    expect(() => validate(spec)).toThrow(/at most 3 roles/)
  })

  it('requires a title and a subtitle', () => {
    expect(() => validate({ ...chain(['a:1', 'a:2']), title: '' })).toThrow(/title/)
    expect(() => validate({ ...chain(['a:1', 'a:2']), subtitle: '' })).toThrow(/subtitle/)
  })

  it('enforces the fanout, sequence and compare limits', () => {
    const base = { title: 't', subtitle: 's', bullets: [] }
    expect(() => validate({ ...base, layout: 'fanout', from: parseRole('a:src'),
      to: [parseRole('b:one')] })).toThrow(/2 to 4/)
    expect(() => validate({ ...base, layout: 'sequence', actors: [parseRole('a:one')],
      messages: [parseMessage('>:m1'), parseMessage('<:m2')] })).toThrow(/exactly 2 actors/)
    expect(() => validate({ ...base, layout: 'compare',
      panes: [parsePane('a:t|b')] })).toThrow(/exactly 2/)
  })
})

describe('a pane body that cannot fit', () => {
  it('is refused rather than allowed to run outside its box', () => {
    const long = 'x'.repeat(120)
    expect(() => validate({
      layout: 'compare', title: 't', subtitle: 's', bullets: [],
      panes: [parsePane(`a:Title|${long}`), parsePane('b:Other|short')],
    })).toThrow(/at most 90 characters/)
  })

  it('accepts a body that fits', () => {
    expect(() => validate({
      layout: 'compare', title: 't', subtitle: 's', bullets: [],
      panes: [parsePane('a:Title|a body that comfortably fits on one line'), parsePane('b:Other|short')],
    })).not.toThrow()
  })
})

describe('roleSlots', () => {
  it('assigns slots in order of first appearance', () => {
    const slots = roleSlots(chain(['you:1', 'ai:2', 'you:3', 'out:4']))
    expect(slots.get('you')).toBe(0)
    expect(slots.get('ai')).toBe(1)
    expect(slots.get('out')).toBe(2)
  })
})
