import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',          // DOMParser for the search/extract parsers
    include: ['src/**/*.test.{js,jsx}'],
    // One jsdom environment instead of one per file: parallel environments
    // cost more to spin up than these tests take to run.
    setupFiles: ['./test-setup.js'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
})
