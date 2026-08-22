import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

interface Entry {
  name: string
  source: unknown
  description: string
  license?: string
}

const manifest = JSON.parse(
  readFileSync(new URL('../.claude-plugin/marketplace.json', import.meta.url), 'utf8'),
) as { name: string; plugins: Entry[] }

const entry = (name: string) => manifest.plugins.find((p) => p.name === name)!

describe('the marketplace manifest', () => {
  it('offers spar from this repository', () => {
    expect(entry('spar').source).toBe('./')
  })

  it('offers humanizer from its own repository, pinned', () => {
    const source = entry('humanizer').source as { source: string; url: string; sha: string }
    expect(source.url).toBe('https://github.com/blader/humanizer.git')
    // Pinned rather than tracking main. An unpinned third-party plugin that updates
    // itself is a supply chain someone else controls.
    expect(source.sha).toMatch(/^[0-9a-f]{40}$/)
  })

  /**
   * humanizer is MIT, and MIT requires the copyright notice to travel with it. Listing
   * it without the attribution would be a licence violation, so a test holds the credit
   * in place rather than a comment nobody reads.
   */
  it('credits humanizer to its author', () => {
    const { description, license } = entry('humanizer')
    expect(license).toBe('MIT')
    expect(description).toContain('Siqi Chen')
    expect(description).toContain('https://github.com/blader/humanizer')
  })

  it('does not vendor humanizer into this repo', () => {
    // The whole point of listing it: it stays its author's, and it stays current.
    expect(() =>
      readFileSync(new URL('../skills/humanizer/SKILL.md', import.meta.url)),
    ).toThrow()
  })
})
