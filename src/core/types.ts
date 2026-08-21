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

export interface ProjectConfig {
  path: string
  /** Free-form hint used when naming concepts, e.g. ".NET", "Kotlin". */
  stack?: string
}

export interface Config {
  projects: ProjectConfig[]
  /** Language for the three questions and the gap log. Not the CLI's own output. */
  language: string
  focusDays: number
  /** Minutes of silence on a task before the gate re-arms. See hooks/boundary.ts. */
  idleMinutes: number
}

export const DEFAULT_CONFIG: Config = {
  projects: [],
  language: 'en',
  focusDays: 14,
  idleMinutes: 30,
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
  /** Set when the agent judged the current task trivial. */
  trivial: boolean
  /** ISO timestamp of the last recorded prediction. Lets the boundary use elapsed time. */
  predictedAt?: string
  /** Writes the gate has let through since that prediction. */
  editsSincePrediction: number
  /** The prompt that opened the current task, for comparison against the next one. */
  taskPrompt?: string
}

export function emptyState(sessionId: string): SessionState {
  return { sessionId, predicted: false, rush: false, trivial: false, editsSincePrediction: 0 }
}
