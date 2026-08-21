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
 * Is this working directory inside a tracked project?
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
