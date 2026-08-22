export type DiffOp = 'same' | 'add' | 'remove'

export interface DiffLine {
  op: DiffOp
  text: string
}

/** Above this, an exact LCS is not worth the time; we degrade to a blunt summary. */
const MAX_LINES = 3000

/**
 * Minimal line diff, no dependencies.
 *
 * Only ever read by an agent deciding whether a difference is a misconception, a
 * typo, or an improvement — so readability beats minimality. A slightly larger diff
 * that is obviously correct is fine; a clever one that occasionally misaligns is not.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')

  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      { op: 'remove', text: `<${a.length} lines proposed>` },
      { op: 'add', text: `<${b.length} lines written, too large to diff inline>` },
    ]
  }

  // Classic LCS table. n*m cells; bounded above, so this stays in the millisecond range.
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ op: 'same', text: a[i]! })
      i++
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ op: 'remove', text: a[i]! })
      i++
    } else {
      out.push({ op: 'add', text: b[j]! })
      j++
    }
  }
  while (i < a.length) out.push({ op: 'remove', text: a[i++]! })
  while (j < b.length) out.push({ op: 'add', text: b[j++]! })
  return out
}

/** Render with a few lines of context, so the agent sees where a change landed. */
export function renderDiff(lines: DiffLine[], context = 2): string {
  const keep = new Set<number>()
  lines.forEach((line, index) => {
    if (line.op === 'same') return
    for (let k = index - context; k <= index + context; k++) {
      if (k >= 0 && k < lines.length) keep.add(k)
    }
  })

  const out: string[] = []
  let skipping = false
  lines.forEach((line, index) => {
    if (!keep.has(index)) {
      if (!skipping) out.push('  ...')
      skipping = true
      return
    }
    skipping = false
    out.push(`${line.op === 'add' ? '+' : line.op === 'remove' ? '-' : ' '} ${line.text}`)
  })
  return out.join('\n')
}

export function hasChanges(lines: DiffLine[]): boolean {
  return lines.some((l) => l.op !== 'same')
}
