import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * The sections hooks point at, by slug.
 *
 * A hook message says what happened and names the section that says what to do about it.
 * Keeping the procedure in the skill rather than in a string array here means it can be
 * read by any skills-capable client, and changed without a release. A test asserts every
 * slug below resolves, so renaming a heading breaks the build instead of sending someone
 * to a section that is not there.
 */
export const GUIDE = {
  loop: 'the-loop',
  review: 'the-closing-review',
  handover: 'handing-work-back',
  returning: 'when-a-gap-comes-back',
  logging: 'what-goes-in-the-log',
  triviality: 'when-not-to-use-this',
} as const

export function sections(): Map<string, string> {
  const out = new Map<string, string>()
  let slug: string | undefined
  let body: string[] = []

  const flush = (): void => {
    if (slug) out.set(slug, body.join('\n').trim())
    body = []
  }

  for (const line of read().split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      slug = slugify(heading[1]!)
      continue
    }
    if (slug) body.push(line)
  }
  flush()
  return out
}

export function section(slug: string): string | undefined {
  return sections().get(slug)
}

function slugify(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function read(): string {
  // dist/core/guide.js -> ../../skills/spar/SKILL.md
  const here = dirname(fileURLToPath(import.meta.url))
  return readFileSync(join(here, '..', '..', 'skills', 'spar', 'SKILL.md'), 'utf8')
}
