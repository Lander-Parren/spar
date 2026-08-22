import { describe, expect, it } from 'vitest'
import { GUIDE, section, sections } from '../src/core/guide.js'

describe('guide', () => {
  it('reads the sections out of the shipped skill', () => {
    const all = sections()
    expect(all.size).toBeGreaterThan(3)
    for (const [slug, body] of all) {
      expect(slug).toMatch(/^[a-z0-9-]+$/)
      expect(body.trim().length).toBeGreaterThan(0)
    }
  })

  /**
   * The guarantee this whole module exists for. Hooks point at a section by slug, so a
   * renamed heading must break the build rather than send someone to a page that is not
   * there.
   */
  it.each(Object.entries(GUIDE))('the %s topic resolves to a real section', (_name, slug) => {
    expect(section(slug)).toBeDefined()
  })

  it('every topic a hook points at carries usable instruction, not a stub', () => {
    for (const slug of Object.values(GUIDE)) {
      expect(section(slug)!.split('\n').length).toBeGreaterThan(3)
    }
  })

  it('returns nothing for a slug that does not exist', () => {
    expect(section('no-such-section')).toBeUndefined()
  })

  it('the closing review explains all three kinds, which only lived in the CLI before', () => {
    const review = section(GUIDE.review)!
    for (const kind of ['misconception', 'typo-bug', 'improvement']) {
      expect(review).toContain(kind)
    }
  })

  it('handing work back states the test-first rule', () => {
    expect(section(GUIDE.handover)!).toMatch(/fail/i)
  })
})
