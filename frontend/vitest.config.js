import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',          // DOMParser for the search/extract parsers
    include: ['src/**/*.test.js'],
  },
})
