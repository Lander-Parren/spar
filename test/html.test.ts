import { describe, expect, it } from 'vitest'
import { renderHtml } from '../src/render/html.js'
import { aggregate } from '../src/core/aggregate.js'
import type { Gap } from '../src/core/types.js'
import type { SparEvent } from '../src/core/events.js'

const NOW = new Date('2026-08-21T12:00:00Z')

function gap(patch: Partial<Gap> = {}): Gap {
  return {
    id: 'g-1', ts: '2026-08-18T00:00:00Z', project: 'api', task: 't', agent: 'cli',
    session: 's1', level: 1, kind: 'misconception', your_model: 'a', reality: 'b',
    concept: 'orm', box: 1, due: '2026-08-21', hits: 0, misses: 0, ...patch,
  }
}

const predict: SparEvent = { ts: '2026-08-18T09:00:00Z', type: 'predict', session: 's1', level: 1, blanks: 0, concepts: [] }

const render = (gaps: Gap[], events: SparEvent[] = [predict]) =>
  renderHtml(aggregate(gaps, events, [], NOW), NOW)

describe('renderHtml', () => {
  it('produces a complete document with the data embedded', () => {
    const html = render([gap()])
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toContain('{{STATS}}')
    expect(html).not.toContain('{{GENERATED}}')
    expect(html).toContain('orm')
  })

  it('reaches the network nowhere — no cdn, no font, no fetch', () => {
    const html = render([gap()])
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/\bsrc\s*=/)
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/)
    expect(html).not.toMatch(/<link\b/)
  })

  it('cannot be broken out of by a concept name containing a script tag', () => {
    const html = render([gap({ concept: '</script><img onerror=alert(1)>' })])
    const body = html.slice(html.indexOf('const STATS'))
    // The literal closing tag must not survive into the script block.
    expect(body.slice(0, body.indexOf('\n'))).not.toContain('</script>')
    expect(html).toContain('\\u003c/script\\u003e')
    // Exactly one script element, so nothing was injected alongside it.
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it('renders an empty history without throwing or showing NaN', () => {
    const html = renderHtml(aggregate([], [], [], NOW), NOW)
    expect(html).not.toContain('NaN')
    expect(html).toContain('No predictions recorded yet')
  })

  it('carries incidents through so the detail view has something to show', () => {
    const html = render([gap({ your_model: 'repository opens it', reality: 'unit-of-work does' })])
    expect(html).toContain('repository opens it')
    expect(html).toContain('unit-of-work does')
  })

  it('marks a focused concept in the embedded data', () => {
    const html = renderHtml(aggregate([gap()], [predict], ['orm'], NOW), NOW)
    expect(html).toContain('"focused":true')
  })
})
