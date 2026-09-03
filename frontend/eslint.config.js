import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, global: 'readonly', globalThis: 'readonly' },
    },
    settings: { react: { version: '18' } },
    rules: {
      'no-undef': 'error',
      // Catches <Foo /> with no import — plain no-undef does NOT flag JSX
      // component references, which is how a missing ReactMarkdown import
      // shipped to production.
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // ignoreRestSiblings: `const { id, ...rest } = row` is how ids are stripped.
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^React$', ignoreRestSiblings: true }],
    },
  },
  {
    // Test files run under Vitest/Node, not a browser — a handful (e.g.
    // ollamaDaemon.test.js spinning up a real local HTTP server,
    // castCore.test.js encoding a Buffer) legitimately use `process`/
    // `Buffer`/etc. The browser-only globals above make that a `no-undef`
    // error, which is real (npm run lint genuinely fails on it) even though
    // it's a config gap, not a bug in the test. Flat config MERGES
    // `languageOptions.globals` across matching blocks, so this only ADDS
    // Node globals for test files — real app source under src/ still gets
    // caught if it accidentally reaches for a Node-only global by mistake.
    files: ['**/*.test.{js,jsx}', '**/test-setup.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
