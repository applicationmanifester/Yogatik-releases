import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/types/index.ts',
    'src/utils/index.ts',
    'src/constants/index.ts'
  ],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['zod'],
  platform: 'neutral',
  target: 'ES2022',
  outDir: 'dist',
  esbuildOptions(options) {
    options.banner = {
      js: '// @myapp/shared - Shared code for Electron and Web apps'
    }
  }
})