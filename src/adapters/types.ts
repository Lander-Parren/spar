/**
 * The seam that makes spar portable.
 *
 * Everything in src/hooks/ speaks only these two types. Adapters translate to and
 * from each agent's own JSON. Adding an agent is one adapter file, not a rewrite —
 * and the gate's logic is written once, so the four clients cannot drift apart.
 */

export type EventKind = 'pre-tool' | 'post-tool' | 'prompt' | 'session-start'

export interface NormalizedEvent {
  kind: EventKind
  /** Which agent produced this, e.g. "claude-code". Recorded on logged gaps. */
  agent: string
  sessionId: string
  cwd: string
  /** pre-tool / post-tool only. */
  toolName?: string
  filePath?: string
  /** The text being written, when the agent exposes it. Used by the skeleton check. */
  content?: string
  /** The shell command, for tools that run one. The gate inspects it for file writes. */
  command?: string
  /** prompt only. */
  prompt?: string
}

export type NormalizedDecision =
  /** Stay out of the way. Never an active approval — see renderers. */
  | { type: 'allow' }
  | { type: 'deny'; agentMessage: string; userMessage?: string }
  /** Inject text into the agent's context, e.g. a due gap at session start. */
  | { type: 'context'; context: string }
  /** Complain after the fact so the agent can correct itself. */
  | { type: 'feedback'; message: string }
  | { type: 'noop' }

export interface RenderedDecision {
  stdout: string
  stderr: string
  exitCode: number
}

export interface Adapter {
  readonly name: string
  parse(raw: Record<string, unknown>, kind: EventKind): NormalizedEvent
  render(decision: NormalizedDecision, kind: EventKind): RenderedDecision
}

/** Shared by every adapter: silence, exit 0, change nothing. */
export const SILENT: RenderedDecision = { stdout: '', stderr: '', exitCode: 0 }

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function obj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
