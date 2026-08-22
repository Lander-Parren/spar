import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { CardSpec } from '../core/card.js'
import type { Arrow, Box, FloatLabel, Layout2D } from '../core/card-layout.js'
import type { Theme } from './card-theme.js'

export function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Slot -1 means the loose arc, which uses the accent rather than a role colour. */
const colour = (theme: Theme, slot: number): string =>
  slot < 0 ? theme.accent : theme.roles[slot % theme.roles.length]!

const markerFor = (theme: Theme, slot: number): number =>
  slot < 0 ? theme.roles.length : slot % theme.roles.length

export function renderSvg(l: Layout2D, theme: Theme): string {
  const parts: string[] = [
    // No xmlns: this SVG is always embedded in HTML, where the parser assigns the
    // namespace itself. Leaving it out keeps "no http(s) anywhere in the output" a
    // crisp assertion instead of one with an exception carved into it.
    `<svg viewBox="0 0 ${l.width} ${l.height}" role="img">`,
    '<defs>',
    ...[...theme.roles, theme.accent].map(
      (c, i) =>
        `<marker id="tip${i}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
        `<path d="M1 1 L8 5 L1 9" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></marker>`,
    ),
    '</defs>',
  ]

  for (const a of l.arrows) parts.push(arrow(a, theme))
  for (const b of l.boxes) parts.push(box(b, theme))
  for (const t of l.labels) parts.push(label(t, theme))

  parts.push('</svg>')
  return parts.join('')
}

function arrow(a: Arrow, theme: Theme): string {
  const c = colour(theme, a.slot)
  const p = a.points
  const d = a.curved
    ? `M${p[0]![0]} ${p[0]![1]} C ${p[1]![0]} ${p[1]![1]}, ${p[2]![0]} ${p[2]![1]}, ${p[3]![0]} ${p[3]![1]}`
    : p.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ')
  const glow = theme.glow ? ` filter="drop-shadow(0 0 5px ${c}88)"` : ''
  return (
    `<path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"` +
    ` marker-end="url(#tip${markerFor(theme, a.slot)})"${glow}/>`
  )
}

function box(b: Box, theme: Theme): string {
  const c = colour(theme, b.slot)
  const glow = theme.glow ? ` filter="drop-shadow(0 0 6px ${c}8c)"` : ''
  const text = b.body
    ? `<text x="${b.x + 28}" y="${b.y + 46}" fill="${c}" font-size="26" font-weight="700">${esc(b.label)}</text>` +
      `<text x="${b.x + 28}" y="${b.y + 84}" fill="${theme.ink}" font-size="19">${esc(b.body)}</text>`
    : `<text x="${b.x + b.w / 2}" y="${b.y + b.h / 2 + 8}" fill="${theme.ink}" font-size="21" font-weight="700" text-anchor="middle">${esc(b.label)}</text>`
  return (
    `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14" fill="${theme.panel}"` +
    ` stroke="${c}" stroke-width="2"${glow}/>${text}`
  )
}

function label(t: FloatLabel, theme: Theme): string {
  const style =
    t.style === 'script'
      ? `fill="${theme.accent}" font-size="19" font-weight="600" font-style="italic"`
      : `fill="${theme.muted}" font-size="17"`
  return `<text x="${t.x}" y="${t.y}" text-anchor="${t.anchor}" ${style}>${esc(t.text)}</text>`
}

/**
 * Render a whole page.
 *
 * Everything is inline. The file has to open offline, from a double click, years from
 * now, which rules out a CDN, a web font and a chart library alike.
 */
export function renderCard(spec: CardSpec, l: Layout2D, theme: Theme): string {
  const bullets = spec.bullets.length
    ? '<ul>' +
      spec.bullets
        .map((b, i) => {
          // Dots follow the role slots, so the list is tied to the picture rather than
          // decorated with colour that means nothing.
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
