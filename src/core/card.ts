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
/**
 * SVG text does not wrap, and wrapping it would let cards grow, which is the one thing
 * this command exists to prevent. So a body that will not fit on one line is refused.
 */
export const MAX_BODY = 90

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
  const all: Role[] = [
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

/**
 * Palette slot per role, assigned in order of first appearance.
 *
 * Stable across re-renders of the same card, which is what lets one word mean one
 * colour across a whole set: `you` stays the same colour on every card you make.
 */
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

/**
 * Reject anything over the limits, rather than warning about it.
 *
 * A rule that lives only in a prompt drifts, and a bigger card is less work than
 * deciding what to leave out. The whole value of a small picture is that it stayed
 * small, so the limit has to be the kind that stops you.
 */
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
      for (const pane of spec.panes ?? []) {
        if (pane.body.length > MAX_BODY) {
          throw new CardError(
            `pane body: at most ${MAX_BODY} characters, got ${pane.body.length}. ` +
              'Shorten it, or make it two cards.',
          )
        }
      }
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
