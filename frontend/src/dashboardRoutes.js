/**
 * The dashboard's route shape, kept in its own tiny, dependency-free module.
 *
 * App.jsx needs to validate and build these paths on every page load (before
 * anything is lazy) and on every popstate. DashboardShell.jsx — which owns
 * the full DASHBOARD_SECTIONS list (labels, blurbs, icons, groups) — is
 * loaded via safeLazy() on purpose, to keep it out of the eager bundle. If
 * App.jsx imported even one constant from that file, ES modules being
 * per-file rather than per-export means the WHOLE component (and its lucide
 * icons) would be pulled in eagerly too, quietly undoing the lazy-load. See
 * the "First visit downloaded the whole app TWICE" note in CLAUDE.md — this
 * module exists so that mistake can't happen here.
 *
 * Nested under /app/ rather than flat (/billing, /agents, ...) deliberately:
 * a flat /settings collides with the static, crawlable marketing page
 * firebase.json already rewrites there (settings.html, with its own "Launch
 * App Settings Center" CTA into /?tab=settings). /app/* is a namespace
 * nothing on the public marketing site will ever claim, now or later.
 */

export const DASHBOARD_KEYS = [
  'account', 'settings', 'providers', 'privacy', 'billing', 'usage', 'diagnostics',
  'capabilities', 'agents', 'skills', 'mcp', 'plugins',
]

export const DASHBOARD_PATH_PREFIX = '/app'

export const DASHBOARD_TITLES = {
  account: 'Account',
  settings: 'Personalization',
  providers: 'Providers & Keys',
  privacy: 'Privacy & Backup',
  billing: 'Billing',
  usage: 'Usage & Data',
  diagnostics: 'Diagnostics',
  capabilities: 'Capabilities',
  agents: 'Agents',
  skills: 'Skills & Workflows',
  mcp: 'MCP Servers',
  plugins: 'Plugins',
}

export function dashboardPath(key) {
  return `${DASHBOARD_PATH_PREFIX}/${key}`
}

/** Parses `/app/<key>` back into a validated key, or null for anything else. */
export function dashboardKeyFromPath(pathname) {
  const clean = (pathname || '').toLowerCase().replace(/\/+$/, '')
  const m = clean.match(/^\/app\/([a-z-]+)$/)
  return m && DASHBOARD_KEYS.includes(m[1]) ? m[1] : null
}

export const LEGACY_SHORTCUTS = [
  '/billing', '/agents', '/skills', '/mcp', '/plugins',
  '/diagnostics', '/usage', '/capabilities', '/tools-picker', '/settings',
]

export const STATIC_PAGES = [
  '/platforms', '/guide', '/tools', '/how-it-works', '/faq',
  '/privacy', '/terms', '/pricing', '/refunds', '/checkout',
]

/** Checks if a path is a known valid route in Yogatik. */
export function isValidRoute(pathname) {
  const clean = (pathname || '').toLowerCase().replace(/\/+$/, '')
  if (!clean || clean === '/live') return true
  if (dashboardKeyFromPath(clean)) return true
  if (LEGACY_SHORTCUTS.includes(clean)) return true
  if (STATIC_PAGES.includes(clean)) return true
  return false
}
