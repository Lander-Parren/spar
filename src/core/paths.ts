import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * All spar state lives in one place, shared across every agent.
 *
 * Deliberately NOT the Agent Plugins `PLUGIN_DATA` directory: that is per-client,
 * which would give you a separate gap log in Claude Code and in Cursor. One log,
 * one calibration curve, regardless of which agent you happened to use that day.
 *
 * SPAR_HOME exists so tests never touch the real store.
 */
export function sparHome(): string {
  return process.env.SPAR_HOME ?? join(homedir(), '.spar')
}

export const paths = {
  home: sparHome,
  config: () => join(sparHome(), 'config.json'),
  gaps: () => join(sparHome(), 'gaps.jsonl'),
  focus: () => join(sparHome(), 'focus.json'),
  dashboard: () => join(sparHome(), 'dashboard.html'),
  state: (sessionId: string) => join(sparHome(), 'state', `${sanitize(sessionId)}.json`),
  stateDir: () => join(sparHome(), 'state'),
}

/** Session ids come from the agent; never let one escape into a path. */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128) || 'unknown'
}
