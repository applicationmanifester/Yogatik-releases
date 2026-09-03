/**
 * mcpRegistry.js — what MCP help a message needs, decided BEFORE the model
 * ever has to say "I don't have access to that."
 *
 * mcp.js already does the mechanical half well: refreshMcpTools() connects to
 * every CONFIGURED, enabled server once at app boot (App.jsx effect). What was
 * missing was everything upstream of "configured" — nothing ever looked at
 * what a message actually needs and connected accordingly. mcp_search_tools'
 * own honest fallback text says as much: "No MCP servers are configured. Add
 * connectors in Settings -> MCP Connectors" — true, and a dead end for a user
 * who has no idea an MCP connector for Notion/Stripe/GitHub even exists, or
 * that they already added one and then absent-mindedly disabled it.
 *
 * Two DIFFERENT outcomes on purpose, because they carry different risk:
 *   - A server the user already configured, just currently DISABLED, needs no
 *     new credential to reconnect — flipping it back on is genuinely
 *     automatic and safe. detectMcpNeed() returns these as `toEnable`.
 *   - A server the user has NEVER configured needs a token, an OAuth sign-in,
 *     or a locally-running process this app cannot supply on its own.
 *     Silently "connecting" one would just fail, or worse, connect to
 *     something using no credential at all and look like it worked when it
 *     answered nothing real. These come back as `suggestions` — surfaced to
 *     the MODEL so it can offer the connector to the user in plain language,
 *     never actioned on its own. Same "a new external connection is a
 *     decision, not a side effect" rule this codebase already applies to
 *     downloads (ComfyUI, WebLLM, chromeai).
 *
 * KNOWN_MCP_SERVERS is the SAME curated list McpServers.jsx's preset picker
 * shows (imported from here, not duplicated — this codebase has hit the
 * "two copies, only one wired" bug too many times to add a third list of the
 * same nine servers). `keywords: []` on a preset is deliberate, not an
 * oversight: local_desktop/git_mcp/memory_mcp all duplicate a capability this
 * app already has natively (fs_read/fs_write/terminal_run, git_status/git_diff/git_run,
 * and memory4.js's own four-store memory) — suggesting a competing external
 * server for something already built in would be actively confusing, so
 * those three are listed (still addable by hand) but never auto-detected.
 *
 * Notion and Linear's OFFICIAL remote MCP servers were evaluated and are
 * deliberately NOT in this list: both require a full OAuth 2.1 sign-in flow
 * (dynamic client registration + browser consent), and this app's MCP client
 * only ever sends a static `Authorization: Bearer <token>` header (mcp.js
 * buildServerHeaders). Listing them as one-click "paste a token" presets
 * would silently fail against their real endpoints — worse than not listing
 * them at all. A real OAuth-capable MCP client is a separate, larger feature.
 */

/** Presets connectable with what this app's MCP client actually supports today:
 * a Bearer token (or none) over Streamable HTTP, or a local stdio process. */
export const KNOWN_MCP_SERVERS = [
  {
    id: 'github_copilot',
    name: 'GitHub Copilot MCP',
    url: 'https://api.githubcopilot.com/mcp/',
    desc: 'Search repos, inspect code, read issues / PRs. Requires a GitHub token.',
    badge: 'Git & Code',
    transport: 'http',
    needsToken: true,
    keywords: ['github', 'github issue', 'github repo', 'pull request', 'github pr'],
  },
  {
    id: 'stripe',
    name: 'Stripe MCP',
    url: 'https://mcp.stripe.com/',
    desc: 'Payments, customers, invoices, and subscriptions via the Stripe API.',
    badge: 'Payments',
    transport: 'http',
    needsToken: true,
    keywords: ['stripe'],
  },
  {
    id: 'brave_search',
    name: 'Brave Search MCP',
    url: 'https://api.search.brave.com/mcp',
    desc: 'Privacy-preserving real-time web & news search. Requires Brave API key.',
    badge: 'Search API',
    transport: 'http',
    needsToken: true,
    keywords: ['brave search', 'brave api'],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare MCP',
    url: 'https://mcp.cloudflare.com/',
    desc: 'Manage Workers, KV, D1 databases, and Cloudflare services.',
    badge: 'Cloud',
    transport: 'http',
    needsToken: true,
    keywords: ['cloudflare', 'cloudflare worker', 'cloudflare kv', 'cloudflare d1'],
  },
  {
    id: 'local_desktop',
    name: 'Local Desktop MCP Bridge',
    url: 'http://localhost:3001/mcp',
    desc: 'Connect to your local workstation filesystem & terminal (run locally).',
    badge: 'Local Machine',
    transport: 'http',
    needsToken: false,
    keywords: [], // fs_*/terminal_run already cover this natively — see file header
  },
  {
    id: 'sqlite_mcp',
    name: 'SQLite MCP (Local)',
    desc: 'Query and manage local SQLite databases with schema inspection.',
    badge: 'Database',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', './workspace.db'],
    desktopOnly: true,
    keywords: ['sqlite', 'sqlite database', 'sqlite file'],
  },
  {
    id: 'postgres_mcp',
    name: 'PostgreSQL MCP (Local)',
    desc: 'Read schemas, inspect tables, and execute SQL queries.',
    badge: 'PostgreSQL',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    desktopOnly: true,
    keywords: ['postgres', 'postgresql', 'psql database'],
  },
  {
    id: 'git_mcp',
    name: 'Git MCP (Local)',
    desc: 'Inspect git commits, history, diffs, branches, and repository state.',
    badge: 'Git',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    desktopOnly: true,
    keywords: [], // git_status/git_diff/git_run already cover this natively — see file header
  },
  {
    id: 'memory_mcp',
    name: 'Memory Graph MCP (Local)',
    desc: 'Persistent graph-based knowledge memory across conversations.',
    badge: 'Memory',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    desktopOnly: true,
    keywords: [], // memory4.js already covers this natively — see file header
  },
]

function normalize(s) { return String(s || '').toLowerCase() }

/** A keyword phrase matches as a whole word/phrase, not a random substring
 * inside another word ("git" must not match "digit" or "legitimate"). Padding
 * the haystack with spaces lets the same boundary class handle both ends
 * without a lookbehind (Safari-safe; this file has no ES2018 requirement). */
function keywordHits(text, keywords) {
  if (!keywords || keywords.length === 0) return false
  const padded = ` ${text} `
  for (const kw of keywords) {
    const k = normalize(kw)
    if (!k) continue
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`[^a-z0-9]${esc}[^a-z0-9]`, 'i')
    if (re.test(padded)) return true
  }
  return false
}

const STOPWORDS = new Set(['mcp', 'server', 'local', 'the', 'and', 'for', 'api', 'http', 'https'])

/** Loose keywords derived from a user-typed server's own NAME, so a custom or
 * private connector ("Company Jira", "Internal Wiki") the user configured
 * themselves — not one of the curated presets above — can still be found and
 * re-enabled by name. Short (<4 char) tokens and common connector-ish
 * stopwords are dropped: keeping them would make "reconnect automatically"
 * mean "reconnect on almost every message". Only ever used for a server with
 * no matching KNOWN_MCP_SERVERS entry — a known preset's OWN `keywords`
 * (including a deliberate empty list) always wins over this fallback. */
function keywordsFromName(name) {
  return normalize(name)
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
}

/**
 * Decide what MCP help a message needs, from what is already configured plus
 * the small curated list above.
 *
 * @param {string} text - the user's message.
 * @param {Array} configuredServers - result of mcp.js getMcpServers().
 * @returns {{toEnable: Array, suggestions: Array}}
 *   toEnable    - entries FROM configuredServers (same shape, same object
 *                 identity fields) that are currently disabled and match —
 *                 safe to flip back on with no new credential.
 *   suggestions - entries FROM KNOWN_MCP_SERVERS not configured at all —
 *                 never auto-connected, only worth mentioning to the user.
 */
export function detectMcpNeed(text, configuredServers = []) {
  const msg = normalize(text)
  const toEnable = []
  const suggestions = []
  if (!msg.trim()) return { toEnable, suggestions }

  const servers = Array.isArray(configuredServers) ? configuredServers : []

  for (const s of servers) {
    if (s?.enabled === false) {
      const known = KNOWN_MCP_SERVERS.find(k => k.id === s.id)
      // A known preset's own keyword policy always wins, including a
      // deliberate empty list — never fall back to name-guessing for one of
      // our own presets (see local_desktop/git_mcp/memory_mcp above).
      const kws = known ? known.keywords : keywordsFromName(s.name)
      if (keywordHits(msg, kws)) toEnable.push(s)
    }
  }

  const configuredIds = new Set(servers.map(s => s.id))
  const configuredUrls = new Set(servers.map(s => s.url).filter(Boolean))
  for (const known of KNOWN_MCP_SERVERS) {
    if (!known.keywords?.length) continue
    if (configuredIds.has(known.id)) continue
    if (known.url && configuredUrls.has(known.url)) continue
    if (keywordHits(msg, known.keywords)) suggestions.push(known)
  }

  return { toEnable, suggestions }
}
