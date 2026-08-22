import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawn } from 'node:child_process'
import {
  CardError, parseBullet, parseMessage, parsePane, parseRole, roleSlots, validate,
  type CardSpec, type Layout,
} from '../core/card.js'
import { layout } from '../core/card-layout.js'
import { loadConfig } from '../core/config.js'
import { paths } from '../core/paths.js'
import { themeByName } from '../render/card-theme.js'
import { renderCard } from '../render/card.js'

export interface CardArgs {
  layout: string
  title: string
  subtitle: string
  bullets: string[]
  close?: string
  steps: string[]
  loop?: string
  from?: string
  to: string[]
  via?: string
  actors: string[]
  messages: string[]
  panes: string[]
  out?: string
  open: boolean
}

const LAYOUTS: Layout[] = ['chain', 'fanout', 'sequence', 'compare']

/**
 * `spar card`: one idea, one picture.
 *
 * Every limit here exits 1 rather than warning. A rule that lives only in a prompt
 * drifts, and a bigger card is less work than deciding what to leave out. The whole
 * value of a small picture is that it stayed small, so the limit has to be the kind
 * that stops you.
 */
export function cmdCard(args: CardArgs): number {
  try {
    if (!LAYOUTS.includes(args.layout as Layout)) {
      throw new CardError(`unknown layout "${args.layout}". Known: ${LAYOUTS.join(', ')}`)
    }

    const spec: CardSpec = {
      layout: args.layout as Layout,
      title: args.title,
      subtitle: args.subtitle,
      bullets: args.bullets.map(parseBullet),
      ...(args.close ? { close: args.close } : {}),
      ...(args.steps.length ? { steps: args.steps.map(parseRole) } : {}),
      ...(args.loop ? { loop: args.loop } : {}),
      ...(args.from ? { from: parseRole(args.from) } : {}),
      ...(args.to.length ? { to: args.to.map(parseRole) } : {}),
      ...(args.via ? { via: args.via } : {}),
      ...(args.actors.length ? { actors: args.actors.map(parseRole) } : {}),
      ...(args.messages.length ? { messages: args.messages.map(parseMessage) } : {}),
      ...(args.panes.length ? { panes: args.panes.map(parsePane) } : {}),
    }

    validate(spec)

    const theme = themeByName(loadConfig().cards.theme)
    const html = renderCard(spec, layout(spec, roleSlots(spec)), theme)
    const target = args.out ?? paths.card(slug(spec.title))

    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, html, 'utf8')
    console.log(target)
    if (args.open) open(target)
    return 0
  } catch (error) {
    if (error instanceof CardError) {
      process.stderr.write(`spar card: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

/** Named from the title, so re-rendering replaces rather than accumulates. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'card'
}

function open(file: string): void {
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(opener, [file], { detached: true, stdio: 'ignore' }).unref()
  } catch {
    // Printing the path is the contract; opening it is a convenience.
  }
}
