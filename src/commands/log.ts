import { basename } from 'node:path'
import { loadConfig, trackedProject } from '../core/config.js'
import { appendGap, nextGapId, readGaps, readState } from '../core/store.js'
import type { Gap, GapKind, Level } from '../core/types.js'

export interface LogArgs {
  sessionId: string
  concept: string
  yourModel: string
  reality: string
  kind?: GapKind
  question?: 1 | 2 | 3
  cwd?: string
}

/**
 * `spar log` — record one divergence between what you expected and what was true.
 *
 * New gaps start in box 1 and come due tomorrow. The point is not to write them down;
 * it is that they come back.
 */
export function cmdLog(args: LogArgs): number {
  const config = loadConfig()
  const cwd = args.cwd ?? process.cwd()
  const project = trackedProject(cwd, config)
  const state = readState(args.sessionId)
  const gaps = readGaps()

  const gap: Gap = {
    id: nextGapId(gaps),
    ts: new Date().toISOString(),
    project: project ? basename(project.path) : basename(cwd),
    task: state.task ?? state.taskPrompt ?? '',
    agent: 'cli',
    session: args.sessionId,
    level: (state.level ?? 1) as Level,
    kind: args.kind ?? 'misconception',
    ...(args.question ? { question: args.question } : {}),
    your_model: args.yourModel,
    reality: args.reality,
    concept: args.concept,
    ...(project?.stack ? { stack: project.stack } : {}),
    box: 1,
    due: tomorrow(),
    hits: 0,
    misses: 0,
  }

  appendGap(gap)
  console.log(`logged ${gap.id} — ${gap.concept}`)
  return 0
}

function tomorrow(now = new Date()): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10)
}
