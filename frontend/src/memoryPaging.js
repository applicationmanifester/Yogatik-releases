/**
 * MemGPT/Letta-Style Virtual Context & Memory Paging
 * 
 * Inspired by memgpt/memgpt and getzep/zep.
 * Implements an operating-system-inspired two-tier memory hierarchy:
 * - RAM (Working Context Window): Fast, limited conversational turns currently in flight.
 * - Disk (Archival Storage / IndexedDB): Persistent memory blocks, user persona facts,
 *   decision records, and historical conversation pages.
 * - Page Fault Handler: Transparently retrieves archived memory blocks when referenced.
 */

export class MemoryPagingManager {
  constructor({ maxWorkingTokens = 8000, pageSize = 2000 } = {}) {
    this.maxWorkingTokens = maxWorkingTokens
    this.pageSize = pageSize
    this.workingContext = []      // RAM
    this.archivalStorage = new Map() // Disk / Archival Memory Pages
    this.corePersona = {}         // Persistent Core Facts
  }

  /**
   * Estimates token count (~4 chars per token).
   */
  estimateTokens(text = '') {
    return Math.ceil((typeof text === 'string' ? text.length : 0) / 4)
  }

  /**
   * Sets or updates a persistent core fact (never paged out).
   */
  setCoreFact(key, value) {
    if (!key) return
    this.corePersona[key] = value
  }

  /**
   * Inserts a new conversational turn into working memory (RAM),
   * triggering a page-out (virtual context paging) if the token budget is exceeded.
   */
  pushTurn(turn) {
    if (!turn) return
    this.workingContext.push(turn)
    this.checkAndPageOut()
  }

  /**
   * Pages out older turns into archival storage blocks when RAM fills up.
   */
  checkAndPageOut() {
    let totalChars = this.workingContext.reduce((acc, t) => acc + (typeof t.content === 'string' ? t.content.length : 0), 0)
    let totalTokens = Math.ceil(totalChars / 4)

    if (totalTokens <= this.maxWorkingTokens || this.workingContext.length <= 2) {
      return
    }

    // Page out the oldest turns into an archival memory block
    const pagedTurns = []
    while (totalTokens > this.maxWorkingTokens && this.workingContext.length > 2) {
      const turn = this.workingContext.shift()
      pagedTurns.push(turn)
      totalTokens -= Math.ceil((typeof turn.content === 'string' ? turn.content.length : 0) / 4)
    }

    if (pagedTurns.length > 0) {
      const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      this.archivalStorage.set(pageId, {
        timestamp: Date.now(),
        turns: pagedTurns,
        summary: pagedTurns.map(t => `${t.role}: ${(t.content || '').slice(0, 80)}`).join('\n')
      })
    }
  }

  /**
   * Page Fault: Searches archival storage for facts relevant to a given query
   * and pages them back into working context or returns them as an excerpt.
   */
  pageFault(query = '') {
    if (!query || !query.trim() || this.archivalStorage.size === 0) {
      return []
    }

    const q = query.toLowerCase()
    const hits = []

    for (const [pageId, page] of this.archivalStorage.entries()) {
      for (const turn of page.turns) {
        const content = (turn.content || '').toLowerCase()
        if (content.includes(q)) {
          hits.push({
            pageId,
            role: turn.role,
            content: turn.content,
            timestamp: page.timestamp
          })
        }
      }
    }

    return hits
  }

  /**
   * Returns formatted prompt injection representing Core Facts + Active RAM Context.
   */
  renderActiveContext() {
    const coreFactsBlock = Object.keys(this.corePersona).length > 0
      ? `[Core Persona & Memory Facts]\n` + Object.entries(this.corePersona).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : ''

    return {
      coreFactsBlock,
      workingTurns: this.workingContext,
      archivedPageCount: this.archivalStorage.size
    }
  }
}
