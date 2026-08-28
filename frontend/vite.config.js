import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only LLM proxy — forwards requests to non-CORS providers (NVIDIA etc.)
function llmProxyPlugin() {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm-proxy', (req, res, next) => {
        // CORS preflight — must be handled first
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400',
          })
          res.end()
          return
        }

        const targetUrl = req.headers['x-target-url']
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }))
          return
        }

        const skip = new Set(['host', 'connection', 'x-target-url'])
        const headers = {}
        for (const [k, v] of Object.entries(req.headers)) {
          if (!skip.has(k.toLowerCase()) && typeof v === 'string') headers[k] = v
        }

        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks)
            const isBodyless = req.method === 'GET' || req.method === 'HEAD'
            const resp = await fetch(targetUrl, {
              method: req.method || 'POST',
              headers,
              body: isBodyless || body.length === 0 ? undefined : body,
            })

            res.writeHead(resp.status, {
              'Content-Type': resp.headers.get('content-type') || 'application/json',
              'Access-Control-Allow-Origin': '*',
            })

            if (resp.body) {
              const reader = resp.body.getReader()
              while (true) {
                const { done, value } = await reader.read()
                if (done) { res.end(); return }
                res.write(value)
              }
            } else {
              res.end(await resp.text())
            }
          } catch (e) {
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
            res.end(JSON.stringify({ error: e.message }))
          }
        })
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '3.21.0'),
  },
  esbuild: {
    legalComments: 'none',
  },
  clearScreen: false,
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase'
            if (id.includes('lucide-react')) return 'vendor-lucide'
            // Prism is deliberately React.lazy inside CodeBlock — most chats
            // contain no code block and phones should not pay for it on first
            // paint. Naming it in the SAME chunk as react-markdown silently
            // undid that: react-markdown is in the eager graph, so the lazy
            // import resolved to an already-downloaded chunk and the
            // highlighter shipped on every first load anyway.
            if (id.includes('react-syntax-highlighter') || id.includes('prismjs') || id.includes('refractor')) return undefined
            // CodeMirror, for exactly the same reason and caught the same way.
            if (id.includes('@codemirror') || id.includes('@lezer')) return undefined
            if (
              id.includes('react-markdown') ||
              id.includes('remark-') ||
              id.includes('rehype-') ||
              id.includes('micromark') ||
              id.includes('unist-') ||
              id.includes('mdast-') ||
              id.includes('vfile') ||
              id.includes('unified') ||
              id.includes('devlop') ||
              id.includes('property-information') ||
              id.includes('html-void-elements') ||
              id.includes('space-separated-tokens') ||
              id.includes('comma-separated-tokens') ||
              id.includes('decode-named-character-reference') ||
              id.includes('character-entities') ||
              id.includes('zwitch') ||
              id.includes('longest-streak') ||
              id.includes('markdown-table') ||
              id.includes('ccount') ||
              id.includes('bail')
            ) return 'vendor-markdown'
            if (id.includes('dexie')) return 'vendor-dexie'
            if (id.includes('zustand') || id.includes('zod')) return 'vendor-state'
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('canvas-confetti') || id.includes('chart.js') || id.includes('mermaid')) return 'vendor-viz'
            return 'vendor-libs'
          }
        },
      },
    },
  },
})
