/**
 * Pure, stateless helpers pulled out of App.jsx (which was 5816 lines and
 * holds ~260 hooks — see CLAUDE.md's redesign notes). None of these read or
 * write component state; they're straightforward inputs → outputs, so they
 * move without any behaviour risk. This is a first, safe slice — the
 * stateful core (chat, live, workspace, settings) is a separate, much
 * higher-risk decomposition that needs its own careful, verified pass.
 */
import { Globe, FileCode, Brain, Wrench, ShieldCheck, Wand2, Sparkles } from 'lucide-react'

/** 329189ms is unreadable; 5m 29s is not. */
export function formatLatency(ms) {
  if (ms == null || isNaN(ms)) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

export function getStatusIcon(text = '') {
  const t = text.toLowerCase()
  if (t.includes('search') || t.includes('web') || t.includes('fetching')) return <Globe size={13} style={{ color: '#38bdf8' }} />
  if (t.includes('code') || t.includes('file') || t.includes('read') || t.includes('write')) return <FileCode size={13} style={{ color: '#a855f7' }} />
  if (t.includes('think') || t.includes('reason') || t.includes('analyz')) return <Brain size={13} style={{ color: '#ec4899' }} />
  if (t.includes('running') || t.includes('execut') || t.includes('tool')) return <Wrench size={13} style={{ color: '#f59e0b' }} />
  if (t.includes('verif') || t.includes('test') || t.includes('audit')) return <ShieldCheck size={13} style={{ color: '#10b981' }} />
  if (t.includes('enhanc')) return <Wand2 size={13} style={{ color: '#ff6b35' }} />
  return <Sparkles size={13} style={{ color: 'var(--accent-color, #ff6b35)' }} />
}

export function formatDirectTimeAnswer() {
  const locale = navigator.language || 'en-US'
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'
  const now = new Date()
  const date = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(now)
  return `${date} at ${time} (${tz})`
}

// Messages rendered at once; older turns load on demand.
export const WINDOW_STEP = 40

export const SUGGESTIONS = [
  {
    category: 'Live Research',
    label: "Search today's top AI & tech breakthroughs",
    prompt: "Search the web for today's top artificial intelligence and tech news highlights with key takeaways.",
  },
  {
    category: 'Productivity',
    label: "Draft a polite follow-up email on project status",
    prompt: "Draft a concise, professional follow-up email asking for an update on a pending project review.",
  },
  {
    category: 'Code Assistant',
    label: "Debug and optimize a slow query or code snippet",
    prompt: "Review my code, identify performance bottlenecks, and suggest clean, efficient optimizations.",
  },
  {
    category: 'Creative Gen',
    label: "Generate a cozy cyberpunk coffee shop image",
    prompt: "Generate an image of a cozy cyberpunk coffee shop in Tokyo on a rainy evening with warm neon glow.",
  },
  {
    category: 'Learning',
    label: "Explain complex concepts with everyday analogies",
    prompt: "Explain how neural networks and large language models work using a simple, relatable everyday analogy.",
  },
  {
    category: 'Daily Planning',
    label: "Create a 5-day quick meal prep & grocery list",
    prompt: "Create a balanced 5-day dinner meal plan under 30 minutes with an organized grocery shopping list.",
  },
]
