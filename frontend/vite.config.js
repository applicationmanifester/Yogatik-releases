import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev-only LLM proxy — forwards requests to non-CORS providers (NVIDIA etc.)
function llmProxyPlugin() {
  const proxyHandler = (req, res, next) => {
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
      // Upstream timeout: a hung provider must not hang the dev server forever.
      // Long LLM generations legitimately run minutes, so this is generous.
      const upstreamTimeout = AbortSignal.timeout(120_000)
      // Client gone mid-stream: stop piping upstream immediately.
      let clientGone = false
      res.on('close', () => { clientGone = true })
      try {
        const body = Buffer.concat(chunks)
        const isBodyless = req.method === 'GET' || req.method === 'HEAD'
        const resp = await fetch(targetUrl, {
          method: req.method || 'POST',
          headers,
          body: isBodyless || body.length === 0 ? undefined : body,
          signal: upstreamTimeout,
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
            if (clientGone) { resp.body.cancel().catch(() => {}); return }
            // Backpressure: res.write() returning false means the socket buffer
            // is full — wait for 'drain' instead of ballooning memory on fast streams.
            if (!res.write(value)) {
              await new Promise(resolve => res.once('drain', resolve))
            }
          }
        } else {
          res.end(await resp.text())
        }
      } catch (e) {
        // Timeouts and client disconnects surface here too — only report a real
        // upstream failure when a response can still be written.
        if (!res.headersSent && !clientGone) {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          res.end(JSON.stringify({ error: e.message }))
        } else {
          try { res.end() } catch {}
        }
      }
    })
  }

  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm-proxy', proxyHandler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/llm-proxy', proxyHandler)
    },
  }
}

// CSP headers for dev server (matches electron/security.cjs)
const CSP = `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://api.openai.com https://api.groq.com https://openrouter.ai https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com https://api.anthropic.com https://api.elevenlabs.io https://api.kite.trade https://kite.zerodha.com; img-src 'self' data: blob: https:; media-src 'self' blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';`;

function cspPlugin() {
  return {
    name: 'csp-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', CSP);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', CSP);
        next();
      });
    },
  }
}

export default defineConfig({
  plugins: [react(), llmProxyPlugin(), cspPlugin()],
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
            // Keep heavy code editor and syntax highlighter as async chunks
            if (id.includes('react-syntax-highlighter') || id.includes('prismjs') || id.includes('refractor')) return undefined
            if (id.includes('@codemirror') || id.includes('@lezer')) return undefined
          }
        },
      },
    },
  },
})