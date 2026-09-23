// Dedicated vitest config for the electron main-process unit tests.
// The root frontend config only includes src/**/*.test.{js,jsx}; these tests
// live under electron/ and run in plain node (no jsdom, no react plugin).
export default {
  test: {
    environment: 'node',
    include: ['electron/core/*.test.ts', 'electron/security/*.test.ts', 'electron/system/*.test.ts'],
    globals: true,
  },
}