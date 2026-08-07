import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',          // DOMParser for the search/extract parsers
    include: ['src/**/*.test.js'],
    // One jsdom environment instead of one per file: parallel environments
    // cost more to spin up than these tests take to run.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
