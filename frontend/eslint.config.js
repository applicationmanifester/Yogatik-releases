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
]
