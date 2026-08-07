const { onRequest } = require("firebase-functions/v2/https");

/**
 * Universal CORS proxy for LLM APIs that don't support browser CORS.
 * Forwards to X-Target-URL and streams the response back chunk-by-chunk
 * (required for SSE token streaming — buffering would break live output).
 */
exports.llmProxy = onRequest(
  { cors: true, region: "us-central1", memory: "256MiB", timeoutSeconds: 300 },
  async (req, res) => {
    const targetUrl = req.headers["x-target-url"];
    if (!targetUrl) {
      res.status(400).json({ error: "Missing X-Target-URL header" });
      return;
    }

    const skipHeaders = new Set([
      "host", "x-target-url", "origin", "referer", "cookie",
      "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host",
      "connection", "transfer-encoding", "content-length",
      "accept-encoding", "user-agent",
    ]);
    const forwardHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!skipHeaders.has(k.toLowerCase())) forwardHeaders[k] = v;
    }

    try {
      const bodyless = req.method === "GET" || req.method === "HEAD";
      const fetchOptions = { method: req.method, headers: forwardHeaders };
      if (!bodyless && req.body != null) {
        fetchOptions.body = Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body);
      }

      const upstream = await fetch(targetUrl, fetchOptions);

      res.status(upstream.status);
      const ct = upstream.headers.get("content-type");
      if (ct) res.set("Content-Type", ct);
      // Defeat any intermediate buffering so SSE chunks reach the browser live
      res.set("Cache-Control", "no-cache, no-transform");
      res.set("X-Accel-Buffering", "no");
      if (typeof res.flushHeaders === "function") res.flushHeaders();

      if (!upstream.body) { res.end(); return; }

      const reader = upstream.body.getReader();
      req.on("close", () => reader.cancel().catch(() => {}));
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
        if (typeof res.flush === "function") res.flush();
      }
      res.end();
    } catch (err) {
      console.error("llmProxy error:", err);
      if (!res.headersSent) res.status(502).json({ error: "Proxy error", message: err.message });
      else res.end();
    }
  }
);
