var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var DEFAULT_ORIGINS = [
  "https://yogatik.web.app",
  "https://yogatik.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:4173"
];
function corsHeaders(origin, env) {
  const list = env?.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
  const allowed = list.includes(origin) ? origin : list[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Target-URL",
    "Access-Control-Max-Age": "86400"
  };
}
__name(corsHeaders, "corsHeaders");
var worker_default = {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
    }
    const targetUrl = request.headers.get("X-Target-URL");
    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing X-Target-URL header" }),
        { status: 400, headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" } }
      );
    }
    const allowedHosts = [
      "integrate.api.nvidia.com",
      "api.nvidia.com"
    ];
    try {
      const url = new URL(targetUrl);
      if (!allowedHosts.some((h) => url.hostname.endsWith(h))) {
        return new Response(
          JSON.stringify({ error: "Target host not allowed" }),
          { status: 403, headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" } }
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid target URL" }),
        { status: 400, headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" } }
      );
    }
    const skipHeaders = /* @__PURE__ */ new Set([
      "host",
      "origin",
      "referer",
      "x-target-url",
      "x-forwarded-for",
      "x-forwarded-proto",
      "cf-connecting-ip",
      "cf-ray",
      "cf-visitor",
      "connection",
      "upgrade"
    ]);
    const forwardHeaders = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (!skipHeaders.has(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    }
    try {
      const upstream = await fetch(targetUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: ["GET", "HEAD"].includes(request.method) ? void 0 : request.body
      });
      const responseHeaders = new Headers(corsHeaders(origin, env));
      const copyHeaders = ["content-type", "x-request-id"];
      for (const h of copyHeaders) {
        const val = upstream.headers.get(h);
        if (val) responseHeaders.set(h, val);
      }
      responseHeaders.set("Cache-Control", "no-cache, no-transform");
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Proxy error", message: err.message }),
        { status: 502, headers: { ...corsHeaders(origin, env), "Content-Type": "application/json" } }
      );
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
