#!/usr/bin/env node
import { runHook } from './commands/hook.js'
import {
  cmdLevel,
  cmdMarkTrivial,
  cmdPredict,
  cmdRush,
  cmdSuggestLevel,
  cmdNext,
} from './commands/session.js'
import { cmdLog } from './commands/log.js'
import { cmdDone } from './commands/done.js'
import { cmdPropose } from './commands/propose.js'
import { cmdReview } from './commands/review.js'
import { cmdStats } from './commands/stats.js'
import { cmdDashboard } from './commands/dashboard.js'
import { cmdFocus } from './commands/focus.js'
import { cmdCard } from './commands/card.js'
import { cmdGuide } from './commands/guide.js'
import { cmdInstall } from './commands/install.js'
import { cmdEmit } from './commands/emit.js'
import { cmdSetup } from './commands/setup.js'
import { cmdPlan } from './commands/plan.js'
import { cmdStepDone } from './commands/step.js'
import type { GapKind, Level } from './core/types.js'

const HELP = `spar — keep learning while AI writes the code

  spar install [--agent claude-code|cursor] [--dry-run]
  spar setup --project <path> [--stack <name>] [--language <code>] [--test-command <cmd>]
  spar plan [--title <t>] [--step <s> ...] [--from <plan.md>] [--replace] [--clear]
  spar step done [--session <id>]
  spar suggest-level --session <id> --concept <c> [--concept <c> ...]
  spar level --session <id> <0-3>
  spar predict --session <id> [--q1 <a>] [--q2 <a>] [--q3 <a>]
  spar mark --session <id> --trivial
  spar rush --session <id> [--off]
  spar done --session <id>
  spar next --session <id>
  spar propose --session <id> --file <path> [--text <content>]   (or pipe on stdin)
  spar review --session <id> <gap-id> [--ok | --nok]
  spar stats [--json]
  spar guide [<topic>]
  spar dashboard [--no-open]
  spar card --layout chain|fanout|sequence|compare --title <t> --subtitle <s> [...]
  spar focus ["<concept>" ...] [--clear]
  spar log --session <id> --concept <c> --model <what you thought> --reality <what was true>
           [--kind misconception|typo-bug|improvement] [--question 1|2|3]

  spar hook <gate|skeleton|boundary|due> --agent <name>   (called by agent hooks, reads stdin)
  spar mcp                                                (MCP server on stdio)

  (any session command also takes --cwd <path> when it is not run inside the project)

Levels: 0 rush · 1 standard · 2 skeleton · 3 transcript
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const flags = parseFlags(argv.slice(1))

  switch (command) {
    case 'hook': {
      const name = argv[1] ?? ''
      return runHook(name, flags.string('agent') ?? 'claude-code')
    }
    case 'emit':
      return cmdEmit(flags.string('root') ?? process.cwd())
    case 'install':
      return cmdInstall({ agent: flags.string('agent'), dryRun: flags.bool('dry-run') })
    case 'mcp': {
      const { runMcpServer } = await import('./mcp/server.js')
      return runMcpServer()
    }
    case 'setup':
      return cmdSetup({
        project: flags.string('project'),
        stack: flags.string('stack'),
        language: flags.string('language'),
        testCommand: flags.string('test-command'),
      })
    case 'plan':
      return cmdPlan({
        title: flags.string('title'),
        steps: flags.all('step'),
        from: flags.string('from'),
        clear: flags.bool('clear'),
        replace: flags.bool('replace'),
        cwd: cwdOf(flags),
      })
    case 'step':
      if (argv[1] !== 'done') {
        process.stderr.write('spar: the only step command is "spar step done"\n')
        return 1
      }
      return cmdStepDone({ sessionId: flags.string('session'), cwd: cwdOf(flags) })
    case 'suggest-level':
      return cmdSuggestLevel(requireSession(flags), flags.all('concept'), cwdOf(flags))
    case 'level':
      return cmdLevel(requireSession(flags), parseLevel(flags.positional[0]), cwdOf(flags))
    case 'predict':
      return cmdPredict(
        requireSession(flags),
        { q1: flags.string('q1'), q2: flags.string('q2'), q3: flags.string('q3') },
        cwdOf(flags),
      )
    case 'review':
      return cmdReview(
        requireSession(flags),
        required(flags.positional[0], '<gap-id>'),
        requireVerdict(flags),
      )
    case 'stats':
      return cmdStats(flags.bool('json'))
    case 'dashboard':
      return cmdDashboard(!flags.bool('no-open'))
    case 'guide':
      return cmdGuide(flags.positional[0])
    case 'card':
      return cmdCard({
        layout: flags.string('layout') ?? '',
        title: required(flags.string('title'), '--title'),
        subtitle: required(flags.string('subtitle'), '--subtitle'),
        bullets: flags.all('bullet'),
        close: flags.string('close'),
        steps: flags.all('step'),
        loop: flags.string('loop'),
        from: flags.string('from'),
        to: flags.all('to'),
        via: flags.string('via'),
        actors: flags.all('actor'),
        messages: flags.all('msg'),
        panes: flags.all('card-pane'),
        out: flags.string('out'),
        open: !flags.bool('no-open'),
      })
    case 'focus':
      return cmdFocus(flags.positional, flags.bool('clear'))
    case 'propose':
      return cmdPropose(requireSession(flags), required(flags.string('file'), '--file'), flags.string('text'))
    case 'done':
      return cmdDone(requireSession(flags), cwdOf(flags))
    case 'next':
      return cmdNext(requireSession(flags), cwdOf(flags))
    case 'mark':
      return cmdMarkTrivial(requireSession(flags), cwdOf(flags))
    case 'rush':
      return cmdRush(requireSession(flags), flags.bool('off'), cwdOf(flags))
    case 'log':
      return cmdLog({
        sessionId: requireSession(flags),
        concept: required(flags.string('concept'), '--concept'),
        yourModel: required(flags.string('model'), '--model'),
        reality: required(flags.string('reality'), '--reality'),
        kind: flags.string('kind') as GapKind | undefined,
        question: parseQuestion(flags.string('question')),
        cwd: cwdOf(flags),
      })
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      process.stdout.write(HELP)
      return 0
    default:
      process.stderr.write(`spar: unknown command "${command}"\n\n${HELP}`)
      return 1
  }
}

interface Flags {
  positional: string[]
  string(name: string): string | undefined
  all(name: string): string[]
  bool(name: string): boolean
}

function parseFlags(argv: string[]): Flags {
  const values = new Map<string, string[]>()
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (!token.startsWith('--')) {
      positional.push(token)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      values.set(key, [...(values.get(key) ?? []), 'true'])
    } else {
      values.set(key, [...(values.get(key) ?? []), next])
      i++
    }
  }
  return {
    positional,
    string: (name) => values.get(name)?.[0],
    all: (name) => values.get(name) ?? [],
    bool: (name) => values.has(name),
  }
}

function requireSession(flags: Flags): string {
  return required(flags.string('session'), '--session')
}

/**
 * Which project this command is about.
 *
 * Normally the directory the agent is running in, which is the same one the gate matched
 * on. `--cwd` exists for scripts and for the rare agent that runs the CLI from somewhere
 * else, so a plan is never invisible just because the shell started a level up.
 */
function cwdOf(flags: Flags): string {
  return flags.string('cwd') ?? process.cwd()
}

function required(value: string | undefined, name: string): string {
  if (!value) {
    process.stderr.write(`spar: ${name} is required\n`)
    process.exit(1)
  }
  return value
}

/**
 * Demand an explicit verdict. Defaulting to "correct" would let a forgotten flag
 * quietly promote a gap out of the rotation — the one failure mode this system
 * cannot detect, since a hidden gap looks exactly like a learned one.
 */
function requireVerdict(flags: Flags): boolean {
  const ok = flags.bool('ok')
  const nok = flags.bool('nok')
  if (ok === nok) {
    process.stderr.write('spar: pass exactly one of --ok or --nok\n')
    process.exit(1)
  }
  return ok
}

function parseLevel(value: string | undefined): Level {
  const n = Number.parseInt(value ?? '', 10)
  if (n !== 0 && n !== 1 && n !== 2 && n !== 3) {
    process.stderr.write('spar: level must be 0, 1, 2 or 3\n')
    process.exit(1)
  }
  return n
}

function parseQuestion(value: string | undefined): 1 | 2 | 3 | undefined {
  const n = Number.parseInt(value ?? '', 10)
  return n === 1 || n === 2 || n === 3 ? n : undefined
}

main().then(
  (code) => process.exit(code),
  // Even a crash in the CLI itself must not become a blocked edit.
  () => process.exit(0),
)
