import type { EventKind } from '../adapters/types.js'

/**
 * The one place spar's hooks are defined.
 *
 * Three artefacts need this list — the installer that merges into a user's settings,
 * the Agent Plugins namespace directories, and Claude Code's own plugin layout — and
 * they must never disagree. Generating all three from here turns a future "it works in
 * Claude Code but is silent in Cursor" bug into a failing test.
 */
export interface HookSpec {
  hook: 'gate' | 'skeleton' | 'boundary' | 'due'
  kind: EventKind
  /** Which tools the hook applies to. Cursor takes it as a filter, Claude Code as a matcher. */
  matcher: string
  timeout: number
}

export const HOOKS: HookSpec[] = [
  { hook: 'gate', kind: 'pre-tool', matcher: 'Write|Edit|MultiEdit', timeout: 5 },
  { hook: 'skeleton', kind: 'post-tool', matcher: 'Write|Edit|MultiEdit', timeout: 5 },
  { hook: 'boundary', kind: 'prompt', matcher: '*', timeout: 5 },
  { hook: 'due', kind: 'session-start', matcher: '*', timeout: 10 },
]

export const AGENTS = ['claude-code', 'cursor'] as const
export type AgentName = (typeof AGENTS)[number]

const EVENT_NAMES: Record<AgentName, Record<EventKind, string>> = {
  'claude-code': {
    'pre-tool': 'PreToolUse',
    'post-tool': 'PostToolUse',
    prompt: 'UserPromptSubmit',
    'session-start': 'SessionStart',
  },
  cursor: {
    'pre-tool': 'preToolUse',
    'post-tool': 'postToolUse',
    prompt: 'beforeSubmitPrompt',
    'session-start': 'sessionStart',
  },
}

/** Every command spar owns starts with this, which is how the installer finds its own again. */
export const OWNED = 'spar hook '

export function command(spec: HookSpec, agent: AgentName): string {
  return `${OWNED}${spec.hook} --agent ${agent}`
}

export function eventName(kind: EventKind, agent: AgentName): string {
  return EVENT_NAMES[agent][kind]
}

/** The `hooks` object, in each agent's own shape. */
export function hooksObject(agent: AgentName): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {}
  for (const spec of HOOKS) {
    const event = eventName(spec.kind, agent)
    out[event] =
      agent === 'claude-code'
        ? [{ matcher: spec.matcher, hooks: [{ type: 'command', command: command(spec, agent), timeout: spec.timeout }] }]
        : // Cursor's own default, written out so it is visible: spar must never block
          // a user's work because spar itself failed.
          [{ command: command(spec, agent), timeout: spec.timeout, failClosed: false }]
  }
  return out
}

/** The complete file each agent expects on disk. */
export function hooksFile(agent: AgentName): Record<string, unknown> {
  const hooks = hooksObject(agent)
  return agent === 'claude-code'
    ? {
        description:
          "spar — predict before you're told. Inert until `spar setup --project <path>` names a project.",
        hooks,
      }
    : { version: 1, hooks }
}

export function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}
