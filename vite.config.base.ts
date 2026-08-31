import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export const baseConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@my-app/shared-ui': path.resolve(__dirname, 'packages/shared-ui/src'),
    },
  },
  build: { target: 'es2020', minify: 'esbuild' },
})