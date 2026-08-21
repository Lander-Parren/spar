import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AGENTS, hooksFile, serialize, type AgentName } from '../core/hookconfig.js'

/**
 * Where each generated artefact lives, relative to the repository root.
 *
 * Claude Code and Agent Plugins disagree about layout — Claude Code wants
 * hooks/hooks.json at the plugin root, Agent Plugins wants client-specific files under
 * a reverse-domain namespace — so the same content is written to both. Generated, not
 * copied by hand, so they cannot drift apart.
 */
export const ARTEFACTS: { path: string; agent: AgentName }[] = [
  { path: join('hooks', 'hooks.json'), agent: 'claude-code' },
  { path: join('com.anthropic.claude-code', 'hooks', 'hooks.json'), agent: 'claude-code' },
  { path: join('com.cursor', 'hooks', 'hooks.json'), agent: 'cursor' },
]

export function artefactContent(agent: AgentName): string {
  return serialize(hooksFile(agent))
}

/** `spar emit --root <dir>` — regenerate the checked-in hook configs. */
export function cmdEmit(root: string): number {
  for (const { path, agent } of ARTEFACTS) {
    const target = join(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, artefactContent(agent), 'utf8')
    console.log(`wrote ${path}`)
  }
  console.log(`\n${AGENTS.length} agents, ${ARTEFACTS.length} files, one definition.`)
  return 0
}
