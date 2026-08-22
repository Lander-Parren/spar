import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { serverVersion } from '../src/mcp/server.js'

describe('the version the MCP server reports', () => {
  it('is the version that actually ships', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    expect(serverVersion()).toBe(pkg.version)
  })

  it('never throws, because a stale version is no reason to refuse to start', () => {
    expect(() => serverVersion()).not.toThrow()
    expect(serverVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })
})
