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

describe('every manifest that ships reports the shipping version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string
  }

  // The MCP server said 0.1.0 all the way to 0.4.0, and these two said it in the same
  // release. A version repeated in four files is a version that lies in three of them.
  it.each(['../plugin.json', '../.claude-plugin/plugin.json'])('%s', (manifest) => {
    const found = JSON.parse(readFileSync(new URL(manifest, import.meta.url), 'utf8')) as {
      version?: string
    }
    expect(found.version).toBe(pkg.version)
  })
})
