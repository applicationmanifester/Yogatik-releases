import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    host: true, // accessible from mobile on LAN
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
