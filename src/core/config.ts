import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
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
  const here = resolve(cwd)
  let best: ProjectConfig | undefined
  for (const project of config.projects) {
    const root = resolve(project.path)
    if (here === root || here.startsWith(root.endsWith(sep) ? root : root + sep)) {
      if (!best || resolve(project.path).length > resolve(best.path).length) best = project
    }
  }
  return best
}
