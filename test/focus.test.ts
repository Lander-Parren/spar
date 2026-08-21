import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFocus, writeFocus } from '../src/core/focus.js'

let home: string
const NOW = new Date('2026-08-21T12:00:00Z')

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'spar-focus-'))
  process.env.SPAR_HOME = home
})
afterEach(() => {
  rmSync(home, { recursive: true, force: true })
  delete process.env.SPAR_HOME
})

describe('focus', () => {
  it('returns nothing when the file does not exist', () => {
    expect(readFocus(NOW)).toEqual([])
  })

  it('round-trips concepts', () => {
    writeFocus(['orm', 'di'], 14, NOW)
    expect(readFocus(NOW).sort()).toEqual(['di', 'orm'])
  })

  it('drops entries once they expire, so priority keeps meaning something', () => {
    writeFocus(['orm'], 14, NOW)
    const later = new Date(NOW.getTime() + 15 * 86_400_000)
    expect(readFocus(later)).toEqual([])
    const justBefore = new Date(NOW.getTime() + 13 * 86_400_000)
    expect(readFocus(justBefore)).toEqual(['orm'])
  })

  it('de-duplicates and trims', () => {
    writeFocus([' orm ', 'orm', ''], 14, NOW)
    expect(readFocus(NOW)).toEqual(['orm'])
  })

  it('survives a corrupt focus file rather than throwing', () => {
    writeFileSync(join(home, 'focus.json'), 'not json')
    expect(readFocus(NOW)).toEqual([])
  })

  it('clears when written empty', () => {
    writeFocus(['orm'], 14, NOW)
    writeFocus([], 14, NOW)
    expect(readFocus(NOW)).toEqual([])
  })
})
