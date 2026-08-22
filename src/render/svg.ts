import type { WeekPoint } from '../core/aggregate.js'

export const LEVEL_NAMES = ['rush', 'standard', 'skeleton', 'transcript'] as const

const pct = (v: number) => `${Math.round(v * 100)}%`

/**
 * Charts are generated here, in Node, not in the browser.
 *
 * The promise this file makes is that it opens in five years, offline, from a
 * double-click. A page that draws itself with script breaks that promise in every
 * viewer with a strict CSP or scripting disabled — which includes most sandboxed
 * previews and attachment viewers. So the numbers are static markup and script is
 * only ever an enhancement.
 */
export function calibrationChart(weeks: WeekPoint[]): string {
  if (weeks.length === 0) return '<p class="empty">No predictions recorded yet.</p>'

  const W = 720, H = 190, L = 38, R = 14, T = 14, B = 30
  const iw = W - L - R, ih = H - T - B
  const x = (i: number) => L + (weeks.length === 1 ? iw / 2 : (i / (weeks.length - 1)) * iw)
  const y = (v: number) => T + ih - v * ih

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      (v) =>
        `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)"/>` +
        `<text class="axis" x="${L - 7}" y="${y(v) + 3}" text-anchor="end">${pct(v)}</text>`,
    )
    .join('')

  const points = weeks.map((w, i) => [x(i), y(w.rate)] as const)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const area = `${line} L ${points.at(-1)![0]} ${y(0)} L ${points[0]![0]} ${y(0)} Z`

  const marks = weeks
    .map(
      (w, i) =>
        `<circle cx="${x(i)}" cy="${y(w.rate)}" r="3.5" fill="var(--accent)">` +
        `<title>${esc(w.week)}: ${w.clean}/${w.predictions} clean (${pct(w.rate)})</title></circle>` +
        `<text class="axis" x="${x(i)}" y="${H - 9}" text-anchor="middle">${esc(w.week.slice(5))}</text>`,
    )
    .join('')

  return (
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration by week">` +
    `${grid}<path d="${area}" fill="var(--accent-soft)"/>` +
    `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` +
    `${marks}</svg>` +
    weekTable(weeks) +
    (weeks.length < 3
      ? '<p class="note tail">Fewer than three weeks, so this line does not mean anything yet.</p>'
      : '')
  )
}

/** The same numbers in text, so the chart is never the only way to read them. */
function weekTable(weeks: WeekPoint[]): string {
  const rows = weeks
    .map(
      (w) =>
        `<tr><td>${esc(w.week)}</td><td class="num">${pct(w.rate)}</td>` +
        `<td class="num">${w.clean}/${w.predictions}</td>` +
        `<td class="num">${w.meanLevel.toFixed(1)}</td></tr>`,
    )
    .join('')
  return `<details class="figures"><summary>the same figures</summary>
    <table><thead><tr><th>Week</th><th class="num">Clean</th><th class="num">Of</th>
    <th class="num">Mean level</th></tr></thead><tbody>${rows}</tbody></table></details>`
}

export function levelsChart(weeks: WeekPoint[]): string {
  if (weeks.length === 0) return '<p class="empty">Nothing yet.</p>'

  const W = 720, H = 150, L = 38, R = 14, T = 12, B = 30
  const iw = W - L - R, ih = H - T - B
  const bw = Math.min(46, (iw / weeks.length) * 0.62)

  const bars = weeks
    .map((w, i) => {
      const cx = L + (iw / weeks.length) * (i + 0.5)
      let acc = 0
      const stack = ([3, 2, 1, 0] as const)
        .map((lvl) => {
          const n = w.levelCounts[lvl] ?? 0
          if (!n) return ''
          const h = (n / w.predictions) * ih
          const top = T + ih - acc - h
          acc += h
          return `<rect x="${cx - bw / 2}" y="${top}" width="${bw}" height="${h}" fill="var(--l${lvl})">
            <title>${esc(w.week)}: ${n} at level ${lvl} (${LEVEL_NAMES[lvl]})</title></rect>`
        })
        .join('')
      return `${stack}<text class="axis" x="${cx}" y="${H - 9}" text-anchor="middle">${esc(w.week.slice(5))}</text>`
    })
    .join('')

  const legend = [0, 1, 2, 3]
    .map((l) => `<span><i style="background:var(--l${l})"></i>${l} ${LEVEL_NAMES[l]}</span>`)
    .join('')

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Levels by week">${bars}</svg>
    <div class="legend">${legend}</div>`
}

export function esc(text: unknown): string {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
}
