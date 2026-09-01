// Present so vitest resolves ITS OWN config here and stops walking up the
// directory tree — without this, `vitest run` from functions/ picks up the
// repo root's vite.config.ts (a frontend/-workspace config, pulling in a
// rollup native binary this sandbox does not have for this platform) even
// though functions/ is not part of that workspace. This package is plain
// Node — nothing here needs jsdom, a bundler plugin, or the frontend build.
module.exports = {
  test: {
    environment: 'node',
    include: ['*.test.js'],
    globals: true,
  },
}
