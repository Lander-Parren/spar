# spar cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `spar card`, a command that renders a single-idea visual explanation to a self-contained HTML file, with element limits the CLI enforces rather than suggests.

**Architecture:** Four pure layers. `core/card.ts` parses and validates the request. `core/card-layout.ts` turns a validated request into coordinates and knows nothing about colour or text styling. `render/card.ts` turns coordinates plus a theme into SVG and then a full page. `commands/card.ts` is the CLI surface. The split exists so the geometry, which is where diagrams actually fail, is a pure function with unit tests instead of a thing a human eyeballs.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Node >= 20, vitest. No new runtime dependencies.

**Spec:** `docs/design/2026-08-21-cards.md`

> Plan location note: the writing-plans default is `docs/superpowers/plans/`. This repo is public and already keeps its design docs in `docs/design/`, so the plan lives beside its spec instead.

## Global Constraints

- Node >= 20. TypeScript strict with `noUncheckedIndexedAccess`. ESM with `.js` import specifiers.
- Zero new runtime dependencies. Dev dependencies unchanged.
- Rendered output must reference no network resource of any kind.
- User-facing copy contains no em dash or en dash. Sentence case in card labels.
- At most 3 distinct roles per card. Exceeding any limit exits 1 with the limit named.
- Cards never require a tracked project or any config. They work on a fresh install.
- Every task ends green: `npx tsc -p tsconfig.json` exits 0 and `npx vitest run` passes.

---

### Task 1: Card model, parsing and limits

**Files:**
- Create: `src/core/card.ts`
- Test: `test/card.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Layout`, `Role`, `Bullet`, `Message`, `ComparePane`, `CardSpec`, `CardError`, `parseRole(input: string): Role`, `parseBullet(input: string): Bullet`, `parseMessage(input: string): Message`, `parsePane(input: string): ComparePane`, `validate(spec: CardSpec): void`, `roleSlots(spec: CardSpec): Map<string, number>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/card.test.ts
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

describe('roleSlots', () => {
  it('assigns slots in order of first appearance', () => {
    const slots = roleSlots(chain(['you:1', 'ai:2', 'you:3', 'out:4']))
    expect(slots.get('you')).toBe(0)
    expect(slots.get('ai')).toBe(1)
    expect(slots.get('out')).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card.test.ts`
Expected: FAIL, cannot resolve `../src/core/card.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/card.ts
export type Layout = 'chain' | 'fanout' | 'sequence' | 'compare'

export interface Role { role: string; label: string }
export interface Bullet { visible: string; muted?: string }
export interface Message { dir: '>' | '<'; label: string }
export interface ComparePane { role: string; title: string; body: string }

export interface CardSpec {
  layout: Layout
  title: string
  subtitle: string
  bullets: Bullet[]
  close?: string
  steps?: Role[]
  loop?: string
  from?: Role
  to?: Role[]
  via?: string
  actors?: Role[]
  messages?: Message[]
  panes?: ComparePane[]
}

/** Thrown for anything the user can fix by changing their arguments. */
export class CardError extends Error {}

/** Role used when a label carries no `role:` prefix. */
export const NEUTRAL = '_'

export const MAX_BULLETS = 3
export const MAX_ROLES = 3

export function parseRole(input: string): Role {
  const at = input.indexOf(':')
  if (at <= 0) return { role: NEUTRAL, label: input.trim() }
  return { role: input.slice(0, at).trim(), label: input.slice(at + 1).trim() }
}

export function parseBullet(input: string): Bullet {
  const at = input.indexOf('|')
  if (at < 0) return { visible: input.trim() }
  return { visible: input.slice(0, at).trim(), muted: input.slice(at + 1).trim() }
}

export function parseMessage(input: string): Message {
  const dir = input.slice(0, 1)
  if ((dir !== '>' && dir !== '<') || input[1] !== ':') {
    throw new CardError(`a message must start with ">:" or "<:", got "${input}"`)
  }
  return { dir, label: input.slice(2).trim() }
}

export function parsePane(input: string): ComparePane {
  const { role, label } = parseRole(input)
  const at = label.indexOf('|')
  if (at < 0) throw new CardError(`a compare pane needs "title|body", got "${input}"`)
  return { role, title: label.slice(0, at).trim(), body: label.slice(at + 1).trim() }
}

/** Every role the card mentions, in the order it first appears. */
function rolesOf(spec: CardSpec): string[] {
  const all = [
    ...(spec.steps ?? []),
    ...(spec.from ? [spec.from] : []),
    ...(spec.to ?? []),
    ...(spec.actors ?? []),
    ...(spec.panes ?? []).map((p) => ({ role: p.role, label: p.title })),
  ]
  const seen: string[] = []
  for (const { role } of all) if (role !== NEUTRAL && !seen.includes(role)) seen.push(role)
  return seen
}

export function roleSlots(spec: CardSpec): Map<string, number> {
  const map = new Map<string, number>()
  rolesOf(spec).forEach((role, index) => map.set(role, index))
  map.set(NEUTRAL, map.size)
  return map
}

function count(name: string, list: unknown[] | undefined, min: number, max: number): void {
  const n = list?.length ?? 0
  if (n < min || n > max) {
    throw new CardError(
      min === max
        ? `${name}: exactly ${max} required, got ${n}`
        : `${name}: ${min} to ${max} required, got ${n}`,
    )
  }
}

export function validate(spec: CardSpec): void {
  if (!spec.title.trim()) throw new CardError('a card needs a --title')
  if (!spec.subtitle.trim()) throw new CardError('a card needs a --subtitle')
  if (spec.bullets.length > MAX_BULLETS) {
    throw new CardError(`bullets: at most ${MAX_BULLETS}, got ${spec.bullets.length}`)
  }

  switch (spec.layout) {
    case 'chain':
      count('steps', spec.steps, 2, 5)
      break
    case 'fanout':
      if (!spec.from) throw new CardError('fanout needs one --from')
      count('receivers', spec.to, 2, 4)
      break
    case 'sequence':
      if ((spec.actors?.length ?? 0) !== 2) {
        throw new CardError(`sequence needs exactly 2 actors, got ${spec.actors?.length ?? 0}`)
      }
      count('messages', spec.messages, 2, 4)
      break
    case 'compare':
      count('panes', spec.panes, 2, 2)
      break
  }

  const roles = rolesOf(spec)
  if (roles.length > MAX_ROLES) {
    throw new CardError(
      `at most ${MAX_ROLES} roles per card, got ${roles.length}: ${roles.join(', ')}. ` +
        'Colour marks what something is, not which step it is.',
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/card.test.ts && npx tsc -p tsconfig.json`
Expected: PASS, tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/card.ts test/card.test.ts
git commit -m "Card model: parsing and the limits the CLI will enforce"
```

---

### Task 2: Chain layout and the shared geometry invariants

**Files:**
- Create: `src/core/card-layout.ts`
- Test: `test/card-layout.test.ts`

**Interfaces:**
- Consumes: `CardSpec`, `roleSlots` from Task 1.
- Produces: `Box`, `Arrow`, `FloatLabel`, `Layout2D`, `layout(spec: CardSpec, slots: Map<string, number>): Layout2D`, and the constants `CARD_W`, `MARGIN`, `CHAR_W`. Also the test helper file exports `expectSaneGeometry` used by Tasks 3 to 5.

- [ ] **Step 1: Write the failing test**

```ts
// test/card-layout.test.ts
import { describe, expect, it } from 'vitest'
import { parseRole, roleSlots, type CardSpec } from '../src/core/card.js'
import { CARD_W, CHAR_W, layout, type Layout2D } from '../src/core/card-layout.js'

/** The failure modes diagrams actually have, as assertions. Reused by every layout. */
export function expectSaneGeometry(l: Layout2D): void {
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
      const [start] = a.points
      const end = a.points.at(-1)!
      const touches = (p: [number, number]) =>
        p[0] >= b.x - 8 && p[0] <= b.x + b.w + 8 && p[1] >= b.y - 8 && p[1] <= b.y + b.h + 8
      if (touches(start!) || touches(end)) continue
      const crosses = a.points.some((p) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h)
      expect(crosses).toBe(false)
    }
  }
  const bottom = Math.max(...l.boxes.map((b) => b.y + b.h), ...l.labels.map((t) => t.y))
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-layout.test.ts`
Expected: FAIL, cannot resolve `../src/core/card-layout.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/card-layout.ts
import { NEUTRAL, type CardSpec } from './card.js'

/** Fixed canvas width, so every card in a set reads at the same scale. */
export const CARD_W = 1120
export const MARGIN = 40
/** Average glyph advance for the card label size. Used to size boxes to their text. */
export const CHAR_W = 11

export interface Box { x: number; y: number; w: number; h: number; label: string; body?: string; slot: number }
export interface Arrow { points: [number, number][]; slot: number; curved?: boolean; index?: number }
export interface FloatLabel {
  x: number; y: number; text: string
  anchor: 'start' | 'middle' | 'end'
  style: 'plain' | 'script'
}
export interface Layout2D { width: number; height: number; boxes: Box[]; arrows: Arrow[]; labels: FloatLabel[] }

const slotOf = (slots: Map<string, number>, role: string): number => slots.get(role) ?? slots.get(NEUTRAL) ?? 0

export function layout(spec: CardSpec, slots: Map<string, number>): Layout2D {
  switch (spec.layout) {
    case 'chain':
      return chain(spec, slots)
    default:
      throw new Error(`layout not implemented: ${spec.layout}`)
  }
}

function chain(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const steps = spec.steps ?? []
  const hasLoop = Boolean(spec.loop)
  const gap = 60
  const inner = CARD_W - 2 * MARGIN
  const w = Math.floor((inner - gap * (steps.length - 1)) / steps.length)
  const h = 80
  const top = hasLoop ? 150 : 60

  const boxes: Box[] = steps.map((step, i) => ({
    x: MARGIN + i * (w + gap), y: top, w, h,
    label: step.label, slot: slotOf(slots, step.role),
  }))

  const arrows: Arrow[] = []
  for (let i = 0; i < boxes.length - 1; i++) {
    const a = boxes[i]!, b = boxes[i + 1]!
    arrows.push({ points: [[a.x + a.w + 2, a.y + a.h / 2], [b.x - 6, b.y + b.h / 2]], slot: a.slot })
  }

  const labels: FloatLabel[] = []
  if (hasLoop && boxes.length >= 2) {
    const last = boxes.at(-1)!, first = boxes[0]!
    const arcTop = 52
    arrows.push({
      curved: true,
      slot: -1,
      points: [
        [last.x + last.w / 2, last.y],
        [last.x + last.w / 2, arcTop],
        [first.x + first.w / 2, arcTop],
        [first.x + first.w / 2, first.y - 4],
      ],
    })
    labels.push({ x: CARD_W / 2, y: arcTop - 18, text: spec.loop!, anchor: 'middle', style: 'script' })
  }

  return { width: CARD_W, height: top + h + MARGIN, boxes, arrows, labels }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/card-layout.test.ts && npx tsc -p tsconfig.json`
Expected: PASS. If the label-fits assertion fails at 5 steps, reduce `gap` to 40 rather than widening the canvas.

- [ ] **Step 5: Commit**

```bash
git add src/core/card-layout.ts test/card-layout.test.ts
git commit -m "Chain layout, with the diagram failure modes as assertions

Overlapping boxes, labels wider than their box, content outside the
viewBox and a viewBox padded with dead space are the ways small diagrams
usually break. Because the coordinates are computed here rather than
imagined by a model, each one is a test."
```

---

### Task 3: Fanout layout

**Files:**
- Modify: `src/core/card-layout.ts`
- Test: `test/card-layout.test.ts`

**Interfaces:**
- Consumes: `Layout2D`, `expectSaneGeometry`, `CARD_W`, `MARGIN` from Task 2.
- Produces: `layout()` handles `spec.layout === 'fanout'`.

- [ ] **Step 1: Write the failing test**

Append to `test/card-layout.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-layout.test.ts -t fanout`
Expected: FAIL with "layout not implemented: fanout".

- [ ] **Step 3: Write minimal implementation**

In `src/core/card-layout.ts`, add the `fanout` case to the switch and this function:

```ts
function fanout(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const receivers = spec.to ?? []
  const gap = 50
  const inner = CARD_W - 2 * MARGIN
  const w = Math.floor((inner - gap * (receivers.length - 1)) / receivers.length)
  const h = 80
  const rowY = 200

  const boxes: Box[] = receivers.map((r, i) => ({
    x: MARGIN + i * (w + gap), y: rowY, w, h,
    label: r.label, slot: slotOf(slots, r.role),
  }))

  const spread = (boxes[0]!.x + boxes.at(-1)!.x + boxes.at(-1)!.w) / 2
  const sourceW = Math.min(280, inner)
  const source: Box = {
    x: Math.round(spread - sourceW / 2), y: 50, w: sourceW, h,
    label: spec.from!.label, slot: slotOf(slots, spec.from!.role),
  }

  const barY = 155
  const arrows: Arrow[] = boxes.map((b) => ({
    points: [[b.x + b.w / 2, barY], [b.x + b.w / 2, b.y - 6]] as [number, number][],
    slot: b.slot,
  }))

  const labels: FloatLabel[] = []
  if (spec.via) {
    arrows.push({ points: [[spread, source.y + source.h], [spread, barY - 6]], slot: source.slot })
    labels.push({ x: spread, y: barY - 14, text: spec.via, anchor: 'middle', style: 'plain' })
  }

  return { width: CARD_W, height: rowY + h + MARGIN, boxes: [source, ...boxes], arrows, labels }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/card-layout.test.ts && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/card-layout.ts test/card-layout.test.ts
git commit -m "Fanout layout: one source over two to four receivers"
```

---

### Task 4: Sequence layout

**Files:**
- Modify: `src/core/card-layout.ts`
- Test: `test/card-layout.test.ts`

**Interfaces:**
- Consumes: `Layout2D`, `expectSaneGeometry` from Task 2.
- Produces: `layout()` handles `spec.layout === 'sequence'`. Message arrows carry `index` (1-based) so the renderer can number them.

- [ ] **Step 1: Write the failing test**

Append to `test/card-layout.test.ts`:

```ts
import { parseMessage } from '../src/core/card.js'

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
      const spec = sequence(Array.from({ length: n }, (_, i) => (i % 2 ? '<' : '>')) as ('>' | '<')[])
      expectSaneGeometry(layout(spec, roleSlots(spec)))
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-layout.test.ts -t sequence`
Expected: FAIL with "layout not implemented: sequence".

- [ ] **Step 3: Write minimal implementation**

Add the `sequence` case to the switch and this function:

```ts
function sequence(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const [left, right] = spec.actors!
  const messages = spec.messages ?? []
  const w = 300
  const h = 74
  const top = 40
  const leftX = MARGIN + 40
  const rightX = CARD_W - MARGIN - 40 - w

  const boxes: Box[] = [
    { x: leftX, y: top, w, h, label: left!.label, slot: slotOf(slots, left!.role) },
    { x: rightX, y: top, w, h, label: right!.label, slot: slotOf(slots, right!.role) },
  ]

  const laneTop = top + h + 40
  const laneGap = 66
  const bottom = laneTop + laneGap * messages.length
  const leftLine = leftX + w / 2
  const rightLine = rightX + w / 2

  const arrows: Arrow[] = [
    { points: [[leftLine, top + h], [leftLine, bottom]], slot: boxes[0]!.slot },
    { points: [[rightLine, top + h], [rightLine, bottom]], slot: boxes[1]!.slot },
  ]

  const labels: FloatLabel[] = []
  messages.forEach((m, i) => {
    const y = laneTop + laneGap * i + laneGap / 2
    const from = m.dir === '>' ? leftLine : rightLine
    const to = m.dir === '>' ? rightLine - 8 : leftLine + 8
    arrows.push({ points: [[from, y], [to, y]], slot: i % 2, index: i + 1 })
    labels.push({ x: (leftLine + rightLine) / 2, y: y - 12, text: m.label, anchor: 'middle', style: 'plain' })
  })

  return { width: CARD_W, height: bottom + MARGIN, boxes, arrows, labels }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/card-layout.test.ts && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/card-layout.ts test/card-layout.test.ts
git commit -m "Sequence layout: two actors, numbered messages, lifelines"
```

---

### Task 5: Compare layout

**Files:**
- Modify: `src/core/card-layout.ts`
- Test: `test/card-layout.test.ts`

**Interfaces:**
- Consumes: `Layout2D`, `expectSaneGeometry` from Task 2.
- Produces: `layout()` handles `spec.layout === 'compare'`. Compare boxes carry `body`.

- [ ] **Step 1: Write the failing test**

Append to `test/card-layout.test.ts`:

```ts
import { parsePane } from '../src/core/card.js'

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
```

Then relax the label assertion in `expectSaneGeometry`, because a pane title is short but its body wraps in the renderer:

```ts
    expect(b.label.length * CHAR_W).toBeLessThanOrEqual(b.w - 24)
```

stays as is, since `label` holds only the pane title.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-layout.test.ts -t compare`
Expected: FAIL with "layout not implemented: compare".

- [ ] **Step 3: Write minimal implementation**

Add the `compare` case to the switch and this function:

```ts
function compare(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const panes = spec.panes ?? []
  const w = CARD_W - 2 * MARGIN
  const h = 150
  const gap = 34
  const boxes: Box[] = panes.map((p, i) => ({
    x: MARGIN, y: 40 + i * (h + gap), w, h,
    label: p.title, body: p.body, slot: slotOf(slots, p.role),
  }))
  const last = boxes.at(-1)!
  return { width: CARD_W, height: last.y + last.h + MARGIN, boxes, arrows: [], labels: [] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/card-layout.test.ts && npx tsc -p tsconfig.json`
Expected: PASS, all four layouts covered.

- [ ] **Step 5: Commit**

```bash
git add src/core/card-layout.ts test/card-layout.test.ts
git commit -m "Compare layout: two stacked panes, no arrows

A comparison has no flow, so it gets no connectors. That is the layout
the reference set uses when the point is a contrast rather than a path."
```

---

### Task 6: Themes and SVG rendering

**Files:**
- Create: `src/render/card-theme.ts`, `src/render/card.ts`
- Modify: `src/core/types.ts` (add `cards` to `Config`), `src/core/config.ts` (parse it)
- Test: `test/card-render.test.ts`

**Interfaces:**
- Consumes: `Layout2D`, `Box`, `Arrow`, `FloatLabel` from Task 2; `CardSpec` from Task 1.
- Produces: `THEMES: Record<ThemeName, Theme>`, `type ThemeName = 'neon' | 'plain'`, `renderSvg(l: Layout2D, theme: Theme): string`, and `Config.cards: { theme: ThemeName }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/card-render.test.ts
import { describe, expect, it } from 'vitest'
import { parseRole, roleSlots, type CardSpec } from '../src/core/card.js'
import { layout } from '../src/core/card-layout.js'
import { THEMES } from '../src/render/card-theme.js'
import { renderSvg } from '../src/render/card.js'

const spec: CardSpec = {
  layout: 'chain', title: 't', subtitle: 's', bullets: [],
  steps: [parseRole('you:You predict'), parseRole('ai:AI implements')],
  loop: 'sets the next level',
}
const svg = (theme: keyof typeof THEMES) => renderSvg(layout(spec, roleSlots(spec)), THEMES[theme])

describe('renderSvg', () => {
  it.each(['neon', 'plain'] as const)('%s produces one svg element', (theme) => {
    expect(svg(theme).match(/<svg/g)).toHaveLength(1)
  })

  it.each(['neon', 'plain'] as const)('%s reaches the network nowhere', (theme) => {
    expect(svg(theme)).not.toMatch(/https?:\/\//)
    expect(svg(theme)).not.toMatch(/\bsrc=/)
  })

  it('renders every label', () => {
    expect(svg('neon')).toContain('You predict')
    expect(svg('neon')).toContain('sets the next level')
  })

  it('gives each role its own colour', () => {
    const out = svg('neon')
    const you = THEMES.neon.roles[0]!
    const ai = THEMES.neon.roles[1]!
    expect(out).toContain(you)
    expect(out).toContain(ai)
    expect(you).not.toBe(ai)
  })

  it('escapes text instead of letting it become markup', () => {
    const hostile: CardSpec = { ...spec, steps: [parseRole('a:<script>x</script>'), parseRole('b:ok')] }
    const out = renderSvg(layout(hostile, roleSlots(hostile)), THEMES.neon)
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('offers three role colours and no more, matching the role cap', () => {
    for (const theme of Object.values(THEMES)) expect(theme.roles).toHaveLength(3)
  })

  it('changes colour without moving anything', () => {
    const coords = (out: string) => out.match(/<rect[^>]*\/>/g)!.map((r) =>
      r.replace(/(fill|stroke|filter)="[^"]*"/g, ''))
    expect(coords(svg('neon'))).toEqual(coords(svg('plain')))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-render.test.ts`
Expected: FAIL, cannot resolve `../src/render/card-theme.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/render/card-theme.ts
export type ThemeName = 'neon' | 'plain'

export interface Theme {
  name: ThemeName
  bg: string
  panel: string
  ink: string
  muted: string
  /** One colour per role slot. Exactly three, matching the role cap in core/card.ts. */
  roles: [string, string, string]
  accent: string
  glow: boolean
}

export const THEMES: Record<ThemeName, Theme> = {
  neon: {
    name: 'neon',
    bg: '#0e1320', panel: '#12192a', ink: '#f1f5f9', muted: '#8798ad',
    roles: ['#22d3ee', '#a78bfa', '#34d399'],
    accent: '#f472b6', glow: true,
  },
  plain: {
    name: 'plain',
    bg: '#fbfaf8', panel: '#ffffff', ink: '#1c1a17', muted: '#6f6960',
    roles: ['#3a6b4f', '#5f5e5a', '#9a5b2c'],
    accent: '#9a5b2c', glow: false,
  },
}

export function themeByName(name: string | undefined): Theme {
  return THEMES[(name as ThemeName) in THEMES ? (name as ThemeName) : 'neon']
}
```

```ts
// src/render/card.ts
import type { Arrow, Box, FloatLabel, Layout2D } from '../core/card-layout.js'
import type { Theme } from './card-theme.js'

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const colour = (theme: Theme, slot: number): string =>
  slot < 0 ? theme.accent : theme.roles[slot % theme.roles.length]!

export function renderSvg(l: Layout2D, theme: Theme): string {
  const parts: string[] = []
  parts.push(
    `<svg viewBox="0 0 ${l.width} ${l.height}" role="img" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    ...theme.roles.concat(theme.accent).map((c, i) =>
      `<marker id="tip${i}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
      `<path d="M1 1 L8 5 L1 9" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>`),
    '</defs>',
  )

  for (const a of l.arrows) parts.push(arrow(a, theme))
  for (const b of l.boxes) parts.push(box(b, theme))
  for (const t of l.labels) parts.push(label(t, theme))

  parts.push('</svg>')
  return parts.join('')
}

function markerFor(theme: Theme, slot: number): number {
  return slot < 0 ? theme.roles.length : slot % theme.roles.length
}

function arrow(a: Arrow, theme: Theme): string {
  const c = colour(theme, a.slot)
  const d = a.curved
    ? `M${a.points[0]![0]} ${a.points[0]![1]} C ${a.points[1]![0]} ${a.points[1]![1]}, ` +
      `${a.points[2]![0]} ${a.points[2]![1]}, ${a.points[3]![0]} ${a.points[3]![1]}`
    : a.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const glow = theme.glow ? ` filter="drop-shadow(0 0 5px ${c}88)"` : ''
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"` +
    ` marker-end="url(#tip${markerFor(theme, a.slot)})"${glow}/>`
}

function box(b: Box, theme: Theme): string {
  const c = colour(theme, b.slot)
  const glow = theme.glow ? ` filter="drop-shadow(0 0 6px ${c}8c)"` : ''
  const title = b.body
    ? `<text x="${b.x + 28}" y="${b.y + 46}" fill="${c}" font-size="26" font-weight="700">${esc(b.label)}</text>` +
      `<text x="${b.x + 28}" y="${b.y + 84}" fill="${theme.ink}" font-size="19">${esc(b.body)}</text>`
    : `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 8}" fill="${theme.ink}" font-size="21" font-weight="700" text-anchor="middle">${esc(b.label)}</text>`
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="${theme.panel}" stroke="${c}" stroke-width="2"${glow}/>${title}`
}

function label(t: FloatLabel, theme: Theme): string {
  const style = t.style === 'script'
    ? `fill="${theme.accent}" font-size="19" font-weight="600" font-style="italic"`
    : `fill="${theme.muted}" font-size="17"`
  return `<text x="${t.x}" y="${t.y}" text-anchor="${t.anchor}" ${style}>${esc(t.text)}</text>`
}
```

Then add the config field. In `src/core/types.ts`, inside `Config`:

```ts
  /** Card appearance. See render/card-theme.ts. */
  cards: { theme: string }
```

and in `DEFAULT_CONFIG`:

```ts
  cards: { theme: 'neon' },
```

In `src/core/config.ts`, inside the object `loadConfig` returns:

```ts
      cards: {
        theme:
          typeof (parsed.cards as { theme?: unknown } | undefined)?.theme === 'string'
            ? (parsed.cards as { theme: string }).theme
            : DEFAULT_CONFIG.cards.theme,
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS, including the existing config tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/card-theme.ts src/render/card.ts src/core/types.ts src/core/config.ts test/card-render.test.ts
git commit -m "Card themes and SVG rendering

Two palettes, neon by default. A theme changes colour and stroke only,
never the geometry, so the same card carries the same information either
way. Each theme offers exactly three role colours, which is the role cap
from core/card.ts expressed as a type."
```

---

### Task 7: The page shell

**Files:**
- Create: `templates/card.html`
- Modify: `src/render/card.ts`
- Test: `test/card-render.test.ts`

**Interfaces:**
- Consumes: `renderSvg`, `Theme` from Task 6; `CardSpec` from Task 1.
- Produces: `renderCard(spec: CardSpec, l: Layout2D, theme: Theme): string` returning a complete HTML document.

- [ ] **Step 1: Write the failing test**

Append to `test/card-render.test.ts`:

```ts
import { parseBullet } from '../src/core/card.js'
import { renderCard } from '../src/render/card.js'

const full: CardSpec = {
  layout: 'chain',
  title: "Predict before you're told",
  subtitle: 'The gap between your guess and what was true is worth writing down.',
  bullets: [parseBullet('You take a position|before the answer exists'), parseBullet('Plain one')],
  close: 'Without predicting first, reviewing finished code teaches you almost nothing.',
  steps: [parseRole('you:You predict'), parseRole('ai:AI implements')],
}
const page = () => renderCard(full, layout(full, roleSlots(full)), THEMES.neon)

describe('renderCard', () => {
  it('produces a complete document with nothing left unfilled', () => {
    expect(page().startsWith('<!doctype html>')).toBe(true)
    expect(page()).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('renders title, subtitle and close', () => {
    expect(page()).toContain("Predict before you&#39;re told")
    expect(page()).toContain('worth writing down')
    expect(page()).toContain('teaches you almost nothing')
  })

  it('renders both halves of a two-tone bullet, and copes without a muted half', () => {
    expect(page()).toContain('You take a position')
    expect(page()).toContain('before the answer exists')
    expect(page()).toContain('Plain one')
  })

  it('omits the close block entirely when there is none', () => {
    const out = renderCard({ ...full, close: undefined }, layout(full, roleSlots(full)), THEMES.neon)
    expect(out).not.toContain('class="close"')
  })

  it('reaches the network nowhere', () => {
    expect(page()).not.toMatch(/https?:\/\//)
    expect(page()).not.toMatch(/<link\b|\bsrc=/)
  })

  it('paints the theme background explicitly, so it never borrows a host colour', () => {
    expect(page()).toContain(THEMES.neon.bg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-render.test.ts -t renderCard`
Expected: FAIL, `renderCard` is not exported.

- [ ] **Step 3: Write minimal implementation**

```html
<!-- templates/card.html -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{TITLE}}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; background: {{BG}}; }
  body { color: {{INK}}; padding: 3.5rem 2rem 3rem;
         font: 400 17px/1.6 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         -webkit-font-smoothing: antialiased; }
  .card { max-width: 1120px; margin: 0 auto; }
  h1 { margin: 0; font-size: clamp(2rem, 4.4vw, 3.1rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.05; }
  .sub { margin: 0.7rem 0 0; font-size: clamp(1rem, 1.7vw, 1.28rem); color: {{MUTED}}; }
  svg { display: block; width: 100%; height: auto; margin: 1.6rem 0 0; }
  ul { list-style: none; padding: 0; margin: 1.5rem 0 0; }
  li { display: flex; align-items: baseline; gap: 0.85rem; margin-bottom: 0.85rem; font-size: clamp(1rem, 1.65vw, 1.22rem); }
  li i { flex: none; width: 11px; height: 11px; border-radius: 50%; transform: translateY(-1px); }
  li span { color: {{MUTED}}; }
  .close { margin: 1.9rem 0 0; color: {{MUTED}}; font-size: clamp(1rem, 1.6vw, 1.18rem); }
</style>
</head>
<body>
<div class="card">
  <h1>{{TITLE}}</h1>
  <p class="sub">{{SUBTITLE}}</p>
  {{SVG}}
  {{BULLETS}}
  {{CLOSE}}
</div>
</body>
</html>
```

Append to `src/render/card.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CardSpec } from '../core/card.js'

/** Render a whole page. Everything is inline: the file must open offline, forever. */
export function renderCard(spec: CardSpec, l: Layout2D, theme: Theme): string {
  const bullets = spec.bullets.length
    ? '<ul>' +
      spec.bullets
        .map((b, i) => {
          const c = theme.roles[i % theme.roles.length]!
          const muted = b.muted ? ` <span>${esc(b.muted)}</span>` : ''
          return `<li><i style="background:${c}"></i><div>${esc(b.visible)}${muted}</div></li>`
        })
        .join('') +
      '</ul>'
    : ''

  return readFileSync(templatePath(), 'utf8')
    .replaceAll('{{TITLE}}', esc(spec.title))
    .replace('{{SUBTITLE}}', esc(spec.subtitle))
    .replace('{{SVG}}', renderSvg(l, theme))
    .replace('{{BULLETS}}', bullets)
    .replace('{{CLOSE}}', spec.close ? `<p class="close">${esc(spec.close)}</p>` : '')
    .replaceAll('{{BG}}', theme.bg)
    .replaceAll('{{INK}}', theme.ink)
    .replaceAll('{{MUTED}}', theme.muted)
}

function templatePath(): string {
  // dist/render/card.js -> ../../templates/card.html
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'card.html')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add templates/card.html src/render/card.ts test/card-render.test.ts
git commit -m "Card page shell: one self-contained file, no network"
```

---

### Task 8: The `spar card` command

**Files:**
- Create: `src/commands/card.ts`
- Modify: `src/cli.ts`, `src/core/paths.ts`, `package.json` (add `templates/card.html` is already covered by the `templates` entry in `files`)
- Test: `test/card-command.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1 and 6 and 7.
- Produces: `cmdCard(argv: CardArgs): number` where `CardArgs` is `{ layout: string; title: string; subtitle: string; bullets: string[]; close?: string; steps: string[]; loop?: string; from?: string; to: string[]; via?: string; actors: string[]; messages: string[]; panes: string[]; out?: string; open: boolean }`. Also `paths.cards()` and `paths.card(slug)`.

- [ ] **Step 1: Write the failing test**

```ts
// test/card-command.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^predict-first\.html$/)
  })

  it('re-rendering the same title replaces the file rather than piling up copies', () => {
    cmdCard(base)
    cmdCard({ ...base, subtitle: 'A different line' })
    expect(readdirSync(join(home, 'cards'))).toHaveLength(1)
    expect(readFileSync(join(home, 'cards', 'predict-first.html'), 'utf8')).toContain('A different line')
  })

  it('exits 1 and names the limit when there are too many steps', () => {
    const tooMany = { ...base, steps: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6'] }
    expect(cmdCard(tooMany)).toBe(1)
    expect(readdirSync(join(home, 'cards'), { withFileTypes: true })).toHaveLength(0)
  })

  it('exits 1 when a fourth role appears', () => {
    expect(cmdCard({ ...base, steps: ['a:1', 'b:2', 'c:3', 'd:4'] })).toBe(1)
  })

  it('rejects an unknown layout instead of guessing', () => {
    expect(cmdCard({ ...base, layout: 'mindmap' })).toBe(1)
  })

  it('works with no config at all, because explaining is not gated', () => {
    expect(cmdCard(base)).toBe(0)
  })

  it('honours --out', () => {
    const out = join(home, 'elsewhere.html')
    expect(cmdCard({ ...base, out })).toBe(0)
    expect(readFileSync(out, 'utf8')).toContain('Predict first')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-command.test.ts`
Expected: FAIL, cannot resolve `../src/commands/card.js`.

- [ ] **Step 3: Write minimal implementation**

In `src/core/paths.ts`, add to the `paths` object:

```ts
  cards: () => join(sparHome(), 'cards'),
  card: (slug: string) => join(sparHome(), 'cards', `${slug}.html`),
```

```ts
// src/commands/card.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import {
  CardError, parseBullet, parseMessage, parsePane, parseRole, roleSlots, validate,
  type CardSpec, type Layout,
} from '../core/card.js'
import { layout } from '../core/card-layout.js'
import { loadConfig } from '../core/config.js'
import { paths } from '../core/paths.js'
import { themeByName } from '../render/card-theme.js'
import { renderCard } from '../render/card.js'

export interface CardArgs {
  layout: string
  title: string
  subtitle: string
  bullets: string[]
  close?: string
  steps: string[]
  loop?: string
  from?: string
  to: string[]
  via?: string
  actors: string[]
  messages: string[]
  panes: string[]
  out?: string
  open: boolean
}

const LAYOUTS: Layout[] = ['chain', 'fanout', 'sequence', 'compare']

/**
 * `spar card`: one idea, one picture.
 *
 * Every limit here exits 1 rather than warning. A rule that lives only in a prompt
 * drifts, and a bigger card is less work than deciding what to leave out; a rule that
 * lives in code does not drift.
 */
export function cmdCard(args: CardArgs): number {
  try {
    if (!LAYOUTS.includes(args.layout as Layout)) {
      throw new CardError(`unknown layout "${args.layout}". Known: ${LAYOUTS.join(', ')}`)
    }

    const spec: CardSpec = {
      layout: args.layout as Layout,
      title: args.title,
      subtitle: args.subtitle,
      bullets: args.bullets.map(parseBullet),
      ...(args.close ? { close: args.close } : {}),
      ...(args.steps.length ? { steps: args.steps.map(parseRole) } : {}),
      ...(args.loop ? { loop: args.loop } : {}),
      ...(args.from ? { from: parseRole(args.from) } : {}),
      ...(args.to.length ? { to: args.to.map(parseRole) } : {}),
      ...(args.via ? { via: args.via } : {}),
      ...(args.actors.length ? { actors: args.actors.map(parseRole) } : {}),
      ...(args.messages.length ? { messages: args.messages.map(parseMessage) } : {}),
      ...(args.panes.length ? { panes: args.panes.map(parsePane) } : {}),
    }

    validate(spec)

    const theme = themeByName(loadConfig().cards.theme)
    const html = renderCard(spec, layout(spec, roleSlots(spec)), theme)
    const target = args.out ?? paths.card(slug(spec.title))

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, html, 'utf8')
    console.log(target)
    if (args.open) open(target)
    return 0
  } catch (error) {
    if (error instanceof CardError) {
      process.stderr.write(`spar card: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'card'
}

function open(file: string): void {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [file], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Printing the path is the contract; opening it is a convenience.
  }
}
```

In `src/cli.ts`, add the import and the case:

```ts
import { cmdCard } from './commands/card.js'
```

```ts
    case 'card':
      return cmdCard({
        layout: flags.string('layout') ?? '',
        title: required(flags.string('title'), '--title'),
        subtitle: required(flags.string('subtitle'), '--subtitle'),
        bullets: flags.all('bullet'),
        close: flags.string('close'),
        steps: flags.all('step'),
        loop: flags.string('loop'),
        from: flags.string('from'),
        to: flags.all('to'),
        via: flags.string('via'),
        actors: flags.all('actor'),
        messages: flags.all('msg'),
        panes: flags.all('card-pane'),
        out: flags.string('out'),
        open: !flags.bool('no-open'),
      })
```

And add to the `HELP` string, after the `spar dashboard` line:

```
  spar card --layout chain|fanout|sequence|compare --title <t> --subtitle <s> [...]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/card.ts src/cli.ts src/core/paths.ts test/card-command.test.ts
git commit -m "spar card: the command, with limits that exit 1"
```

---

### Task 9: Wire it into the two moments, and document it

**Files:**
- Modify: `src/commands/done.ts`, `src/hooks/due.ts`, `skills/spar/SKILL.md`, `README.md`
- Test: `test/card-command.test.ts` (integration assertions on the instruction text)

**Interfaces:**
- Consumes: the `spar card` surface from Task 8.
- Produces: no new exports. Behavioural change only.

- [ ] **Step 1: Write the failing test**

Append to `test/card-command.test.ts`:

```ts
import { readFileSync as read } from 'node:fs'
import { join as path } from 'node:path'

describe('the two moments that ask for a card', () => {
  it('spar done suggests a compare card for a misconception worth a picture', async () => {
    const { cmdDone } = await import('../src/commands/done.js')
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((s?: unknown) => { lines.push(String(s)) })
    cmdDone('no-such-session')
    expect(lines.join('\n')).toContain('spar card --layout compare')
  })

  it('the due hook asks for a card when the user cannot answer', () => {
    const src = read(path(process.cwd(), 'src/hooks/due.ts'), 'utf8')
    expect(src).toContain('spar card')
  })

  it('the skill tells the agent when a card is worth it', () => {
    const skill = read(path(process.cwd(), 'skills/spar/SKILL.md'), 'utf8')
    expect(skill).toContain('spar card')
    expect(skill).toMatch(/three or more moving parts/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/card-command.test.ts -t moments`
Expected: FAIL, none of the three strings is present.

- [ ] **Step 3: Write minimal implementation**

In `src/commands/done.ts`, inside the closing instruction array, after the `spar log` line:

```ts
      '',
      'If a misconception has three or more moving parts, a paragraph is the wrong shape.',
      'Draw it instead, then log it:',
      `  spar card --layout compare --title "<the concept>" --subtitle "<one line>" \\`,
      `    --card-pane "wrong:What you expected|<their model>" \\`,
      `    --card-pane "right:What is true|<the reality, and why>"`,
```

In `src/hooks/due.ts`, inside the injected context array, after the two `spar review` lines:

```ts
        '',
        'If they cannot answer and the concept has three or more moving parts, explain it',
        'with a card rather than a paragraph:',
        `  spar card --layout chain --title "${gap.concept}" --subtitle "<one line>" --step "..."`,
```

In `skills/spar/SKILL.md`, add a section before `## Honesty rules`:

```markdown
## When to draw instead of write

Reach for `spar card` when an explanation has three or more moving parts and would
otherwise be a paragraph. Below that, prose is faster and clearer.

```
spar card --layout chain|fanout|sequence|compare --title "..." --subtitle "..."
```

One idea per card. The command refuses more than five steps, more than three bullets,
and more than three distinct roles, so if it will not render, the answer is two cards
rather than a bigger one. Colour marks what something is, never which step it is:
`--step "you:You predict"` keeps `you` the same colour on every card you ever make.
```

In `README.md`, add a section after "Where you stand":

```markdown
## Explaining with a picture

```sh
spar card --layout chain --title "Predict before you're told" \
  --subtitle "The gap between your guess and what was true is worth writing down." \
  --step "you:You predict" --step "agent:AI implements" --step "you:You compare"
```

One idea per card, written to `~/.spar/cards/`. The limits are enforced rather than
suggested: more than five steps, more than three bullets, or a fourth colour role and the
command refuses to render. That is deliberate, because the whole value of a small picture
is that it stayed small.

`cards.theme` in `~/.spar/config.json` picks the look: `neon` (the default, dark with
outlined boxes) or `plain`.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npx tsc -p tsconfig.json && npx -y skills-ref@latest validate ./skills/spar`
Expected: PASS, tsc 0, skill still valid and under 500 lines.

- [ ] **Step 5: Commit**

```bash
git add src/commands/done.ts src/hooks/due.ts skills/spar/SKILL.md README.md test/card-command.test.ts
git commit -m "Ask for a card at the two moments that are about understanding

After the closing review and when a gap comes back, spar now nudges the
agent to draw rather than write when the concept has enough moving parts.
Everywhere else it stays available and unrequested."
```

---

## Verification after Task 9

Run once, by hand, because the geometry tests prove the maths and this proves the pixels:

```sh
npm run build
spar card --layout chain --title "Predict before you're told" \
  --subtitle "The gap between your guess and what was true is worth writing down." \
  --step "you:You predict" --step "agent:AI implements" --step "you:You compare" \
  --step "result:Gap logged" --loop "sets the next level" \
  --bullet "You take a position|before the answer exists" \
  --close "Without predicting first, reviewing finished code teaches you almost nothing."
```

Open it and check three things the tests cannot: the arc reads as a loop rather than a
bracket, the glow is present but not louder than the boxes, and nothing is cramped at four
steps. Then render the same content with `cards.theme` set to `plain` and confirm the
information survives the palette change.
