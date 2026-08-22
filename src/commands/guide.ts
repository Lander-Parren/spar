import { GUIDE, section, sections } from '../core/guide.js'

/**
 * `spar guide [topic]` — print a section of the skill.
 *
 * For agents that cannot load skills. The text comes out of the shipped SKILL.md, so
 * there is one source and two ways to deliver it, and the two cannot drift apart.
 */
export function cmdGuide(topic: string | undefined): number {
  if (!topic) {
    console.log('spar guide <topic>\n')
    for (const slug of sections().keys()) {
      const pointed = Object.values(GUIDE).includes(slug as never)
      console.log(`  ${slug}${pointed ? '' : '  (background)'}`)
    }
    return 0
  }

  const body = section(topic)
  if (!body) {
    console.log(`spar: no section "${topic}". Known: ${[...sections().keys()].join(', ')}`)
    return 1
  }
  console.log(body)
  return 0
}
