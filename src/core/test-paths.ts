import { basename } from 'node:path'

/**
 * Does this path look like a test?
 *
 * Used in two places that both matter. At level 3 the gate lets the agent write a test
 * and nothing else, because the test is the brief and the implementation is yours. And
 * at handover, spar checks one was written at all: a `TODO(spar:)` with no test leaves
 * you alone with your guess, which is the dependency this tool exists to break.
 *
 * Matched on whole path segments so `latest/`, `contest/` and `protest.ts` are not
 * mistaken for tests.
 */
export function isTestPath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  const dirs = segments.slice(0, -1)

  if (dirs.some((d) => /^(__)?(tests?|specs?)(__)?$/i.test(d))) return true

  const name = basename(normalized)
  // order.test.ts, order_test.go, order.spec.rb, OrderServiceTests.cs
  return /(^|[._-])(tests?|specs?)([._-]|$)/i.test(name.replace(/\.[^.]+$/, '')) ||
    /(Tests?|Specs?)$/.test(name.replace(/\.[^.]+$/, ''))
}
