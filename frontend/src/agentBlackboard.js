/**
 * agentBlackboard.js — High-speed shared in-memory blackboard for Multi-Agent Workflows.
 * Enables concurrent or sequential sub-agents to share discovered facts, URLs,
 * code snippets, and intermediate deductions without burning duplicate LLM tokens.
 * Supports cross-session persistence.
 */

import { getSetting, setSetting } from './db'

export class AgentBlackboard {
  constructor(sessionId = 'default') {
    this.sessionId = sessionId
    this.facts = new Map()
    this.notes = []
    this.codeSnippets = new Map()
    this.createdAt = Date.now()
  }

  /** Record a verified fact or key-value finding */
  setFact(key, value, sourceAgent = 'agent') {
    if (!key) return
    this.facts.set(String(key), {
      value,
      sourceAgent,
      timestamp: Date.now(),
    })
  }

  /** Retrieve a specific fact by key */
  getFact(key) {
    return this.facts.get(String(key))?.value
  }

  /** Add a discovery note or observation */
  appendNote(note, sourceAgent = 'agent') {
    if (!note || typeof note !== 'string') return
    this.notes.push({
      text: note.trim(),
      sourceAgent,
      timestamp: Date.now(),
    })
  }

  /** Store a reusable code snippet or artifact reference */
  setCodeSnippet(identifier, code, language = 'text', sourceAgent = 'agent') {
    if (!identifier || !code) return
    this.codeSnippets.set(String(identifier), {
      code: String(code).trim(),
      language,
      sourceAgent,
      timestamp: Date.now(),
    })
  }

  /** Produce a compact Markdown context summary to inject into downstream agent prompts */
  formatContextPrompt() {
    const parts = []

    if (this.facts.size > 0) {
      const factLines = Array.from(this.facts.entries()).map(
        ([k, v]) => `- **${k}**: ${typeof v.value === 'object' ? JSON.stringify(v.value) : v.value} *(from ${v.sourceAgent})*`
      )
      parts.push(`### Shared Findings & Facts:\n${factLines.join('\n')}`)
    }

    if (this.notes.length > 0) {
      const noteLines = this.notes.slice(-8).map(n => `- [${n.sourceAgent}]: ${n.text}`)
      parts.push(`### Team Notes:\n${noteLines.join('\n')}`)
    }

    if (this.codeSnippets.size > 0) {
      const snippetBlocks = Array.from(this.codeSnippets.entries()).slice(-3).map(
        ([name, s]) => `\`\`\`${s.language} // ${name} (${s.sourceAgent})\n${s.code}\n\`\`\``
      )
      parts.push(`### Shared Code Snippets:\n${snippetBlocks.join('\n\n')}`)
    }

    return parts.join('\n\n')
  }

  /** Serialize blackboard for persistence */
  toJSON() {
    return {
      sessionId: this.sessionId,
      facts: Array.from(this.facts.entries()),
      notes: this.notes,
      codeSnippets: Array.from(this.codeSnippets.entries()),
      createdAt: this.createdAt,
    }
  }

  /** Restore blackboard from serialized state */
  static fromJSON(data) {
    const bb = new AgentBlackboard(data.sessionId)
    bb.facts = new Map(data.facts || [])
    bb.notes = data.notes || []
    bb.codeSnippets = new Map(data.codeSnippets || [])
    bb.createdAt = data.createdAt || Date.now()
    return bb
  }

  /** Clear or reset the blackboard */
  clear() {
    this.facts.clear()
    this.notes = []
    this.codeSnippets.clear()
  }
}

// Global active session blackboard map
const activeBlackboards = new Map()

export function getSessionBlackboard(sessionId = 'default') {
  if (!activeBlackboards.has(sessionId)) {
    const bb = new AgentBlackboard(sessionId)
    activeBlackboards.set(sessionId, bb)
    // Non-blocking background restore if data exists
    getSetting(`blackboard_${sessionId}`).then(saved => {
      if (saved && activeBlackboards.get(sessionId) === bb) {
        if (saved.facts) {
          for (const [k, v] of saved.facts) {
            if (!bb.facts.has(k)) bb.facts.set(k, v)
          }
        }
        if (saved.notes && bb.notes.length === 0) {
          bb.notes.push(...saved.notes)
        }
        if (saved.codeSnippets) {
          for (const [k, v] of saved.codeSnippets) {
            if (!bb.codeSnippets.has(k)) bb.codeSnippets.set(k, v)
          }
        }
      }
    }).catch(() => {})
  }
  return activeBlackboards.get(sessionId)
}

export async function loadSessionBlackboard(sessionId = 'default') {
  try {
    const saved = await getSetting(`blackboard_${sessionId}`)
    if (saved) {
      const bb = AgentBlackboard.fromJSON(saved)
      activeBlackboards.set(sessionId, bb)
      return bb
    }
  } catch { /* ignore */ }
  return getSessionBlackboard(sessionId)
}

export async function persistBlackboard(sessionId = 'default') {
  const bb = activeBlackboards.get(sessionId)
  if (bb) {
    await setSetting(`blackboard_${sessionId}`, bb.toJSON())
  }
}

export function clearBlackboard(sessionId = 'default') {
  activeBlackboards.delete(sessionId)
}