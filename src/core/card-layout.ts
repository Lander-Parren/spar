import { NEUTRAL, type CardSpec } from './card.js'

/** Fixed canvas width, so every card in a set reads at the same scale. */
export const CARD_W = 1120
export const MARGIN = 40
/** Average glyph advance at the card label size. Used to size boxes to their text. */
export const CHAR_W = 11

export interface Box {
  x: number; y: number; w: number; h: number
  label: string
  /** Compare panes carry a second line; every other layout leaves this unset. */
  body?: string
  slot: number
}

export interface Arrow {
  points: [number, number][]
  slot: number
  curved?: boolean
  /** 1-based position, set only on sequence messages so the renderer can number them. */
  index?: number
}

export interface FloatLabel {
  x: number; y: number; text: string
  anchor: 'start' | 'middle' | 'end'
  style: 'plain' | 'script'
}

export interface Layout2D {
  width: number; height: number
  boxes: Box[]; arrows: Arrow[]; labels: FloatLabel[]
}

const slotOf = (slots: Map<string, number>, role: string): number =>
  slots.get(role) ?? slots.get(NEUTRAL) ?? 0

/**
 * Turn a validated card into coordinates.
 *
 * Knows nothing about colour, fonts or themes. That separation is what makes the
 * geometry, which is where diagrams actually fail, a pure function with unit tests
 * rather than something a person has to eyeball.
 */
export function layout(spec: CardSpec, slots: Map<string, number>): Layout2D {
  switch (spec.layout) {
    case 'chain':
      return chain(spec, slots)
    case 'fanout':
      return fanout(spec, slots)
    case 'sequence':
      return sequence(spec, slots)
    case 'compare':
      return compare(spec, slots)
    default:
      throw new Error(`layout not implemented: ${spec.layout}`)
  }
}

function chain(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const steps = spec.steps ?? []
  const hasLoop = Boolean(spec.loop)
  // 40 rather than 60: at five steps a wider gap leaves too little room for a label
  // like "AI implements", and the canvas width is fixed on purpose.
  const gap = 40
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

  // The receivers hang off a shared bar rather than off the source directly: that is
  // what says "any of these", instead of "these three specific things".
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

  // Lifelines first, so a message drawn later sits on top of them.
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

function compare(spec: CardSpec, slots: Map<string, number>): Layout2D {
  const panes = spec.panes ?? []
  const w = CARD_W - 2 * MARGIN
  const h = 118
  const gap = 30
  // No connectors: a comparison has no flow, and an arrow between two contrasted
  // things would claim a relationship that is not there.
  const boxes: Box[] = panes.map((p, i) => ({
    x: MARGIN, y: 40 + i * (h + gap), w, h,
    label: p.title, body: p.body, slot: slotOf(slots, p.role),
  }))
  const last = boxes.at(-1)!
  return { width: CARD_W, height: last.y + last.h + MARGIN, boxes, arrows: [], labels: [] }
}
