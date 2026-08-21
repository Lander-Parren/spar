import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTS, HOOKS, OWNED, command, eventName, hooksObject } from '../src/core/hookconfig.js'
import { ARTEFACTS, artefactContent } from '../src/commands/emit.js'

const root = join(import.meta.dirname, '..')

describe('generated hook configs', () => {
  /**
   * The same hooks are checked in three times over — Claude Code's plugin layout,
   * the Agent Plugins namespace, and Cursor's — because the two standards disagree
   * about where client files live. This test is what stops them drifting apart.
   */
  it.each(ARTEFACTS)('$path matches what the generator produces', ({ path, agent }) => {
    expect(readFileSync(join(root, path), 'utf8')).toBe(artefactContent(agent))
  })

  it('wires all four hooks for every agent', () => {
    for (const agent of AGENTS) {
      const config = hooksObject(agent)
      expect(Object.keys(config)).toHaveLength(HOOKS.length)
      for (const spec of HOOKS) {
        expect(config[eventName(spec.kind, agent)]).toBeDefined()
      }
    }
  })

  it('uses each agent\'s own event names, not a shared invention', () => {
    expect(Object.keys(hooksObject('claude-code'))).toContain('UserPromptSubmit')
    expect(Object.keys(hooksObject('cursor'))).toContain('beforeSubmitPrompt')
  })

  it('prefixes every command so the installer can find its own again', () => {
    for (const agent of AGENTS) {
      for (const spec of HOOKS) {
        expect(command(spec, agent).startsWith(OWNED)).toBe(true)
        expect(command(spec, agent)).toContain(`--agent ${agent}`)
      }
    }
  })

  it('never lets a Cursor hook fail closed', () => {
    for (const entries of Object.values(hooksObject('cursor'))) {
      for (const entry of entries as { failClosed: boolean }[]) {
        expect(entry.failClosed).toBe(false)
      }
    }
  })

  it('keeps the manifests valid JSON with the names clients look for', () => {
    const claude = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
    const agentPlugin = JSON.parse(readFileSync(join(root, 'plugin.json'), 'utf8'))
    const mcp = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'))
    const claudeMcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf8'))
    expect(claude.name).toBe('spar')
    expect(agentPlugin.name).toBe('spar')
    expect(agentPlugin.$schema).toContain('agent-plugins.org')
    expect(mcp.mcpServers.spar.args).toEqual(['mcp'])
    expect(claudeMcp.mcpServers.spar.args).toEqual(['mcp'])
  })
})
