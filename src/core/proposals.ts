import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { paths } from './paths.js'

export interface Proposal {
  /** Absolute path the proposal is about. */
  file: string
  /** What the agent proposed, verbatim. */
  content: string
  /** 'skeleton' recorded automatically at level 2; 'chat' recorded by the agent at level 3. */
  source: 'skeleton' | 'chat'
  ts: string
}

function file(sessionId: string): string {
  return join(paths.stateDir(), `${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}-proposals.json`)
}

/**
 * What the agent proposed, written down at the moment it proposed it.
 *
 * Recorded rather than remembered on purpose: a level 3 task runs for twenty minutes,
 * and by the time the user is done the agent's context may have been compacted. A
 * review that compares your code against a hazy recollection is the soft, agreeable
 * kind that makes the whole exercise worthless.
 */
export function readProposals(sessionId: string): Proposal[] {
  try {
    const parsed = JSON.parse(readFileSync(file(sessionId), 'utf8')) as Proposal[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function addProposal(sessionId: string, proposal: Proposal): void {
  try {
    const existing = readProposals(sessionId).filter((p) => p.file !== proposal.file)
    mkdirSync(paths.stateDir(), { recursive: true })
    writeFileSync(file(sessionId), JSON.stringify([...existing, proposal], null, 2) + '\n', 'utf8')
  } catch {
    // Recording is best-effort; never let it break a write.
  }
}

export function clearProposals(sessionId: string): void {
  try {
    rmSync(file(sessionId), { force: true })
  } catch {
    /* nothing to clean up */
  }
}
