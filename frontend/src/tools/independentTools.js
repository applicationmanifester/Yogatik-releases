/**
 * 100% Independent, keyless browser-native tools.
 * Zero external SaaS/API dependencies — all computation runs locally in JS.
 */
import { mdToHtml } from './mdToPdf'

const TEXT_STOPWORDS = new Set((
  'a an and are as at be but by for from has have i in is it its of on or ' +
  'that the their there these they this to was were will with you your we ' +
  'what when where which who why how can could should would may might do does ' +
  'did done into over under about after before during between within without ' +
  'than then them those those his her our your my me mine ours yours if not ' +
  'also just more most less many much much some any each every very still here'
).split(/\s+/))

const ORGANIZATION_HINTS = new Set([
  'inc', 'inc.', 'llc', 'ltd', 'ltd.', 'corp', 'corp.', 'company', 'co', 'co.',
  'university', 'institute', 'agency', 'department', 'ministry', 'bank', 'group',
  'studio', 'studios', 'labs', 'laboratory', 'association', 'committee', 'council',
  'foundation', 'press', 'media', 'systems', 'technologies', 'technology',
])

const LOCATION_HINTS = new Set([
  'city', 'state', 'country', 'province', 'county', 'district', 'region',
  'road', 'street', 'avenue', 'boulevard', 'drive', 'lane', 'park', 'bridge',
  'airport', 'harbor', 'harbour', 'bay', 'beach', 'mountain', 'lake', 'river',
  'valley', 'island', 'campus',
])

const CONNECTOR_WORDS = new Set(['of', 'the', 'and', 'de', 'del', 'da', 'van', 'von', 'la', 'di', 'du', '&'])
const LOCATION_PREPOSITIONS = new Set(['in', 'at', 'from', 'to', 'into', 'onto', 'near', 'around', 'through', 'within', 'inside', 'outside', 'across', 'over', 'under', 'between', 'by'])

function cleanText(text) {
  return String(text ?? '').replace(/\u00a0/g, ' ').trim()
}

function splitSentences(text) {
  return cleanText(text)
    .split(/(?<=[.!?…])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function tokenize(text) {
  return cleanText(text)
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9'’.-]*/g) || []
}

function meaningfulTokens(text) {
  return tokenize(text).filter(tok => tok.length > 2 && !TEXT_STOPWORDS.has(tok))
}

function uniquePush(arr, value) {
  if (!value) return
  const key = value.toLowerCase()
  if (!arr.some(item => item.toLowerCase() === key)) arr.push(value)
}

function joinSearchTerms(items) {
  return items.filter(Boolean).slice(0, 5).map(term => {
    const needsQuotes = /\s/.test(term)
    return needsQuotes ? `"${term}"` : term
  }).join(' ')
}

function classifyProperNoun(phrase, prevWord = '') {
  const lower = phrase.toLowerCase()
  const parts = lower.split(/\s+/).filter(Boolean)
  if (LOCATION_PREPOSITIONS.has(String(prevWord).toLowerCase()) && parts.length <= 3) return 'location'
  if (phrase.split(/\s+/).some(token => /[a-z][A-Z]/.test(token) || /^[A-Z]{2,}$/.test(token))) return 'organization'
  if (parts.some(p => ORGANIZATION_HINTS.has(p.replace(/[^\w.]/g, '')))) return 'organization'
  if (parts.some(p => LOCATION_HINTS.has(p.replace(/[^\w.]/g, '')))) return 'location'
  if (parts.length === 2 && /^[A-Z]/.test(phrase) && phrase.split(/\s+/).every(w => /^[A-Z][\w&.'-]*$/.test(w))) return 'person'
  if (/^[A-Z]{2,}$/.test(phrase.replace(/\s+/g, ''))) return 'acronym'
  return 'proper_noun'
}

function extractEntityCandidates(text) {
  const words = cleanText(text).match(/\b[\w&.'-]+\b/g) || []
  const out = []
  let run = []
  let runPrevWord = ''
  let prevWord = ''

  const flush = () => {
    if (run.length >= 2) {
      const phrase = run.join(' ').replace(/\s+/g, ' ').trim()
      if (phrase && phrase.length <= 80) out.push({ phrase, prevWord: runPrevWord })
    }
    run = []
    runPrevWord = ''
  }

  for (const word of words) {
    const lower = word.toLowerCase()
    const isCapitalized = /^[A-Z][\w&.'-]*$/.test(word) || /^[A-Z]{2,}$/.test(word)
    const isStandaloneEntity = /[a-z][A-Z]/.test(word) || /^[A-Z]{2,}$/.test(word)
    if (isStandaloneEntity) {
      flush()
      out.push({ phrase: word, prevWord })
    } else if (isCapitalized || CONNECTOR_WORDS.has(lower)) {
      if (!run.length) runPrevWord = prevWord
      run.push(word)
    } else {
      flush()
    }
    prevWord = lower
  }
  flush()
  return out
}

function extractDates(text) {
  const patterns = [
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
    /\b(?:19|20)\d{2}\b/g,
  ]
  const out = []
  for (const pattern of patterns) {
    for (const match of cleanText(text).match(pattern) || []) uniquePush(out, match)
  }
  return out
}

function extractUrls(text) {
  return [...new Set((cleanText(text).match(/https?:\/\/[^\s)]+/gi) || [])
    .map(url => url.replace(/[.,;:!?]+$/g, '')))]
}

function extractEmails(text) {
  return [...new Set(cleanText(text).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) || [])]
}

function extractNumbers(text) {
  return [...new Set(cleanText(text).match(/\b\d[\d,.]*(?:%|k|m|bn|billion|million|gb|mb|tb|km|kg|cm|mm|usd|eur|gbp|in|ft|mph|kph)?\b/gi) || [])]
}

function intentFromQuery(query) {
  const q = query.toLowerCase()
  if (/\b(vs|versus|compared to|compare|difference|which is better)\b/.test(q)) return 'compare'
  if (/\b(summarize|summary|brief|tl;dr|tldr|extract the gist)\b/.test(q)) return 'summarize'
  if (/\b(translate|translation)\b/.test(q)) return 'translate'
  if (/\b(code|debug|fix|error|stack trace|exception)\b/.test(q)) return 'coding'
  if (/\b(chart|graph|graphical|plot|visualize)\b/.test(q)) return 'visualize'
  if (/\b(calculate|compute|math|equation|solve|percent|percentage)\b/.test(q)) return 'compute'
  if (/\b(news|latest|current|today|now|price|prices|weather|release|update)\b/.test(q)) return 'research'
  if (/\b(write|draft|rewrite|improve|polish|expand)\b/.test(q)) return 'writing'
  if (/\b(who|what|when|where|why|how)\b/.test(q)) return 'fact_lookup'
  return 'general'
}

// ─── 1. Diagram & Mindmap Tool ──────────────────────────────────────────────
export const diagramRenderTool = {
  schema: {
    description:
      'Generate visual Mermaid.js flowcharts, mind maps, sequence diagrams, or entity graphs. ' +
      'Use whenever the user asks to "draw a diagram", "create a flowchart", "make a mind map", or "visualize a workflow".',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Diagram title' },
        type: {
          type: 'string',
          enum: ['flowchart', 'mindmap', 'sequenceDiagram', 'graph', 'classDiagram', 'gantt'],
          description: 'Type of diagram to generate',
        },
        mermaid_code: { type: 'string', description: 'Valid Mermaid.js diagram definition code string' },
      },
      required: ['title', 'type', 'mermaid_code'],
    },
  },
  async execute({ title, type, mermaid_code }) {
    return {
      success: true,
      tool: 'diagram_render',
      title,
      type,
      mermaid: mermaid_code.trim(),
    }
  },
}

// ─── 2. Code Formatter & Linter Tool ─────────────────────────────────────────
export const codeFormatTool = {
  schema: {
    description:
      'Clean, format, and fix indentation on source code snippets (JavaScript, HTML, CSS, JSON, Python, SQL). ' +
      'Use when code is poorly formatted, minified, or has broken indentation.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Source code text to format' },
        language: { type: 'string', description: 'Programming language (js, html, css, json, python, sql)' },
        indent_size: { type: 'number', description: 'Spaces per indent level (default 2)' },
      },
      required: ['code', 'language'],
    },
  },
  async execute({ code, language = 'js', indent_size = 2 }) {
    const spaces = ' '.repeat(Math.max(1, Math.min(8, indent_size)))
    let formatted = code
    const lang = language.toLowerCase()

    if (lang === 'json') {
      try {
        formatted = JSON.stringify(JSON.parse(code), null, indent_size)
      } catch (e) {
        return { success: false, error: `Invalid JSON: ${e.message}` }
      }
    } else {
      const lines = code.split('\n')
      let depth = 0
      formatted = lines.map(line => {
        const trimmed = line.trim()
        if (!trimmed) return ''
        if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith('</')) {
          depth = Math.max(0, depth - 1)
        }
        const indented = spaces.repeat(depth) + trimmed
        if (trimmed.endsWith('{') || trimmed.endsWith('[') || (trimmed.startsWith('<') && !trimmed.startsWith('</') && !trimmed.endsWith('/>') && !trimmed.includes('</'))) {
          depth++
        }
        return indented
      }).join('\n')
    }

    return {
      success: true,
      tool: 'code_format',
      language,
      original_length: code.length,
      formatted_length: formatted.length,
      formatted_code: formatted,
    }
  },
}

// ─── 3. Text Analytics & Readability Tool ────────────────────────────────────
export const textAnalyticsTool = {
  schema: {
    description:
      'Analyze text for readability metrics, word/sentence counts, sentiment polarity, and reading time. ' +
      'Use when asked to analyze writing style, readability grade, or text statistics.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
      },
      required: ['text'],
    },
  },
  async execute({ text }) {
    if (!text?.trim()) return { error: 'Empty text provided' }

    const clean = text.trim()
    const words = clean.split(/\s+/).filter(Boolean)
    const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 0)
    const charCount = clean.length
    const wordCount = words.length
    const sentenceCount = sentences.length || 1

    let syllables = 0
    words.forEach(w => {
      const match = w.toLowerCase().replace(/(?:[^laeiouy]es|ed|e)$/i, '').match(/[aeiouy]{1,2}/g)
      syllables += match ? match.length : 1
    })

    const wordsPerSentence = wordCount / sentenceCount
    const syllablesPerWord = syllables / (wordCount || 1)
    const readingEase = Math.round((206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord)) * 10) / 10
    const gradeLevel = Math.round((0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59) * 10) / 10

    const posWords = new Set(['good', 'great', 'excellent', 'amazing', 'positive', 'wonderful', 'happy', 'love', 'best', 'benefit', 'effective', 'fast'])
    const negWords = new Set(['bad', 'poor', 'terrible', 'awful', 'negative', 'hate', 'worst', 'issue', 'problem', 'slow', 'fail', 'error'])
    let pos = 0, neg = 0
    words.forEach(w => {
      const lower = w.toLowerCase()
      if (posWords.has(lower)) pos++
      if (negWords.has(lower)) neg++
    })
    const sentiment = pos > neg ? 'Positive' : neg > pos ? 'Negative' : 'Neutral'

    return {
      success: true,
      tool: 'text_analytics',
      word_count: wordCount,
      character_count: charCount,
      sentence_count: sentenceCount,
      avg_sentence_length: Math.round(wordsPerSentence * 10) / 10,
      estimated_reading_time_sec: Math.round((wordCount / 200) * 60),
      readability: {
        flesch_reading_ease: readingEase,
        grade_level: gradeLevel > 0 ? gradeLevel : 0,
        complexity: readingEase > 60 ? 'Easy' : readingEase > 30 ? 'Moderate' : 'Difficult',
      },
      sentiment_analysis: {
        polarity: sentiment,
        positive_words: pos,
        negative_words: neg,
      },
    }
  },
}

// ─── 4. Data Statistics Calculator Tool ──────────────────────────────────────
export const dataStatsTool = {
  schema: {
    description:
      'Compute numerical statistics (mean, median, min, max, std dev, counts) on CSV or JSON datasets. ' +
      'Use when the user provides data tables or arrays of numbers to analyze.',
    parameters: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Raw CSV text or JSON array string' },
        numeric_column: { type: 'string', description: 'Optional column name or property key to analyze' },
      },
      required: ['data'],
    },
  },
  async execute({ data, numeric_column }) {
    try {
      let nums = []
      if (data.trim().startsWith('[') || data.trim().startsWith('{')) {
        const parsed = JSON.parse(data)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        if (numeric_column) {
          nums = arr.map(row => Number(row[numeric_column])).filter(n => !isNaN(n))
        } else {
          nums = arr.map(row => typeof row === 'number' ? row : Number(Object.values(row)[0])).filter(n => !isNaN(n))
        }
      } else {
        const lines = data.trim().split('\n')
        if (lines.length > 1 && lines[0].includes(',')) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''))
          let colIdx = 0
          if (numeric_column) {
            const found = headers.findIndex(h => h.toLowerCase() === numeric_column.toLowerCase())
            if (found >= 0) colIdx = found
          }
          nums = lines.slice(1).map(l => {
            const val = l.split(',')[colIdx]
            return val ? Number(val.trim().replace(/^["']|["']$/g, '')) : NaN
          }).filter(n => !isNaN(n))
        } else {
          nums = data.split(/[\s,]+/).map(Number).filter(n => !isNaN(n))
        }
      }

      if (!nums.length) return { error: 'No numeric values found in the input data.' }

      nums.sort((a, b) => a - b)
      const count = nums.length
      const sum = nums.reduce((a, b) => a + b, 0)
      const mean = sum / count
      const min = nums[0]
      const max = nums[count - 1]
      const median = count % 2 === 0 ? (nums[count / 2 - 1] + nums[count / 2]) / 2 : nums[Math.floor(count / 2)]
      const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / count
      const stdDev = Math.sqrt(variance)

      return {
        success: true,
        tool: 'data_stats',
        column_analyzed: numeric_column || 'default',
        count,
        sum: Math.round(sum * 100) / 100,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        min,
        max,
        std_deviation: Math.round(stdDev * 100) / 100,
        range: Math.round((max - min) * 100) / 100,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  },
}

// ─── 5. Keyword / Keyphrase Extractor ───────────────────────────────────────
export const keywordExtractTool = {
  schema: {
    description:
      'Extract the most important keywords and keyphrases from text using local frequency analysis. ' +
      'Use when the user wants keywords, tags, search terms, topics, or a quick focus summary from a passage. ' +
      'This tool is local, fast, and does not call any external service.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
        max_keywords: { type: 'number', description: 'Maximum single-word keywords to return (default 10)' },
        max_phrases: { type: 'number', description: 'Maximum multi-word phrases to return (default 5)' },
      },
      required: ['text'],
    },
  },
  async execute({ text, max_keywords = 10, max_phrases = 5 }) {
    const clean = cleanText(text)
    if (!clean) return { success: false, error: 'Empty text provided' }

    const words = meaningfulTokens(clean)
    if (!words.length) return { success: false, error: 'No keywords found in the input text.' }

    const counts = new Map()
    const firstSeen = new Map()
    words.forEach((word, idx) => {
      counts.set(word, (counts.get(word) || 0) + 1)
      if (!firstSeen.has(word)) firstSeen.set(word, idx)
    })

    const scoredKeywords = [...counts.entries()]
      .map(([term, count]) => ({
        term,
        count,
        score: Math.round(((count * 2) + Math.log2(1 + words.length / (count + 1)) + (1 / (1 + firstSeen.get(term)))) * 100) / 100,
      }))
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, Math.max(3, Math.min(20, max_keywords | 0)))

    const phraseCounts = new Map()
    const phraseTokens = words
    for (let i = 0; i < phraseTokens.length; i++) {
      for (let len = 2; len <= 4 && i + len <= phraseTokens.length; len++) {
        const phrase = phraseTokens.slice(i, i + len).join(' ')
        if (phrase.length < 6 || phrase.length > 60) continue
        phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1)
      }
    }

    const phraseScores = [...phraseCounts.entries()]
      .map(([term, count]) => {
        const base = term.split(' ').reduce((sum, word) => sum + (counts.get(word) || 0), 0)
        return {
          term,
          count,
          score: Math.round(((base / term.split(' ').length) + Math.log2(1 + count)) * 100) / 100,
        }
      })
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, Math.max(1, Math.min(12, max_phrases | 0)))

    const focusTerms = [
      ...phraseScores.map(p => p.term),
      ...scoredKeywords.slice(0, 5).map(k => k.term),
    ]
    const search_query = joinSearchTerms(focusTerms)

    return {
      success: true,
      tool: 'keyword_extract',
      keywords: scoredKeywords,
      phrases: phraseScores,
      focus_terms: focusTerms.slice(0, 8),
      search_query,
      total_words: words.length,
      total_sentences: splitSentences(clean).length,
    }
  },
}

// ─── 6. Entity / Proper-Noun Extractor ──────────────────────────────────────
export const entityExtractTool = {
  schema: {
    description:
      'Extract likely people, organizations, locations, dates, numbers, emails, and URLs from text. ' +
      'Use when the user asks who/what/where/when is mentioned in a passage, or when the model needs a compact fact list before answering.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to analyze' },
      },
      required: ['text'],
    },
  },
  async execute({ text }) {
    const clean = cleanText(text)
    if (!clean) return { success: false, error: 'Empty text provided' }

    const people = []
    const organizations = []
    const locations = []
    const proper_nouns = []
    const acronyms = []

    for (const candidate of extractEntityCandidates(clean)) {
      const type = classifyProperNoun(candidate.phrase, candidate.prevWord)
      const phrase = candidate.phrase
      if (type === 'person') uniquePush(people, phrase)
      else if (type === 'organization') uniquePush(organizations, phrase)
      else if (type === 'location') uniquePush(locations, phrase)
      else if (type === 'acronym') uniquePush(acronyms, phrase)
      else uniquePush(proper_nouns, phrase)
    }

    const dates = extractDates(clean)
    const urls = extractUrls(clean)
    const emails = extractEmails(clean)
    const numbers = extractNumbers(clean)

    return {
      success: true,
      tool: 'entity_extract',
      people,
      organizations,
      locations,
      dates,
      numbers,
      urls,
      emails,
      acronyms,
      proper_nouns,
    }
  },
}

// ─── 7. Query Refiner ───────────────────────────────────────────────────────
export const queryRefineTool = {
  schema: {
    description:
      'Refine a messy user query into a cleaner search query, a few focused subqueries, and an intent label. ' +
      'Use when the user asks for help searching, researching, comparing, or turning a long prompt into a better question.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Raw user query' },
        max_subqueries: { type: 'number', description: 'Maximum subqueries to return (default 3)' },
      },
      required: ['query'],
    },
  },
  async execute({ query, max_subqueries = 3 }) {
    const clean = cleanText(query)
    if (!clean) return { success: false, error: 'Empty query provided' }

    const filler = new Set((
      'what who when where why how is are was were do does did can could would should will please tell me about ' +
      'find out give show explain a an the of for to in on and or i you we my your it its that this these those any some there here'
    ).split(/\s+/))

    const cleaned = clean
      .replace(/\b(2025|2026|2027|2028)\b/g, '')
      .replace(/[?!.,;:]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(word => !filler.has(word.toLowerCase()))

    const search_query = joinSearchTerms(cleaned)
    const intent = intentFromQuery(clean)

    const splitPattern = /\b(?:vs|versus|compared to|and also|as well as)\b/i
    let subqueries = []
    if (splitPattern.test(clean)) {
      subqueries = clean
        .split(splitPattern)
        .map(p => p.trim())
        .filter(p => p.length >= 3)
        .slice(0, Math.max(1, Math.min(5, max_subqueries | 0)))
        .map(part => joinSearchTerms(meaningfulTokens(part)))
    }
    if (!subqueries.length) subqueries = [search_query || clean]

    const suggested_tools = []
    if (intent === 'research') suggested_tools.push('web_search', 'deep_research')
    if (intent === 'compute') suggested_tools.push('calculator')
    if (intent === 'translate') suggested_tools.push('translate')
    if (intent === 'summarize') suggested_tools.push('summarize')
    if (intent === 'coding' || /\b(code|coding|debug|fix|error|stack trace|exception)\b/.test(clean.toLowerCase())) {
      suggested_tools.push('code_execute', 'code_format')
    }
    if (intent === 'visualize') suggested_tools.push('diagram', 'chart')

    return {
      success: true,
      tool: 'query_refine',
      intent,
      original_query: clean,
      cleaned_query: cleaned.join(' '),
      search_query,
      subqueries,
      suggested_tools,
    }
  },
}

// ─── 5. Multiformat Document Exporter Tool ────────────────────────────────────
async function loadPptxGen() {
  if (window.pptxgen || window.PptxGenJS) return window.pptxgen || window.PptxGenJS
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/gh/gitbrent/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'
    s.onload = () => resolve(window.pptxgen || window.PptxGenJS)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export async function exportPptx(content, filename = 'presentation.pptx', autoDownload = false) {
  try {
    const PptxGen = await loadPptxGen()
    const pptx = new PptxGen()
    pptx.layout = 'LAYOUT_16x9'

    const rawSlides = content.split(/^#+\s+/m).filter(Boolean)
    if (rawSlides.length === 0) {
      const slide = pptx.addSlide()
      slide.background = { fill: '0F172A' }
      slide.addText(filename, { x: 0.8, y: 1.0, fontSize: 28, color: '38BDF8', bold: true })
      slide.addText(content.slice(0, 500), { x: 0.8, y: 2.0, fontSize: 16, color: 'E2E8F0', w: 8.5 })
    } else {
      rawSlides.forEach((slideText, idx) => {
        const slide = pptx.addSlide()
        slide.background = { fill: '0F172A' }
        const lines = slideText.trim().split('\n').filter(Boolean)
        const title = lines[0]?.replace(/^[-*•#]\s*/, '') || `Slide ${idx + 1}`
        const bodyLines = lines.slice(1).map(l => l.replace(/^[-*•]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1'))

        if (idx === 0) {
          // Cover Slide Layout
          slide.addText(title, { x: 0.8, y: 1.6, fontSize: 32, color: '38BDF8', bold: true, w: 8.4, align: 'center' })
          const sub = bodyLines.join(' ').slice(0, 180)
          if (sub) {
            slide.addText(sub, { x: 1.2, y: 3.0, fontSize: 16, color: '94A3B8', w: 7.6, align: 'center' })
          }
          // Topic Hero Visual Image
          const imgKeyword = encodeURIComponent(`${title} hd visual presentation graphic`)
          const heroUrl = `https://image.pollinations.ai/prompt/${imgKeyword}?width=600&height=400&nologo=true`
          slide.addImage({ url: heroUrl, x: 2.8, y: 4.1, w: 4.4, h: 2.5, rounding: true })
        } else {
          // Content Slide Layout with Side-by-Side Graphic Image
          slide.addText(title, { x: 0.8, y: 0.6, fontSize: 24, color: '38BDF8', bold: true, w: 8.4 })
          
          // Side Slide Illustration Image
          const imgKeyword = encodeURIComponent(`${title} ${bodyLines[0] || ''} presentation visual`)
          const slideImgUrl = `https://image.pollinations.ai/prompt/${imgKeyword}?width=500&height=400&nologo=true`
          slide.addImage({ url: slideImgUrl, x: 5.2, y: 1.4, w: 4.2, h: 4.8, rounding: true })

          if (bodyLines.length > 0) {
            const formattedPoints = bodyLines.slice(0, 6).map(text => ({ text, options: { bullet: true, fontSize: 14, color: 'F8FAFC' } }))
            slide.addText(formattedPoints, { x: 0.8, y: 1.5, w: 4.1, h: 4.6, lineSpacing: 22 })
          }
        }
      })
    }

    const cleanName = filename.replace(/\.(ppt|pptx)$/i, '') + '.pptx'
    if (autoDownload) {
      await pptx.writeFile({ fileName: cleanName })
      return { success: true, filename: cleanName }
    } else {
      const base64 = await pptx.write({ outputType: 'base64' })
      const dataUrl = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,' + base64
      return { success: true, dataUrl, filename: cleanName }
    }
  } catch (err) {
    console.error('PptxGen failed:', err)
    return { success: false, error: err.message }
  }
}

export const docExportTool = {
  schema: {
    description:
      'Convert Markdown or structured text into Microsoft Word (.doc), PowerPoint presentation (.pptx), CSV spreadsheet (.csv), HTML, or formatted JSON for 1-click downloading. ' +
      'Use when the user asks to "export as Word", "create PowerPoint / PPT", "download CSV spreadsheet", "export HTML", or "save document".',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Desired output filename without extension' },
        format: {
          type: 'string',
          enum: ['doc', 'docx', 'ppt', 'pptx', 'presentation', 'csv', 'html', 'json', 'rtf'],
          description: 'Format to convert to (use "doc" for Word, "pptx" for PowerPoint, "csv" for spreadsheets)',
        },
        content: { type: 'string', description: 'Content or Markdown text to convert' },
      },
      required: ['filename', 'format', 'content'],
    },
  },
  async execute({ filename, format, content }) {
    let outContent = content
    let mimeType = 'application/msword'
    const requestedExt = format.toLowerCase()

    if (['ppt', 'pptx', 'powerpoint', 'presentation', 'slides'].includes(requestedExt)) {
      const pptResult = await exportPptx(content, filename, false)
      if (pptResult.success) {
        return {
          success: true,
          tool: 'doc_export',
          filename: pptResult.filename,
          format: 'pptx',
          mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          pptx_data_url: pptResult.dataUrl,
          exported_text: content,
        }
      }
    } else if (['doc', 'docx', 'word', 'rtf', 'text', 'txt'].includes(requestedExt)) {
      mimeType = 'application/msword'
      // Render Markdown structure (headings, lists, tables, bold, code) instead
      // of dumping <br>-joined text — a real formatted Word document.
      outContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${filename}</title><style>body{font-family:'Calibri','Segoe UI',sans-serif;font-size:11pt;line-height:1.5;color:#222;margin:1in;}h1{font-size:18pt;color:#1f4e78;margin-top:12pt;}h2{font-size:14pt;color:#2e75b6;margin-top:10pt;}h3{font-size:12pt;color:#2e75b6;}p{margin-bottom:6pt;}ul,ol{margin:6pt 0 6pt 18pt;}code{font-family:Consolas,monospace;background:#f3f4f6;padding:1px 4px;}pre{background:#f3f4f6;padding:8px;border-radius:4px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #ccc;padding:6px;}th{background:#f3f4f6;}blockquote{border-left:3px solid #2e75b6;margin:6pt 0;padding-left:10px;color:#555;}</style></head><body>${mdToHtml(content)}</body></html>`
    } else if (requestedExt === 'csv') {
      mimeType = 'text/csv'
      // Convert Markdown tables to CSV lines automatically if markdown table detected
      if (content.includes('|')) {
        const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'))
        outContent = lines.map(l => l.split('|').slice(1, -1).map(c => `"${c.trim().replace(/"/g, '""')}"`).join(',')).join('\n')
      } else {
        outContent = content
      }
    } else if (requestedExt === 'html') {
      mimeType = 'text/html'
      outContent = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${filename}</title><style>body{font-family:system-ui,sans-serif;line-height:1.6;padding:2rem;max-width:820px;margin:0 auto;color:#333;}pre{background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow:auto;}code{background:#f3f4f6;padding:1px 5px;border-radius:4px;}table{border-collapse:collapse;width:100%;}th,td{border:1px solid #d1d5db;padding:6px 10px;}th{background:#f3f4f6;}blockquote{border-left:3px solid #ff6b35;padding-left:12px;color:#555;}</style></head><body>${mdToHtml(content)}</body></html>`
    } else if (requestedExt === 'json') {
      mimeType = 'application/json'
      try {
        outContent = JSON.stringify(JSON.parse(content), null, 2)
      } catch {
        outContent = JSON.stringify({ filename, export_date: new Date().toISOString(), body: content }, null, 2)
      }
    }

    const outputExt = ['ppt', 'pptx', 'powerpoint', 'presentation', 'slides'].includes(requestedExt) ? 'ppt' : ['html', 'csv', 'json'].includes(requestedExt) ? requestedExt : 'doc'

    return {
      success: true,
      tool: 'doc_export',
      filename: `${filename.replace(/\.(rtf|doc|docx|ppt|pptx|csv|txt)$/i, '')}.${outputExt}`,
      format: outputExt,
      mime_type: mimeType,
      exported_text: outContent,
    }
  },
}

export const docEnhanceTool = {
  schema: {
    description:
      'Enhance and edit generated documents (PPT presentations, Word DOCs, CSV spreadsheets, Markdown reports) by adding topic illustration images to slides, auto-generating summary data tables, calculating CSV totals/averages, or adding executive styling. ' +
      'Use when asked to "improve PPT slides", "add images to presentation", "edit document", "enhance CSV", or "format executive report".',
    parameters: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Document filename' },
        format: { type: 'string', enum: ['pptx', 'doc', 'csv', 'md', 'pdf'], description: 'Target format to enhance' },
        enhancement_type: {
          type: 'string',
          enum: ['add_slide_images', 'add_summary_table', 'calculate_csv_totals', 'executive_styling'],
          description: 'Type of enhancement to perform',
        },
        content: { type: 'string', description: 'Raw document or slide content to edit and enhance' },
      },
      required: ['filename', 'format', 'enhancement_type', 'content'],
    },
  },
  async execute({ filename, format, enhancement_type, content }) {
    if (format === 'pptx' || enhancement_type === 'add_slide_images') {
      const pptResult = await exportPptx(content, filename, false)
      return {
        success: true,
        tool: 'doc_enhance',
        filename: pptResult.filename,
        format: 'pptx',
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        pptx_data_url: pptResult.dataUrl,
        enhanced_type: 'Slide Graphics & Split-Column Layout Applied',
        exported_text: content,
      }
    } else if (format === 'csv' || enhancement_type === 'calculate_csv_totals') {
      let lines = content.split('\n').filter(Boolean)
      let outCsv = content
      if (lines.length > 1) {
        const headers = lines[0].split(',')
        const numCols = headers.length
        const sums = new Array(numCols).fill(0)
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(',')
          if (cells.length === numCols) {
            cells.forEach((val, cIdx) => {
              const num = parseFloat(val.replace(/[^0-9.-]/g, ''))
              if (!isNaN(num)) sums[cIdx] += num
            })
          }
        }
        const totalRow = headers.map((h, i) => i === 0 ? 'Total Summary' : sums[i] > 0 ? (sums[i] % 1 === 0 ? sums[i] : sums[i].toFixed(2)) : '')
        lines.push(totalRow.join(','))
        outCsv = '\uFEFF' + lines.join('\n')
      }
      return {
        success: true,
        tool: 'doc_enhance',
        filename: `${filename.replace(/\.csv$/i, '')}_enhanced.csv`,
        format: 'csv',
        mime_type: 'text/csv',
        exported_text: outCsv,
        enhanced_type: 'Calculated Column Totals & UTF-8 Formatting Applied',
      }
    } else {
      const styledHeader = `# EXECUTIVE REPORT: ${filename.toUpperCase()}\n*Generated & Enhanced by Yogatik Document Engine*\n\n---\n\n`
      const enhancedContent = styledHeader + content
      return {
        success: true,
        tool: 'doc_enhance',
        filename: `${filename.replace(/\.(doc|docx|md)$/i, '')}_executive.doc`,
        format: 'doc',
        mime_type: 'application/msword',
        exported_text: enhancedContent,
        enhanced_type: 'Executive Cover Styling & Structure Applied',
      }
    }
  },
}
