import { resolve } from 'node:path'
import { addProposal } from '../core/proposals.js'

/**
 * `spar propose` — record what you offered at level 3, before the user writes it.
 *
 * Called by the agent right after it delivers an implementation in chat. Writing it
 * down now is what lets `spar done` compare against what was actually proposed rather
 * than against whatever survives in context twenty minutes later.
 */
export async function cmdPropose(
  sessionId: string,
  filePath: string,
  text: string | undefined,
): Promise<number> {
  const content = text ?? (await readStdin())
  if (!content.trim()) {
    process.stderr.write('spar: nothing to record — pass --text or pipe the proposal on stdin\n')
    return 1
  }
  addProposal(sessionId, {
    file: resolve(filePath),
    content,
    source: 'chat',
    ts: new Date().toISOString(),
  })
  console.log(`recorded proposal for ${filePath} (${content.split('\n').length} lines)`)
  return 0
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('')
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(''))
  })
}
