/** The four notches of the friction dial. Higher means you do more of the work. */
export type Level = 0 | 1 | 2 | 3

export const LEVEL_NAMES = {
  0: 'rush',
  1: 'standard',
  2: 'skeleton',
  3: 'transcript',
} as const satisfies Record<Level, string>

/** What kind of divergence a logged gap represents. */
export type GapKind = 'misconception' | 'typo-bug' | 'improvement' | 'trivial-marked'

export interface Gap {
  id: string
  ts: string
  project: string
  task: string
  agent: string
  /** Session this was logged in. Lets a gap be tied back to the prediction it came from. */
  session?: string
  level: Level
  kind: GapKind
  /** Which of the three questions this gap came from (1-3), if any. */
  question?: 1 | 2 | 3
  your_model: string
  reality: string
  concept: string
  stack?: string
  /** Leitner box, 1-5. Higher means better consolidated. */
  box: number
  /** ISO date (YYYY-MM-DD) this gap is next due for review. */
  due: string
  hits: number
  misses: number
}

/** Whether the gate may fire at all, and on whose say-so. */
export type Activation = 'skill' | 'always'

export interface ProjectConfig {
  path: string
  /** Free-form hint used when naming concepts, e.g. ".NET", "Kotlin". */
  stack?: string
  /**
   * Optional. When set, handover runs it and expects a red suite: a test that already
   * passes against an empty stub pins nothing. Off by default, because running someone
   * else's suite automatically is invasive and can be slow.
   */
  testCommand?: string
}

export interface Config {
  projects: ProjectConfig[]
  /**
   * When the gate is allowed to fire.
   *
   * `skill` keeps spar dormant until something in the session turns it on, which is the
   * spar skill's first step. `always` gates every write in a tracked project, which is
   * how spar behaved before 0.5.0 and is one command away: `spar activation always`.
   */
  activation: Activation
  /** Language for the three questions and the gap log. Not the CLI's own output. */
  language: string
  focusDays: number
  /** Minutes of silence on a task before the gate re-arms. See hooks/boundary.ts. */
  idleMinutes: number
  /** Card appearance. See render/card-theme.ts. */
  cards: { theme: string }
}

export const DEFAULT_CONFIG: Config = {
  projects: [],
  activation: 'skill',
  language: 'en',
  focusDays: 14,
  idleMinutes: 30,
  cards: { theme: 'neon' },
}

/** Per-session, per-task state. Reset when a new task starts. */
export interface SessionState {
  sessionId: string
  /** The task currently being gated, as first seen. Free-form. */
  task?: string
  level?: Level
  predicted: boolean
  /** Rush flag persists for the whole session, not just the task. */
  rush: boolean
  /**
   * Something turned spar on for this session, normally the skill's first step.
   *
   * Session-scoped like rush, and for the same reason: a task boundary must never stand
   * spar down, or the second task of a session would go ungated without anyone saying so.
   * Only consulted when `activation` is `skill`.
   */
  engaged: boolean
  /** Set when the agent judged the current task trivial. */
  trivial: boolean
  /** ISO timestamp of the last recorded prediction. Lets the boundary use elapsed time. */
  predictedAt?: string
  /** Writes the gate has let through since that prediction. */
  editsSincePrediction: number
  /** The prompt that opened the current task, for comparison against the next one. */
  taskPrompt?: string
  /** A test file was written during this task. Checked when the agent hands back. */
  testWritten: boolean
  /** Handover already objected once this task. It never objects twice, so it cannot loop. */
  handoverBlocked?: boolean
  /**
   * The edit count at which the project's suite was last run and found red.
   *
   * A red suite is the CORRECT state through all of level 2 and 3, so without this the
   * check re-runs someone's whole test suite on every single turn. Nothing can have
   * changed while the edit count has not moved.
   */
  suiteCheckedAtEdits?: number
}

export function emptyState(sessionId: string): SessionState {
  return {
    sessionId, predicted: false, rush: false, engaged: false, trivial: false,
    editsSincePrediction: 0, testWritten: false,
  }
}
