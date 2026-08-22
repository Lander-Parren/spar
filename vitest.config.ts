import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Only spar's own tests. example/ is a fixture you point spar at, and its tests
    // run on node:test rather than vitest.
    include: ['test/**/*.test.ts'],
  },
})
