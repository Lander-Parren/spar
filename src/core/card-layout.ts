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
