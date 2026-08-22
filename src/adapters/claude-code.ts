import { SILENT, obj, str, type Adapter, type EventKind, type NormalizedDecision, type NormalizedEvent, type RenderedDecision } from './types.js'

/**
 * Claude Code hook contract.
 *
 * Input arrives as JSON on stdin with session_id / cwd / tool_name / tool_input.
 * Decisions go back on stdout under `hookSpecificOutput`; exit 2 feeds stderr to
 * the agent as a blocking error.
 */
export const claudeCode: Adapter = {
  name: 'claude-code',

  parse(raw, kind): NormalizedEvent {
    const input = obj(raw.tool_input)
    return {
      kind,
      agent: 'claude-code',
      sessionId: str(raw.session_id) ?? 'unknown',
      cwd: str(raw.cwd) ?? process.cwd(),
      toolName: str(raw.tool_name),
      filePath: str(input.file_path),
      content: str(input.content) ?? str(input.new_string),
      command: str(input.command),
      prompt: str(raw.user_prompt) ?? str(raw.prompt),
    }
  },

  render(decision, kind): RenderedDecision {
    switch (decision.type) {
      case 'allow':
      case 'noop':
        // Deliberately silent. Returning permissionDecision "allow" would actively
        // approve the tool call and bypass the user's own permission settings —
        // spar must never widen permissions, only narrow them.
        return SILENT

      case 'deny':
        return {
          stdout: JSON.stringify({
            hookSpecificOutput: { hookEventName: hookEventName(kind), permissionDecision: 'deny' },
            systemMessage: decision.agentMessage,
          }),
          stderr: '',
          exitCode: 0,
        }

      case 'context':
        return {
          stdout: JSON.stringify({
            hookSpecificOutput: {
              hookEventName: hookEventName(kind),
              additionalContext: decision.context,
            },
          }),
          stderr: '',
          exitCode: 0,
        }

      case 'block':
        return {
          stdout: JSON.stringify({ decision: 'block', reason: decision.reason }),
          stderr: '',
          exitCode: 0,
        }

      case 'feedback':
        // Exit 2 is the documented way to hand a blocking complaint back to Claude.
        return { stdout: '', stderr: decision.message, exitCode: 2 }
    }
  },
}

function hookEventName(kind: EventKind): string {
  switch (kind) {
    case 'pre-tool':
      return 'PreToolUse'
    case 'post-tool':
      return 'PostToolUse'
    case 'prompt':
      return 'UserPromptSubmit'
    case 'session-start':
      return 'SessionStart'
    case 'stop':
      return 'Stop'
  }
}
