import { describe, expect, it } from 'vitest'
import { renderHtml } from '../src/render/html.js'
import { aggregate } from '../src/core/aggregate.js'
import type { Gap } from '../src/core/types.js'
import type { SparEvent } from '../src/core/events.js'

const NOW = new Date('2026-08-21T12:00:00Z')

function gap(patch: Partial<Gap> = {}): Gap {
  return {
    id: 'g-1', ts: '2026-08-18T00:00:00Z', project: 'api', task: 't', agent: 'cli',
    session: 's1', level: 1, kind: 'misconception',
    your_model: 'the repository decides the transaction boundary',
    reality: 'the unit-of-work does', concept: 'transaction boundaries in an ORM',
    box: 1, due: '2026-08-21', hits: 0, misses: 0, ...patch,
  }
}

const predict = (session: string, ts: string): SparEvent =>
  ({ ts, type: 'predict', session, level: 1, blanks: 0, concepts: [] })

const EVENTS = [predict('s1', '2026-08-18T09:00:00Z'), predict('s2', '2026-08-18T10:00:00Z')]
const render = (gaps: Gap[], focused: string[] = []) =>
  renderHtml(aggregate(gaps, EVENTS, focused, NOW), NOW)

/** Everything readable must survive with scripting removed entirely. */
function withoutScripts(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '')
}

describe('renderHtml', () => {
  it('produces a complete document with nothing left unfilled', () => {
    const html = render([gap()])
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/\{\{[A-Z]+\}\}/)
  })

  it('reaches the network nowhere', () => {
    const html = render([gap()])
    expect(html).not.toMatch(/https?:\/\//)
    expect(html).not.toMatch(/\bsrc\s*=/)
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/)
    expect(html).not.toMatch(/<link\b/)
  })

  describe('with every script removed', () => {
    const bare = withoutScripts(render([gap(), gap({ id: 'g-2', concept: 'service lifetimes', box: 4 })]))

    it('still shows the calibration figures', () => {
      expect(bare).toContain('2026-08-17')  // the week bucket
      expect(bare).toContain('50%')          // 1 of 2 predictions clean
      expect(bare).toContain('1/2')
    })

    it('still draws both charts as markup', () => {
      expect(bare.match(/<svg/g)?.length).toBe(2)
      expect(bare).toContain('<path')
      expect(bare).toContain('<rect')
    })

    it('still lists every concept, with its counts', () => {
      expect(bare).toContain('transaction boundaries in an ORM')
      expect(bare).toContain('service lifetimes')
      expect(bare).toContain('box 1.0')
    })

    it('still contains the incidents behind each concept', () => {
      expect(bare).toContain('the repository decides the transaction boundary')
      expect(bare).toContain('the unit-of-work does')
    })

    it('still offers a way to focus a concept', () => {
      expect(bare).toContain('spar focus &quot;transaction boundaries in an ORM&quot;')
    })

    it('still shows the tool-health numbers', () => {
      expect(bare).toContain('predictions')
      expect(bare).toContain('due now')
    })

    it('expands without script, via details/summary', () => {
      expect(bare).toContain('<details class="concept"')
      expect(bare).toContain('<summary>')
    })
  })

  it('escapes a concept that contains markup instead of rendering it', () => {
    const html = render([gap({ concept: '</summary><img onerror=alert(1)>' })])
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img onerror')
    expect(html.match(/<script/g)).toHaveLength(1)
  })

  it('renders an empty history without NaN or a broken layout', () => {
    const html = renderHtml(aggregate([], [], [], NOW), NOW)
    expect(html).not.toContain('NaN')
    expect(html).toContain('No predictions recorded yet')
    expect(html).toContain('No gaps logged yet')
  })

  it('marks and opens a focused concept', () => {
    const html = render([gap()], ['transaction boundaries in an ORM'])
    expect(html).toContain('<details class="concept" open>')
    expect(html).toContain('★')
  })
})
