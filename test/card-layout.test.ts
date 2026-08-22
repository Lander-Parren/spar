import { describe, expect, it } from 'vitest'
import { parseMessage, parsePane, parseRole, roleSlots, type CardSpec } from '../src/core/card.js'
import { CARD_W, CHAR_W, layout, type Layout2D } from '../src/core/card-layout.js'

/**
 * The ways small diagrams actually break, as assertions.
 *
 * Overlapping boxes, a label wider than the box holding it, content outside the
 * viewBox, an arrow slicing through an unrelated node, and a viewBox padded with dead
 * space. Every layout runs through this, at both ends of its range.
 */
function expectSaneGeometry(l: Layout2D): void {
  for (const b of l.boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.y).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(l.width)
    expect(b.y + b.h).toBeLessThanOrEqual(l.height)
    expect(b.label.length * CHAR_W).toBeLessThanOrEqual(b.w - 24)
  }
  for (let i = 0; i < l.boxes.length; i++) {
    for (let j = i + 1; j < l.boxes.length; j++) {
      const a = l.boxes[i]!, b = l.boxes[j]!
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y
      expect(apart).toBe(true)
    }
  }
  for (const a of l.arrows) {
    if (a.curved) continue
    for (const b of l.boxes) {
      const start = a.points[0]!
      const end = a.points.at(-1)!
      const touches = (p: [number, number]) =>
        p[0] >= b.x - 8 && p[0] <= b.x + b.w + 8 && p[1] >= b.y - 8 && p[1] <= b.y + b.h + 8
      if (touches(start) || touches(end)) continue
      const crosses = a.points.some((p) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h)
      expect(crosses).toBe(false)
    }
  }
  // Arrows are content too: a sequence lifeline runs well below the last label.
  const bottom = Math.max(
    ...l.boxes.map((b) => b.y + b.h),
    ...l.labels.map((t) => t.y),
    ...l.arrows.flatMap((a) => a.points.map((p) => p[1])),
  )
  expect(l.height - bottom).toBeLessThanOrEqual(60)
}

function chain(n: number, loop?: string): CardSpec {
  const steps = Array.from({ length: n }, (_, i) => parseRole(`r${i % 3}:step ${i + 1}`))
  return { layout: 'chain', title: 't', subtitle: 's', bullets: [], steps, ...(loop ? { loop } : {}) }
}

describe('chain layout', () => {
  it('places one box per step', () => {
    const spec = chain(4)
    expect(layout(spec, roleSlots(spec)).boxes).toHaveLength(4)
  })

  it('is geometrically sane at both ends of its range', () => {
    for (const n of [2, 3, 4, 5]) {
      const spec = chain(n)
      expectSaneGeometry(layout(spec, roleSlots(spec)))
    }
  })

  it('lays the steps out left to right in order', () => {
    const spec = chain(4)
    const xs = layout(spec, roleSlots(spec)).boxes.map((b) => b.x)
    expect([...xs].sort((a, b) => a - b)).toEqual(xs)
  })

  it('draws one connector between each neighbouring pair', () => {
    const spec = chain(4)
    const l = layout(spec, roleSlots(spec))
    expect(l.arrows.filter((a) => !a.curved)).toHaveLength(3)
  })

  it('adds a curved arrow and its label only when a loop is asked for', () => {
    const withoutLoop = chain(3)
    expect(layout(withoutLoop, roleSlots(withoutLoop)).arrows.some((a) => a.curved)).toBe(false)
    const withLoop = chain(3, 'sets the next level')
    const l = layout(withLoop, roleSlots(withLoop))
    expect(l.arrows.some((a) => a.curved)).toBe(true)
    expect(l.labels.some((t) => t.text === 'sets the next level')).toBe(true)
  })

  it('gives every box the slot of its role', () => {
    const spec = chain(4)
    const slots = roleSlots(spec)
    const l = layout(spec, slots)
    expect(l.boxes[0]!.slot).toBe(slots.get('r0'))
    expect(l.boxes[3]!.slot).toBe(slots.get('r0'))
  })

  it('keeps the canvas at a fixed width', () => {
    const spec = chain(5)
    expect(layout(spec, roleSlots(spec)).width).toBe(CARD_W)
  })
})

function fanout(n: number, via?: string): CardSpec {
  return {
    layout: 'fanout', title: 't', subtitle: 's', bullets: [],
    from: parseRole('src:Protocol'),
    to: Array.from({ length: n }, (_, i) => parseRole(`r${i % 2}:Agent ${i + 1}`)),
    ...(via ? { via } : {}),
  }
}

describe('fanout layout', () => {
  it('places the source above every receiver', () => {
    const spec = fanout(3)
    const l = layout(spec, roleSlots(spec))
    const [source, ...receivers] = l.boxes
    for (const r of receivers) expect(source!.y + source!.h).toBeLessThanOrEqual(r.y)
  })

  it('is geometrically sane across its whole range', () => {
    for (const n of [2, 3, 4]) {
      const spec = fanout(n)
      expectSaneGeometry(layout(spec, roleSlots(spec)))
    }
  })

  it('draws one arrow per receiver, plus the source arrow when a bar is asked for', () => {
    const plain = fanout(3)
    expect(layout(plain, roleSlots(plain)).arrows).toHaveLength(3)
    const barred = fanout(3, 'any compliant receiver')
    expect(layout(barred, roleSlots(barred)).arrows).toHaveLength(4)
  })

  it('centres the source over the receivers', () => {
    const spec = fanout(4)
    const l = layout(spec, roleSlots(spec))
    const source = l.boxes[0]!
    const receivers = l.boxes.slice(1)
    const spread = (receivers[0]!.x + receivers.at(-1)!.x + receivers.at(-1)!.w) / 2
    expect(Math.abs(source.x + source.w / 2 - spread)).toBeLessThanOrEqual(2)
  })
})

function sequence(dirs: ('>' | '<')[]): CardSpec {
  return {
    layout: 'sequence', title: 't', subtitle: 's', bullets: [],
    actors: [parseRole('a:Sender'), parseRole('b:Receiver')],
    messages: dirs.map((d, i) => parseMessage(`${d}:message ${i + 1}`)),
  }
}

describe('sequence layout', () => {
  it('places the two actors side by side on the same row', () => {
    const spec = sequence(['>', '<'])
    const l = layout(spec, roleSlots(spec))
    const [left, right] = l.boxes
    expect(left!.y).toBe(right!.y)
    expect(left!.x + left!.w).toBeLessThan(right!.x)
  })

  it('is geometrically sane across its whole range', () => {
    for (const n of [2, 3, 4]) {
      const dirs = Array.from({ length: n }, (_, i) => (i % 2 ? '<' : '>')) as ('>' | '<')[]
      expectSaneGeometry(layout(sequence(dirs), roleSlots(sequence(dirs))))
    }
  })

  it('numbers the messages in order', () => {
    const spec = sequence(['>', '<', '>'])
    const numbered = layout(spec, roleSlots(spec)).arrows.filter((a) => a.index !== undefined)
    expect(numbered.map((a) => a.index)).toEqual([1, 2, 3])
  })

  it('points each message the way its direction says', () => {
    const spec = sequence(['>', '<'])
    const [first, second] = layout(spec, roleSlots(spec)).arrows.filter((a) => a.index !== undefined)
    expect(first!.points[0]![0]).toBeLessThan(first!.points.at(-1)![0])
    expect(second!.points[0]![0]).toBeGreaterThan(second!.points.at(-1)![0])
  })

  it('draws a lifeline under each actor', () => {
    const spec = sequence(['>', '<'])
    const lifelines = layout(spec, roleSlots(spec)).arrows.filter((a) => a.index === undefined)
    expect(lifelines).toHaveLength(2)
  })
})

function compare(): CardSpec {
  return {
    layout: 'compare', title: 't', subtitle: 's', bullets: [],
    panes: [
      parsePane('good:Transparent failure|Returns a structured error the caller can act on'),
      parsePane('bad:Silent failure|Looks successful and surfaces much later'),
    ],
  }
}

describe('compare layout', () => {
  it('stacks exactly two panes', () => {
    const spec = compare()
    const l = layout(spec, roleSlots(spec))
    expect(l.boxes).toHaveLength(2)
    expect(l.boxes[0]!.y + l.boxes[0]!.h).toBeLessThanOrEqual(l.boxes[1]!.y)
  })

  it('is geometrically sane', () => {
    const spec = compare()
    expectSaneGeometry(layout(spec, roleSlots(spec)))
  })

  it('carries the body text through, since a pane is title plus body', () => {
    const spec = compare()
    const l = layout(spec, roleSlots(spec))
    expect(l.boxes[0]!.body).toContain('structured error')
  })

  it('draws no arrows, because a comparison has no flow', () => {
    const spec = compare()
    expect(layout(spec, roleSlots(spec)).arrows).toHaveLength(0)
  })
})
