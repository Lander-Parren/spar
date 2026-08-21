import type { Gap, Level } from './types.js'
import type { SparEvent } from './events.js'
import { isDue } from './schedule.js'

export interface WeekPoint {
  week: string
  predictions: number
  clean: number
  /** Fraction of predictions that produced no misconception at all. */
  rate: number
  meanLevel: number
  /** Predictions per level that week. The real progress signal: levels should fall. */
  levelCounts: Record<Level, number>
}

/** One recorded divergence, trimmed to what a reader actually needs. */
export interface Incident {
  id: string
  ts: string
  yourModel: string
  reality: string
  box: number
  due: string
  kind: string
}

export interface ConceptRow {
  concept: string
  open: number
  total: number
  meanBox: number
  lastSeen: string
  focused: boolean
  /** Newest first. This is what you actually open before a standup. */
  incidents: Incident[]
}

export interface Stats {
  totals: {
    predictions: number
    gaps: number
    misconceptions: number
    typoBugs: number
    improvements: number
    concepts: number
  }
  /** Oldest week first. The headline: is your picture of what you know getting truer? */
  calibration: WeekPoint[]
  noIdea: { answers: number; blanks: number; ratio: number }
  concepts: ConceptRow[]
  due: { overdue: number; today: number; withinWeek: number; total: number }
  /** Whether the design is still right — not whether the user is disciplined. */
  health: { gatedTasks: number; rushRatio: number; overrideRatio: number; trivialRatio: number }
}

export function aggregate(
  gaps: Gap[],
  events: SparEvent[],
  focused: string[] = [],
  now = new Date(),
): Stats {
  const predictions = events.filter((e) => e.type === 'predict')
  const misconceptions = gaps.filter((g) => g.kind === 'misconception')

  // A prediction is "clean" when nothing it produced turned out to be a misconception.
  // Counting gaps alone would only ever go up, and would read as decline while you improve.
  const dirtySessions = new Set(misconceptions.map((g) => sessionKey(g)))

  const byWeek = new Map<string, { predictions: number; clean: number; levels: Level[] }>()
  for (const p of predictions) {
    const week = weekOf(p.ts)
    const bucket = byWeek.get(week) ?? { predictions: 0, clean: 0, levels: [] as Level[] }
    bucket.predictions++
    if (!dirtySessions.has(`${p.session}`)) bucket.clean++
    bucket.levels.push(p.level)
    byWeek.set(week, bucket)
  }

  const calibration: WeekPoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, b]) => ({
      week,
      predictions: b.predictions,
      clean: b.clean,
      rate: b.predictions ? b.clean / b.predictions : 0,
      meanLevel: b.levels.length ? b.levels.reduce<number>((x, y) => x + y, 0) / b.levels.length : 0,
      levelCounts: countLevels(b.levels),
    }))

  const answers = predictions.length * 3
  const blanks = predictions.reduce((acc, p) => acc + p.blanks, 0)

  const focusSet = new Set(focused.map((f) => f.trim().toLowerCase()))
  const conceptMap = new Map<string, Gap[]>()
  for (const gap of gaps) {
    const key = gap.concept.trim()
    conceptMap.set(key, [...(conceptMap.get(key) ?? []), gap])
  }

  const concepts: ConceptRow[] = [...conceptMap.entries()]
    .map(([concept, rows]) => ({
      concept,
      open: rows.filter((g) => g.box <= 2).length,
      total: rows.length,
      meanBox: rows.reduce((acc, g) => acc + g.box, 0) / rows.length,
      lastSeen: rows.map((g) => g.ts).sort().at(-1)!,
      focused: focusSet.has(concept.toLowerCase()),
      incidents: rows
        .slice()
        .sort((a, b) => (a.ts < b.ts ? 1 : -1))
        .map((g) => ({
          id: g.id,
          ts: g.ts,
          yourModel: g.your_model,
          reality: g.reality,
          box: g.box,
          due: g.due,
          kind: g.kind,
        })),
    }))
    // Weakest first: that ordering is the curriculum, so it must not be alphabetical.
    .sort((a, b) => {
      if (a.focused !== b.focused) return a.focused ? -1 : 1
      if (a.open !== b.open) return b.open - a.open
      if (a.meanBox !== b.meanBox) return a.meanBox - b.meanBox
      return b.total - a.total
    })

  const todayStr = now.toISOString().slice(0, 10)
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

  const suggests = events.filter((e) => e.type === 'suggest').length
  const overrides = events.filter((e) => e.type === 'override').length
  const trivials = events.filter((e) => e.type === 'trivial').length
  const rushOn = events.filter((e) => e.type === 'rush' && e.on).length
  const gatedTasks = predictions.length + trivials

  return {
    totals: {
      predictions: predictions.length,
      gaps: gaps.length,
      misconceptions: misconceptions.length,
      typoBugs: gaps.filter((g) => g.kind === 'typo-bug').length,
      improvements: gaps.filter((g) => g.kind === 'improvement').length,
      concepts: conceptMap.size,
    },
    calibration,
    noIdea: { answers, blanks, ratio: answers ? blanks / answers : 0 },
    concepts,
    due: {
      overdue: gaps.filter((g) => g.due < todayStr).length,
      today: gaps.filter((g) => g.due === todayStr).length,
      withinWeek: gaps.filter((g) => g.due > todayStr && g.due <= weekAhead).length,
      total: gaps.filter((g) => isDue(g, now)).length,
    },
    health: {
      gatedTasks,
      rushRatio: gatedTasks + rushOn ? rushOn / (gatedTasks + rushOn) : 0,
      overrideRatio: suggests ? overrides / suggests : 0,
      trivialRatio: gatedTasks ? trivials / gatedTasks : 0,
    },
  }
}

function countLevels(levels: Level[]): Record<Level, number> {
  const counts: Record<Level, number> = { 0: 0, 1: 0, 2: 0, 3: 0 }
  for (const level of levels) counts[level]++
  return counts
}

function sessionKey(gap: Gap): string {
  return `${gap.session ?? ''}`
}

/** Monday of the week containing this timestamp, as YYYY-MM-DD. */
export function weekOf(ts: string): string {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return 'unknown'
  const day = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - day * 86_400_000).toISOString().slice(0, 10)
}

export type { Level }
