import { SILENT, obj, str, type Adapter, type EventKind, type NormalizedEvent, type RenderedDecision } from './types.js'

/**
 * Cursor hook contract (1.7+).
 *
 * Close to Claude Code's but not identical, and the differences are load-bearing:
 *
 *  - The stable key is `conversation_id`, except on sessionStart which carries
 *    `session_id` and no conversation id at all.
 *  - sessionStart has no `cwd`; it has `workspace_roots`.
 *  - A complaint after a write travels as `additional_context`, not as exit 2 —
 *    postToolUse has no blocking channel here.
 *
 * Each of those is rendered the way Cursor expects rather than flattened to a shared
 * subset, which is the whole reason adapters exist.
 */
export const cursor: Adapter = {
  name: 'cursor',

  parse(raw, kind): NormalizedEvent {
    const input = obj(raw.tool_input)
    const roots = Array.isArray(raw.workspace_roots) ? raw.workspace_roots : []
    return {
      kind,
      agent: 'cursor',
      sessionId: str(raw.session_id) ?? str(raw.conversation_id) ?? 'cursor',
      cwd: str(raw.cwd) ?? str(roots[0]) ?? process.cwd(),
      toolName: str(raw.tool_name),
      filePath: str(input.file_path) ?? str(input.path) ?? str(input.target_file),
      content: str(input.content) ?? str(input.new_string),
      prompt: str(raw.prompt),
    }
  },

  render(decision, kind): RenderedDecision {
    switch (decision.type) {
      case 'allow':
      case 'noop':
        // Silence, never an explicit "allow": spar must not widen the user's own
        // permission settings, only narrow them.
        return SILENT

      case 'deny':
        if (kind === 'prompt') {
          // beforeSubmitPrompt has no `permission`; it stops work with `continue: false`.
          return {
            stdout: JSON.stringify({ continue: false, user_message: decision.userMessage ?? decision.agentMessage }),
            stderr: '',
            exitCode: 0,
          }
        }
        return {
          stdout: JSON.stringify({
            permission: 'deny',
            agent_message: decision.agentMessage,
            user_message: decision.userMessage ?? 'spar: predict before you look.',
          }),
          stderr: '',
          exitCode: 0,
        }

      case 'context':
        return { stdout: JSON.stringify({ additional_context: decision.context }), stderr: '', exitCode: 0 }

      case 'feedback':
        // postToolUse cannot block here, so the complaint rides along as context.
        return {
          stdout: JSON.stringify({ additional_context: decision.message }),
          stderr: '',
          exitCode: 0,
        }
    }
  },
}
