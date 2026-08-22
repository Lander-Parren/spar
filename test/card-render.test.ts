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
