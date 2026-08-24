import { isAbsolute, resolve } from 'node:path'

/**
 * Paths a shell command appears to write to.
 *
 * This exists because the gate was watching the wrong door. An agent writes a file with
 * `cat > f <<EOF` or `perl -0pi` far more often than with a dedicated write tool, and in
 * some setups it is told to prefer exactly that. Gating only Write and Edit meant gating
 * almost nothing.
 *
 * Deliberately conservative. Shell is not parseable by regex, and a gate that fires on
 * ordinary reads gets switched off within a day, which is worse than missing a few
 * writes. When a form is not recognised, nothing is returned and the write goes through.
 */
export function writeTargets(command: string, cwd: string): string[] {
  const found = new Set<string>()
  const add = (raw: string | undefined): void => {
    const path = clean(raw)
    if (path) found.add(isAbsolute(path) ? path : resolve(cwd, path))
  }

  // Redirections. The first lookbehind skips `2>&1` and the like, where the target is a
  // file descriptor rather than a file. It also skips the arrows and comparisons that
  // turn up constantly in prose and in code being echoed or grepped: `->`, `=>`, `>=`.
  // None of those is a redirect, and treating one as a write gates an ordinary read.
  //
  // The second skips a `>` that closes an angle-bracketed token, `<like@this.com>`. A
  // commit written through a heredoc ends on a `Co-Authored-By:` trailer, and its closing
  // bracket sits before whitespace and a word, which is the exact shape of `cmd > file`.
  // The same covers `<https://example.com>` and `Promise<void>`. The cost is `<in.txt>out`,
  // a real redirect written without spaces, which is now missed: the trade the whole file
  // makes, since a missed write costs one gap and a gated read costs the tool.
  for (const m of command.matchAll(
    /(?<![0-9&=-])(?<!<[^\s<>]*)>>?(?!=)\s*("[^"\n]+"|'[^'\n]+'|[^\s;&|<>()]+)/g,
  ))
    add(m[1])

  for (const m of command.matchAll(/\btee\b\s+(?:-a\s+)?("[^"\n]+"|'[^'\n]+'|[^\s;&|<>]+)/g)) add(m[1])

  // sed -i and perl -i rewrite their operands. Take every trailing path-like argument,
  // skipping the flags and the script itself.
  for (const m of command.matchAll(/\b(?:sed|perl)\b\s+(-[^\s]*i[^\s]*)([^\n;&|]*)/g)) {
    const rest = (m[2] ?? '').trim()
    // Drop the quoted script and any remaining flags; what is left is operands.
    const operands = rest
      .replace(/(^|\s)-[^\s]*/g, ' ')
      .replace(/(^|\s)('[^']*'|"[^"]*")/g, (whole, lead: string, quoted: string) =>
        /[/.]/.test(quoted) ? whole : `${lead} `,
      )
    for (const token of operands.split(/\s+/)) if (looksLikePath(token)) add(token)
  }

  for (const m of command.matchAll(/\b(?:cp|mv|install)\b\s+([^\n;&|]+)/g)) {
    const args = (m[1] ?? '').trim().split(/\s+/).filter((a) => !a.startsWith('-'))
    if (args.length >= 2) add(args.at(-1))
  }

  for (const m of command.matchAll(/\bdd\b[^\n;&|]*\bof=("[^"\n]+"|'[^'\n]+'|[^\s;&|]+)/g)) add(m[1])

  // Interpreter one-liners. Only the two unambiguous shapes: opening a path for writing,
  // and the Node write helpers.
  for (const m of command.matchAll(/open\(\s*("[^"\n]+"|'[^'\n]+')\s*,\s*['"][wa]/g)) add(m[1])
  for (const m of command.matchAll(/write(?:File)?(?:Sync)?\(\s*("[^"\n]+"|'[^'\n]+')/g)) add(m[1])

  return [...found]
}

function clean(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const unquoted = raw.replace(/^["']|["']$/g, '').trim()
  if (!unquoted || unquoted === '&1' || unquoted === '&2') return undefined
  // /dev/null and friends are not files anyone is editing.
  if (unquoted.startsWith('/dev/')) return undefined
  // A bare number after > is a file descriptor, not a name worth gating.
  if (/^\d+$/.test(unquoted)) return undefined
  return unquoted
}

function looksLikePath(token: string): boolean {
  return token.length > 0 && !token.startsWith('-') && /[/.]/.test(token) && !/^['"]/.test(token)
}
