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
            // highlighter shipped on every first load anyway. Measured
            // 2026-08-24: vendor-markdown was 862KB and arrived BEFORE first
            // paint, on an empty chat with nothing to highlight.
            //
            // And it must not be given a manual chunk NAME either. Vite emits
            // <link rel="modulepreload"> for every manual chunk the entry graph
            // touches, so naming it `vendor-prism` still pulled 747KB during
            // the first paint — the preload does not care that the import is
            // dynamic. Returning undefined leaves it in the async chunk Rollup
            // creates for CodeBlock's own import(), which is not preloaded.
            if (id.includes('react-syntax-highlighter') || id.includes('prismjs') || id.includes('refractor')) return undefined
            // CodeMirror, for exactly the same reason and caught the same way.
            // The `vendor-libs` catch-all below is a TRAP for any new dependency
            // that is meant to be lazy: it is a named manual chunk in the entry
            // graph, so Vite modulepreloads it and the editor's 350KB arrived
            // during first paint despite src/workspace/codemirror.js importing
            // every piece dynamically. Measured with `vite build` — the
            // package.json diff alone shows nothing.
            if (id.includes('@codemirror') || id.includes('@lezer')) return undefined
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('micromark') || id.includes('unist-') || id.includes('mdast-') || id.includes('vfile')) return 'vendor-markdown'
            if (id.includes('dexie')) return 'vendor-dexie'
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
            if (id.includes('canvas-confetti') || id.includes('chart.js') || id.includes('mermaid')) return 'vendor-viz'
            return 'vendor-libs'
          }
        },
      }
    }
  },
})
