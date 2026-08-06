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
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Target-URL',
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

        const headers = {}
        if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type']
        if (req.headers['authorization']) headers['Authorization'] = req.headers['authorization']

        const chunks = []
        req.on('data', c => chunks.push(c))
        req.on('end', async () => {
          try {
            const body = Buffer.concat(chunks)
            const resp = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body: body.length > 0 ? body : undefined,
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
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
