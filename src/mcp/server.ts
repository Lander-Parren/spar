import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { appendGap, findGap, nextGapId, readGaps, updateGap } from '../core/store.js'
import { appendEvent, readEvents } from '../core/events.js'
import { readFocus } from '../core/focus.js'
import { suggestLevel } from '../core/level.js'
import { pickDue, review } from '../core/schedule.js'
import { aggregate } from '../core/aggregate.js'
import { renderStats } from '../render/terminal.js'
import type { Gap, GapKind, Level } from '../core/types.js'

/**
 * The portable half of spar.
 *
 * MCP is standardised where hooks are not, so this reaches every MCP client with no
 * adapter at all. What it deliberately cannot do is the gate: an MCP server offers
 * tools, it does not intercept the host's own writes. So a client with only this
 * gets the log, the return and the numbers — everything except the compulsion.
 *
 * That limitation is the honest reason the per-client hook adapters are worth writing.
 */
/**
 * The version we report to the client, read from package.json rather than repeated here.
 *
 * It was hardcoded, and by 0.4.0 it still said 0.1.0. A version string that has to be
 * edited in two places is a version string that lies, so read the one that ships. npm
 * always includes package.json in the tarball, and a failure to read it is not worth
 * refusing to start over.
 */
export function serverVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    const manifest = readFileSync(join(here, '..', '..', 'package.json'), 'utf8')
    return (JSON.parse(manifest) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export async function runMcpServer(): Promise<number> {
  const server = new McpServer({ name: 'spar', version: serverVersion() })

  server.registerTool(
    'log_gap',
    {
      title: 'Log a knowledge gap',
      description:
        'Record one divergence between what the user expected and what turned out to be true. ' +
        'Log the concept and the shape of the misunderstanding, never business logic. ' +
        'State the belief with no framing words: "the repository owns the transaction", not "they thought the repository...".',
      inputSchema: {
        concept: z.string().describe('A general, learnable concept, e.g. "transaction boundaries in an ORM"'),
        your_model: z.string().describe("The user's belief, stated plainly"),
        reality: z.string().describe('What is actually true, and why'),
        kind: z.enum(['misconception', 'typo-bug', 'improvement']).optional(),
        question: z.number().int().min(1).max(3).optional(),
        project: z.string().optional(),
      },
    },
    async (args) => {
      const gaps = readGaps()
      const gap: Gap = {
        id: nextGapId(gaps),
        ts: new Date().toISOString(),
        project: args.project ?? '',
        task: '',
        agent: 'mcp',
        level: 1,
        kind: (args.kind ?? 'misconception') as GapKind,
        ...(args.question ? { question: args.question as 1 | 2 | 3 } : {}),
        your_model: args.your_model,
        reality: args.reality,
        concept: args.concept,
        box: 1,
        due: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
        hits: 0,
        misses: 0,
      }
      appendGap(gap)
      return text(`logged ${gap.id}: ${gap.concept}. It comes back tomorrow.`)
    },
  )

  server.registerTool(
    'next_due',
    {
      title: 'Fetch a gap due for review',
      description:
        'Returns at most one gap whose review has come due, focused concepts first. ' +
        'Ask the user to explain it in their own words BEFORE showing them the answer, ' +
        'and wait for a natural pause rather than interrupting.',
      inputSchema: {},
    },
    async () => {
      const gap = pickDue(readGaps(), readFocus())
      if (!gap) return text('Nothing due. Do not invent a question.')
      return text(
        [
          `id: ${gap.id}`,
          `concept: ${gap.concept}`,
          `they thought: ${gap.your_model}`,
          `reality: ${gap.reality}`,
          '',
          'Ask them to explain the concept unprompted, then call review_gap honestly.',
          'Marking a shaky answer correct hides the gap, and a hidden gap looks exactly like a learned one.',
        ].join('\n'),
      )
    },
  )

  server.registerTool(
    'review_gap',
    {
      title: 'Record the answer to a returning gap',
      description: 'Correct moves it up a box (1, 3, 7, 16, 35 days); wrong sends it back to box 1.',
      inputSchema: {
        gap_id: z.string(),
        correct: z.boolean().describe('Judge honestly. A generous yes removes the gap from rotation'),
      },
    },
    async ({ gap_id, correct }) => {
      const gap = findGap(gap_id)
      if (!gap) return text(`No gap with id ${gap_id}.`, true)
      const next = review(gap, correct)
      updateGap(gap_id, next)
      appendEvent({ type: 'review', session: 'mcp', gap: gap_id, correct })
      return text(
        correct
          ? `${gap_id}: box ${gap.box} -> ${next.box}, back on ${next.due}`
          : `${gap_id}: back to box 1, returns ${next.due}. Not a setback. It is the point.`,
      )
    },
  )

  server.registerTool(
    'suggest_level',
    {
      title: 'How much should the user write themselves?',
      description:
        'Given the concepts a task touches, returns a level 0-3 with its reason. ' +
        '0 rush, 1 predict then I implement, 2 I write the wiring and leave the decision, ' +
        '3 I deliver in chat and they write it. Always report the reason, not just the number.',
      inputSchema: { concepts: z.array(z.string()).min(1) },
    },
    async ({ concepts }) => {
      const s = suggestLevel({ concepts, gaps: readGaps(), focused: readFocus() })
      return text(`level ${s.level}: ${s.reason}`)
    },
  )

  server.registerTool(
    'stats',
    {
      title: 'Calibration and curriculum',
      description:
        'Calibration by week, concepts ordered by weakness, and tool-health ratios. ' +
        'The concept order is the curriculum; the health block is about the tool, not the user.',
      inputSchema: {},
    },
    async () => text(renderStats(aggregate(readGaps(), readEvents(), readFocus()))),
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // connect() resolves as soon as the transport is wired up, not when the session ends.
  // Returning here would let the CLI's process.exit() kill the server the instant a
  // client connected — so wait for the client to actually go away.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve()
    process.stdin.on('end', resolve)
    process.stdin.on('close', resolve)
  })
  return 0
}

function text(body: string, isError = false) {
  return { content: [{ type: 'text' as const, text: body }], ...(isError ? { isError } : {}) }
}

export type { Level }
