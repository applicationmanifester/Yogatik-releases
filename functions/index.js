const { onRequest } = require("firebase-functions/v2/https");

/**
 * Universal CORS proxy for LLM APIs that don't support browser CORS.
 * Forwards requests to the target URL specified in the X-Target-URL header,
 * passing through Authorization and other headers, and streams the response back.
 */
exports.llmProxy = onRequest(
  { cors: true, region: "us-central1", memory: "256MiB", timeoutSeconds: 120 },
  async (req, res) => {
    const targetUrl = req.headers["x-target-url"];
    if (!targetUrl) {
      res.status(400).json({ error: "Missing X-Target-URL header" });
      return;
    }

    // Build headers to forward (skip hop-by-hop and host headers)
    const skipHeaders = new Set([
      "host", "x-target-url", "origin", "referer",
      "x-forwarded-for", "x-forwarded-proto", "x-forwarded-host",
      "connection", "transfer-encoding",
    ]);
    const forwardHeaders = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders[key] = value;
      }
    }

    try {
      const fetchOptions = {
        method: req.method,
        headers: forwardHeaders,
      };

      // Forward body for POST/PUT/PATCH
      if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
        fetchOptions.body =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      }

      const upstream = await fetch(targetUrl, fetchOptions);

      // Copy status and selected response headers
      res.status(upstream.status);
      const ct = upstream.headers.get("content-type");
      if (ct) res.set("Content-Type", ct);

      // Stream or send body
      const body = await upstream.arrayBuffer();
      res.send(Buffer.from(body));
    } catch (err) {
      console.error("llmProxy error:", err);
      res.status(502).json({ error: "Proxy error", message: err.message });
    }
  }
);
