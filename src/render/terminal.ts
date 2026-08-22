import type { Stats } from '../core/aggregate.js'

const BLOCKS = '▁▂▃▄▅▆▇█'

export function renderStats(stats: Stats): string {
  const out: string[] = []
  const { totals, calibration, noIdea, concepts, due, health } = stats

  if (totals.predictions === 0 && totals.gaps === 0) {
    return 'spar: nothing recorded yet. Predict on a task or two and come back.'
  }

  out.push('CALIBRATION: share of predictions that held, by week')
  if (calibration.length === 0) {
    out.push('  no predictions recorded yet')
  } else {
    for (const week of calibration) {
      out.push(
        `  ${week.week}  ${bar(week.rate)}  ${pct(week.rate).padStart(4)}   ` +
          `${String(week.clean).padStart(3)}/${String(week.predictions).padEnd(3)} clean   ` +
          `mean level ${week.meanLevel.toFixed(1)}`,
      )
    }
    if (calibration.length < 3) {
      out.push('  (too few weeks to read a trend. It needs a month before it says anything)')
    }
  }

  out.push('', 'CURRICULUM: concepts by weakness. The top row is what to learn next.')
  if (concepts.length === 0) {
    out.push('  no gaps logged yet')
  } else {
    for (const row of concepts.slice(0, 12)) {
      out.push(
        `  ${row.focused ? '*' : ' '} ${row.concept.slice(0, 44).padEnd(46)}` +
          `${String(row.open)} open / ${String(row.total).padEnd(3)} box ${row.meanBox.toFixed(1)}  last ${row.lastSeen.slice(0, 10)}`,
      )
    }
    if (concepts.length > 12) out.push(`  ... and ${concepts.length - 12} more`)
  }

  out.push(
    '',
    'RETURNING',
    `  ${due.overdue} overdue · ${due.today} today · ${due.withinWeek} within the week`,
  )

  out.push(
    '',
    'TOOL HEALTH: is the design still right, not whether you are disciplined',
    `  rush         ${pct(health.rushRatio).padStart(4)}  ${health.rushRatio > 0.5 ? '<- over half: the friction is set too high, lower it' : ''}`,
    `  overrides    ${pct(health.overrideRatio).padStart(4)}  ${health.overrideRatio > 0.4 ? '<- the thresholds disagree with you; change them' : ''}`,
    `  trivial      ${pct(health.trivialRatio).padStart(4)}  ${health.trivialRatio > 0.7 ? '<- almost everything waved through; check the criteria' : ''}`,
    `  "no idea"    ${pct(noIdea.ratio).padStart(4)}  ${noIdea.ratio > 0.6 ? '<- the material is above you; learn the concept before gating on it' : ''}`,
    '',
    `  ${totals.predictions} predictions · ${totals.gaps} gaps ` +
      `(${totals.misconceptions} misconception, ${totals.typoBugs} typo, ${totals.improvements} yours were better)`,
  )

  return out.map((line) => line.trimEnd()).join('\n')
}

function bar(rate: number): string {
  const filled = Math.round(rate * 10)
  return Array.from({ length: 10 }, (_, i) =>
    i < filled ? BLOCKS[BLOCKS.length - 1] : BLOCKS[0],
  ).join('')
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}
