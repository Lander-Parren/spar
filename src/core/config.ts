import { readFileSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { paths } from './paths.js'
import { DEFAULT_CONFIG, type Config, type ProjectConfig } from './types.js'

/**
 * Load config, never throwing. A missing or corrupt config yields defaults with
 * zero tracked projects, which makes every hook a no-op. Failing open starts here:
 * if we cannot read the config we must not be able to block anything.
 */
export function loadConfig(): Config {
  try {
    const raw = readFileSync(paths.config(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Config>
    return {
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter(isProject) : [],
      // An unreadable value, or none at all, means dormant. An upgrade from 0.4.x has no
      // activation key, and defaulting that to `always` would keep gating someone who
      // never asked for it; defaulting it to `skill` only ever removes friction.
      activation:
        parsed.activation === 'always' || parsed.activation === 'skill'
          ? parsed.activation
          : DEFAULT_CONFIG.activation,
      language: typeof parsed.language === 'string' ? parsed.language : DEFAULT_CONFIG.language,
      focusDays:
        typeof parsed.focusDays === 'number' && parsed.focusDays > 0
          ? parsed.focusDays
          : DEFAULT_CONFIG.focusDays,
      idleMinutes:
        typeof parsed.idleMinutes === 'number' && parsed.idleMinutes > 0
          ? parsed.idleMinutes
          : DEFAULT_CONFIG.idleMinutes,
      cards: {
        theme:
          typeof (parsed.cards as { theme?: unknown } | undefined)?.theme === 'string'
            ? (parsed.cards as { theme: string }).theme
            : DEFAULT_CONFIG.cards.theme,
      },
    }
  } catch {
    return { ...DEFAULT_CONFIG, projects: [] }
  }
}

export function saveConfig(config: Config): void {
  mkdirSync(dirname(paths.config()), { recursive: true })
  writeFileSync(paths.config(), JSON.stringify(config, null, 2) + '\n', 'utf8')
}

function isProject(p: unknown): p is ProjectConfig {
  return typeof p === 'object' && p !== null && typeof (p as ProjectConfig).path === 'string'
}

/**
 * The project a hook event belongs to, by working directory or by target file.
 *
 * Checking only the working directory left the gate bypassable by accident: start the
 * agent one directory up, edit the very same file, and spar silently did nothing. The
 * inert guarantee is unchanged, since an event that touches no tracked project at all
 * still matches nothing.
 */
export function trackedFor(
  cwd: string,
  filePath: string | undefined,
  config: Config,
): ProjectConfig | undefined {
  return trackedProject(cwd, config) ?? (filePath ? trackedProject(filePath, config) : undefined)
}

/**
 * Is this path inside a tracked project?
 *
 * Compares on path segments, so /work/api does not match /work/api-legacy.
 * Returns the matching project (deepest match wins, for nested repos) or undefined.
 */
export function trackedProject(cwd: string, config: Config): ProjectConfig | undefined {
  // Both spellings of the path being asked about, against both spellings of each project
  // root. Resolving symlinks alone was not enough: a symlinked directory INSIDE a tracked
  // project resolves to somewhere outside it, which would have hidden the write from the
  // gate. For a gate, the safe direction is to match more, never less.
  const heres = spellings(cwd)
  let best: ProjectConfig | undefined
  let bestLength = -1
  for (const project of config.projects) {
    for (const root of spellings(project.path)) {
      if (heres.some((here) => within(here, root)) && root.length > bestLength) {
        best = project
        bestLength = root.length
      }
    }
  }
  return best
}

/** A path as written and a path with its symlinks resolved, deduplicated. */
function spellings(path: string): string[] {
  const lexical = resolve(path)
  const physical = real(path)
  return lexical === physical ? [lexical] : [lexical, physical]
}

/** Segment-wise containment, so /work/api never matches /work/api-legacy. */
function within(here: string, root: string): boolean {
  return here === root || here.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Compare on real paths, not lexical ones.
 *
 * macOS hides /tmp and /var behind symlinks into /private, and the two halves of spar
 * disagree about which name they use: a shell's `pwd` gives the logical path, which is
 * what lands in the config, while node's `process.cwd()` gives the physical one. Without
 * this, a project behind a symlink matches nothing and every command silently does
 * nothing, which is the inert guarantee firing when it should not.
 *
 * A path that does not exist yet is normal here: the gate is asked about files the agent
 * is only about to write. So resolve the deepest ancestor that does exist and keep the
 * tail, rather than giving up on the whole path.
 */
function real(path: string): string {
  const absolute = resolve(path)
  try {
    return realpathSync(absolute)
  } catch {
    const parent = dirname(absolute)
    return parent === absolute ? absolute : join(real(parent), basename(absolute))
  }
}
