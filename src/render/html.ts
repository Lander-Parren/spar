import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { ConceptRow, Stats } from '../core/aggregate.js'
import { calibrationChart, esc, levelsChart } from './svg.js'

/**
 * Render the dashboard as one self-contained file.
 *
 * Everything readable is static markup: no CDN, no fonts, no chart library, no fetch,
 * and no dependence on script execution. Script only adds the multi-select focus bar,
 * so a viewer with a strict CSP still shows every number. Expanding a concept uses
 * <details>, which needs no script at all.
 */
export function renderHtml(stats: Stats, generated = new Date()): string {
  return readFileSync(templatePath(), 'utf8')
    .replace('{{GENERATED}}', esc(generated.toISOString().replace('T', ' ').slice(0, 16)))
    .replace('{{CALIBRATION}}', calibrationChart(stats.calibration))
    .replace('{{LEVELS}}', levelsChart(stats.calibration))
    .replace('{{CURRICULUM}}', curriculum(stats.concepts))
    .replace('{{HEALTH}}', health(stats))
}

function curriculum(concepts: ConceptRow[]): string {
  if (concepts.length === 0) return '<p class="empty">No gaps logged yet.</p>'
  const maxOpen = Math.max(...concepts.map((c) => c.open), 1)

  return concepts
    .map((row) => {
      const incidents = row.incidents
        .map(
          (inc) => `<div class="incident">
            <span class="when">${esc(inc.ts.slice(0, 10))}${inc.kind !== 'misconception' ? ` <em>${esc(inc.kind)}</em>` : ''}</span>
            <span>
              <span class="said"><span class="lbl">thought </span>${esc(inc.yourModel)}</span>
              <span class="said"><span class="lbl">actually </span>${esc(inc.reality)}</span>
            </span>
          </div>`,
        )
        .join('')

      return `<details class="concept"${row.focused ? ' open' : ''}>
        <summary>
          <span class="name">${row.focused ? '<span class="pin">★</span> ' : ''}${esc(row.concept)}</span>
          <span class="bar"><i style="width:${(row.open / maxOpen) * 100}%"></i></span>
          <span class="num">${row.open} / ${row.total}</span>
          <span class="num">box ${row.meanBox.toFixed(1)}</span>
          <span class="num when">${esc(row.lastSeen.slice(0, 10))}</span>
        </summary>
        <div class="body">
          ${incidents}
          <div class="focusline">
            <label class="pick"><input type="checkbox" data-concept="${esc(row.concept)}"${row.focused ? ' checked' : ''}> add to focus</label>
            <code>spar focus ${esc(JSON.stringify(row.concept))}</code>
          </div>
        </div>
      </details>`
    })
    .join('')
}

function health(stats: Stats): string {
  const { health: h, noIdea: n, totals: t, due: d } = stats
  const cards: { value: string; label: string; warn?: string }[] = [
    { value: p(h.rushRatio), label: 'rush', ...(h.rushRatio > 0.5 ? { warn: 'Over half. The friction is set too high — lower it.' } : {}) },
    { value: p(h.overrideRatio), label: 'overrides', ...(h.overrideRatio > 0.4 ? { warn: 'The thresholds disagree with you. Change them.' } : {}) },
    { value: p(h.trivialRatio), label: 'waved through', ...(h.trivialRatio > 0.7 ? { warn: 'Almost everything. Check the triviality criteria.' } : {}) },
    { value: p(n.ratio), label: '"no idea"', ...(n.ratio > 0.6 ? { warn: 'The material is above you. Learn the concept before gating on it.' } : {}) },
    { value: String(d.total), label: 'due now' },
    { value: String(t.predictions), label: 'predictions' },
  ]
  return cards
    .map(
      (c) =>
        `<div class="card${c.warn ? ' flag' : ''}"><b>${esc(c.value)}</b><span>${esc(c.label)}</span>` +
        `${c.warn ? `<em>${esc(c.warn)}</em>` : ''}</div>`,
    )
    .join('')
}

const p = (v: number) => `${Math.round(v * 100)}%`

function templatePath(): string {
  // dist/render/html.js -> ../../templates/dashboard.html
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates', 'dashboard.html')
}
