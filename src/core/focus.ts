import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { paths } from './paths.js'

export interface FocusEntry {
  concept: string
  /** ISO date this focus stops counting. Focus without an expiry stops meaning anything. */
  until: string
}

/** Concepts currently flagged as focus, expired entries dropped. */
export function readFocus(now = new Date()): string[] {
  try {
    const parsed = JSON.parse(readFileSync(paths.focus(), 'utf8')) as FocusEntry[]
    if (!Array.isArray(parsed)) return []
    const today = now.toISOString().slice(0, 10)
    return parsed.filter((e) => typeof e?.concept === 'string' && e.until >= today).map((e) => e.concept)
  } catch {
    return []
  }
}

export function writeFocus(concepts: string[], days: number, now = new Date()): void {
  const until = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)
  const entries: FocusEntry[] = [...new Set(concepts.map((c) => c.trim()).filter(Boolean))].map(
    (concept) => ({ concept, until }),
  )
  mkdirSync(dirname(paths.focus()), { recursive: true })
  writeFileSync(paths.focus(), JSON.stringify(entries, null, 2) + '\n', 'utf8')
}
