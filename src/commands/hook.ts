import { claudeCode } from '../adapters/claude-code.js'
import type { Adapter, EventKind, NormalizedDecision } from '../adapters/types.js'
import { gate } from '../hooks/gate.js'
import { boundary } from '../hooks/boundary.js'

const ADAPTERS: Record<string, Adapter> = {
  'claude-code': claudeCode,
}

const HOOKS: Record<string, { kind: EventKind; run: (e: never) => NormalizedDecision }> = {
  gate: { kind: 'pre-tool', run: gate as never },
  boundary: { kind: 'prompt', run: boundary as never },
}

/**
 * Hook entrypoint. Reads the agent's event on stdin, runs one hook, writes the
 * agent's own response shape back out.
 *
 * Wrapped so that any failure at all — unknown hook, unparseable stdin, a bug in
 * our own code — exits 0 silently. Fail open is not a policy here, it is the
 * outermost catch block.
 */
export async function runHook(name: string, agentName: string): Promise<number> {
  try {
    const hook = HOOKS[name]
    const adapter = ADAPTERS[agentName]
    if (!hook || !adapter) return 0

    const raw = await readStdin()
    if (!raw.trim()) return 0

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const event = adapter.parse(parsed, hook.kind)
    const decision = hook.run(event as never)
    const rendered = adapter.render(decision, hook.kind)

    if (rendered.stdout) process.stdout.write(rendered.stdout)
    if (rendered.stderr) process.stderr.write(rendered.stderr)
    return rendered.exitCode
  } catch {
    return 0
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    // If nothing is piped in, do not hang the agent waiting on a tty.
    if (process.stdin.isTTY) return resolve('')
    let data = ''
    const timer = setTimeout(() => resolve(data), 2000)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => {
      clearTimeout(timer)
      resolve(data)
    })
    process.stdin.on('error', () => {
      clearTimeout(timer)
      resolve('')
    })
  })
}
