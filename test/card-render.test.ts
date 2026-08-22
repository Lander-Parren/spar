import { describe, expect, it } from 'vitest'
import { parseBullet, parseRole, roleSlots, type CardSpec } from '../src/core/card.js'
import { layout } from '../src/core/card-layout.js'
import { THEMES } from '../src/render/card-theme.js'
import { renderCard, renderSvg } from '../src/render/card.js'

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
    const you = THEMES.neon.roles[0]
    const ai = THEMES.neon.roles[1]
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
    // Compare the geometry itself rather than scrubbed markup: what the spec promises
    // is that a theme cannot move a box, not that two strings happen to match.
    const geometry = (out: string) =>
      [...out.matchAll(/<rect ([^>]*)\/>/g)].map(([, attrs]) =>
        ['x', 'y', 'width', 'height', 'rx'].map((k) => attrs!.match(new RegExp(`\\b${k}="([^"]*)"`))?.[1]))
    expect(geometry(svg('neon'))).toEqual(geometry(svg('plain')))
    expect(geometry(svg('neon'))).toHaveLength(2)
  })
})

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
    expect(page()).toContain('Predict before you&#39;re told')
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
