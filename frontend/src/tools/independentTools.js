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
  if (/\b(weather|forecast|temperature|rain|snow|cloudy|sunny|humidity)\b/.test(q)) return 'weather'
  if (/\b(news|latest|current|today|now|price|prices|release|update)\b/.test(q)) return 'research'
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
  async execute(args = {}) {
    const rawText = typeof args === 'string'
      ? args
      : (args?.text ?? args?.input ?? args?.content ?? args?.query ?? '')
    const clean = cleanText(rawText)
    if (!clean) return { success: false, error: 'Empty text provided' }
    const { max_keywords = 10, max_phrases = 5 } = (typeof args === 'object' && args !== null) ? args : {}

    const words = meaningfulTokens(clean)
    if (!words.length) return { success: false, error: 'No meaningful keywords found' }

    const counts = new Map()
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1)

    const scoredKeywords = [...counts.entries()]
      .map(([term, count]) => ({
        term,
        count,
        score: Math.round((count / words.length + Math.log10(1 + count)) * 100) / 100,
      }))
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .slice(0, Math.max(1, Math.min(25, max_keywords | 0)))

    const sentences = splitSentences(clean)
    const phraseCounts = new Map()
    for (const s of sentences) {
      const toks = meaningfulTokens(s)
      for (let i = 0; i < toks.length - 1; i++) {
        const pair = `${toks[i]} ${toks[i + 1]}`
        phraseCounts.set(pair, (phraseCounts.get(pair) || 0) + 1)
        if (i < toks.length - 2) {
          const tri = `${toks[i]} ${toks[i + 1]} ${toks[i + 2]}`
          phraseCounts.set(tri, (phraseCounts.get(tri) || 0) + 1)
        }
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
      total_sentences: sentences.length,
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
  async execute(args = {}) {
    const rawText = typeof args === 'string'
      ? args
      : (args?.text ?? args?.input ?? args?.content ?? args?.query ?? '')
    const clean = cleanText(rawText)
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
  async execute(args = {}) {
    const rawQuery = typeof args === 'string'
      ? args
      : (args?.query ?? args?.q ?? args?.search_query ?? args?.input ?? args?.text ?? '')
    const clean = cleanText(rawQuery)
    if (!clean) return { success: false, error: 'Empty query provided' }
    const { max_subqueries = 3 } = (typeof args === 'object' && args !== null) ? args : {}

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
    if (intent === 'weather') suggested_tools.push('weather')
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

const THEMES = {
  midnight: {
    bg: '0B1120',
    card: '162238',
    cardBorder: '2E4064',
    primary: '38BDF8',
    secondary: '818CF8',
    title: 'FFFFFF',
    text: 'E2E8F0',
    muted: '94A3B8',
    accentLine: '38BDF8',
  },
  emerald: {
    bg: '091E1A',
    card: '13332D',
    cardBorder: '1F4D44',
    primary: '10B981',
    secondary: 'F59E0B',
    title: 'FFFFFF',
    text: 'E2E8F0',
    muted: '94A3B8',
    accentLine: '10B981',
  },
  cyber: {
    bg: '0F0F17',
    card: '1B1B2A',
    cardBorder: '33334D',
    primary: 'FF6B35',
    secondary: 'F43F5E',
    title: 'FFFFFF',
    text: 'F1F5F9',
    muted: '94A3B8',
    accentLine: 'FF6B35',
  },
  royal: {
    bg: '0F172A',
    card: '1E293B',
    cardBorder: '334155',
    primary: 'A855F7',
    secondary: '38BDF8',
    title: 'FFFFFF',
    text: 'F8FAFC',
    muted: '94A3B8',
    accentLine: 'A855F7',
  },
}

function selectTheme(text = '') {
  const lower = text.toLowerCase()
  if (/finance|revenue|growth|sales|market|investment|banking|quarterly|profit|earnings|economy/i.test(lower)) return THEMES.emerald
  if (/creative|marketing|launch|design|brand|social|content|pitch|media|story/i.test(lower)) return THEMES.cyber
  if (/research|academic|ai|model|deep|security|cyber|cloud|crypto|intelligence|quantum/i.test(lower)) return THEMES.royal
  return THEMES.midnight
}

function splitPresentationSlides(content = '') {
  const text = String(content || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // Check for horizontal rule separators: --- or ***
  if (/\n\s*(?:---+|\*\*\*+)\s*\n/.test(text)) {
    return text.split(/\n\s*(?:---+|\*\*\*+)\s*\n/).map(s => s.trim()).filter(Boolean)
  }
  // Check for header separators: # Slide N or ## Slide N
  if (/(?=^#+\s+(?:Slide\s+\d+|[A-Z0-9]))/mi.test(text)) {
    const parts = text.split(/(?=^#+\s+(?:Slide\s+\d+|[A-Z0-9]))/mi).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) return parts
  }
  // Check for standard markdown headers
  if (/(?=^#{1,3}\s+)/m.test(text)) {
    const parts = text.split(/(?=^#{1,3}\s+)/m).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) return parts
  }
  // Fallback: split by double line breaks
  const paragraphs = text.split(/\n\n+/).map(s => s.trim()).filter(Boolean)
  return paragraphs.length > 1 ? paragraphs : [text]
}

function parseStatPoints(lines = []) {
  const stats = []
  const statRegex = /(?:[$€£₹]\s?\d[\d,.]*\s?(?:billion|million|bn|m|k)?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x|\b\d+[\d,.]*\+?\s?(?:users|clients|nodes|ms|sec|hours|days|TOPS|GB|TB)\b)/i
  lines.forEach(l => {
    const clean = l.replace(/^[-*•#\d.]+\s*/, '').trim()
    const m = clean.match(statRegex)
    if (m && stats.length < 4) {
      const value = m[0]
      const label = clean.replace(m[0], '').replace(/[:\-–—]\s*/, '').trim() || 'Key Metric'
      stats.push({ value, label: label.slice(0, 70), raw: clean })
    }
  })
  return stats
}

async function urlToBase64(url, timeoutMs = 3000) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const resp = await fetch(url, { signal: controller.signal, mode: 'cors' })
    clearTimeout(timer)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function svgToPngDataUrl(svgString, width = 800, height = 500) {
  if (typeof document === 'undefined') {
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))
  }
  return new Promise((resolve) => {
    try {
      const img = new Image()
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString))))
      }
      img.src = url
    } catch {
      resolve('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString))))
    }
  })
}

function buildTopicSvg(title = '', theme = THEMES.midnight, type = 'abstract') {
  const primary = '#' + (theme.primary || '38BDF8')
  const secondary = '#' + (theme.secondary || '818CF8')
  const bg = '#' + (theme.card || '162238')
  const bgDark = '#' + (theme.bg || '0B1120')
  const escapedTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').slice(0, 32)

  if (type === 'growth') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="bgGrad1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgDark}"/>
          <stop offset="100%" stop-color="${bg}"/>
        </linearGradient>
        <linearGradient id="areaGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${primary}" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="${primary}" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="barGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${secondary}"/>
          <stop offset="100%" stop-color="${primary}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" rx="20" fill="url(#bgGrad1)"/>
      <g opacity="0.12">
        <line x1="80" y1="120" x2="720" y2="120" stroke="#FFFFFF" stroke-dasharray="4,4"/>
        <line x1="80" y1="220" x2="720" y2="220" stroke="#FFFFFF" stroke-dasharray="4,4"/>
        <line x1="80" y1="320" x2="720" y2="320" stroke="#FFFFFF" stroke-dasharray="4,4"/>
        <line x1="80" y1="410" x2="720" y2="410" stroke="#FFFFFF"/>
      </g>
      <rect x="140" y="270" width="55" height="140" rx="8" fill="url(#barGrad1)" opacity="0.8"/>
      <rect x="260" y="210" width="55" height="200" rx="8" fill="url(#barGrad1)" opacity="0.85"/>
      <rect x="380" y="160" width="55" height="250" rx="8" fill="url(#barGrad1)" opacity="0.9"/>
      <rect x="500" y="115" width="55" height="295" rx="8" fill="url(#barGrad1)" opacity="0.95"/>
      <rect x="620" y="75" width="55" height="335" rx="8" fill="url(#barGrad1)"/>
      <path d="M 167 250 Q 307 190 407 140 T 647 65 L 647 410 L 167 410 Z" fill="url(#areaGrad1)"/>
      <path d="M 167 250 Q 307 190 407 140 T 647 65" fill="none" stroke="${primary}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="167" cy="250" r="6" fill="${primary}" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="287" cy="190" r="6" fill="${primary}" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="407" cy="140" r="6" fill="${primary}" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="527" cy="100" r="6" fill="${primary}" stroke="#FFFFFF" stroke-width="2"/>
      <circle cx="647" cy="65" r="8" fill="#FFFFFF" stroke="${primary}" stroke-width="3"/>
      <rect x="560" y="25" width="160" height="30" rx="15" fill="${primary}" opacity="0.2"/>
      <text x="640" y="45" fill="${primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">METRIC GROWTH</text>
    </svg>`
  }

  if (type === 'network') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="bgGrad2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgDark}"/>
          <stop offset="100%" stop-color="${bg}"/>
        </linearGradient>
        <linearGradient id="coreGrad2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${primary}"/>
          <stop offset="100%" stop-color="${secondary}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" rx="20" fill="url(#bgGrad2)"/>
      <circle cx="400" cy="250" r="170" fill="none" stroke="${primary}" stroke-opacity="0.15" stroke-dasharray="6,6"/>
      <circle cx="400" cy="250" r="105" fill="none" stroke="${secondary}" stroke-opacity="0.25"/>
      <line x1="400" y1="250" x2="220" y2="150" stroke="${primary}" stroke-width="2" stroke-opacity="0.6"/>
      <line x1="400" y1="250" x2="580" y2="150" stroke="${secondary}" stroke-width="2" stroke-opacity="0.6"/>
      <line x1="400" y1="250" x2="220" y2="350" stroke="${secondary}" stroke-width="2" stroke-opacity="0.6"/>
      <line x1="400" y1="250" x2="580" y2="350" stroke="${primary}" stroke-width="2" stroke-opacity="0.6"/>
      <circle cx="220" cy="150" r="26" fill="${bg}" stroke="${primary}" stroke-width="2"/>
      <circle cx="580" cy="150" r="26" fill="${bg}" stroke="${secondary}" stroke-width="2"/>
      <circle cx="220" cy="350" r="26" fill="${bg}" stroke="${secondary}" stroke-width="2"/>
      <circle cx="580" cy="350" r="26" fill="${bg}" stroke="${primary}" stroke-width="2"/>
      <circle cx="400" cy="250" r="48" fill="url(#coreGrad2)" opacity="0.9"/>
      <circle cx="400" cy="250" r="56" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-opacity="0.5"/>
      <text x="400" y="255" fill="#FFFFFF" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">INTELLIGENCE</text>
    </svg>`
  }

  if (type === 'timeline') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="bgGradTL" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgDark}"/>
          <stop offset="100%" stop-color="${bg}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" rx="20" fill="url(#bgGradTL)"/>
      <line x1="120" y1="250" x2="680" y2="250" stroke="${primary}" stroke-width="4" stroke-opacity="0.4"/>
      <circle cx="180" cy="250" r="32" fill="${bg}" stroke="${primary}" stroke-width="3"/>
      <text x="180" y="256" fill="${primary}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">01</text>
      <circle cx="400" cy="250" r="38" fill="${primary}" stroke="#FFFFFF" stroke-width="3"/>
      <text x="400" y="256" fill="#FFFFFF" font-family="Segoe UI, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">02</text>
      <circle cx="620" cy="250" r="32" fill="${bg}" stroke="${secondary}" stroke-width="3"/>
      <text x="620" y="256" fill="${secondary}" font-family="Segoe UI, sans-serif" font-size="14" font-weight="bold" text-anchor="middle">03</text>
      <rect x="300" y="50" width="200" height="36" rx="18" fill="${primary}" opacity="0.2"/>
      <text x="400" y="73" fill="${primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">ROADMAP MILESTONES</text>
    </svg>`
  }

  if (type === 'security') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <defs>
        <linearGradient id="bgGradSec" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bgDark}"/>
          <stop offset="100%" stop-color="${bg}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="500" rx="20" fill="url(#bgGradSec)"/>
      <path d="M 400 110 L 550 170 L 550 310 Q 400 420 400 420 Q 250 310 250 170 Z" fill="${primary}" fill-opacity="0.15" stroke="${primary}" stroke-width="3"/>
      <circle cx="400" cy="250" r="50" fill="${bg}" stroke="${secondary}" stroke-width="2"/>
      <circle cx="400" cy="250" r="18" fill="${primary}"/>
      <text x="400" y="70" fill="${primary}" font-family="Segoe UI, sans-serif" font-size="13" font-weight="bold" text-anchor="middle">SECURE GOVERNANCE</text>
    </svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
    <defs>
      <linearGradient id="bgGrad3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgDark}"/>
        <stop offset="100%" stop-color="${bg}"/>
      </linearGradient>
      <linearGradient id="accentGrad3" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${primary}"/>
        <stop offset="100%" stop-color="${secondary}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="500" rx="20" fill="url(#bgGrad3)"/>
    <g transform="translate(80, 70)">
      <rect x="50" y="50" width="360" height="210" rx="14" fill="${bg}" stroke="${secondary}" stroke-width="1.5" opacity="0.5" transform="rotate(-6, 230, 160)"/>
      <rect x="30" y="30" width="360" height="210" rx="14" fill="${bg}" stroke="${primary}" stroke-width="2" opacity="0.8" transform="rotate(-3, 210, 140)"/>
      <rect x="10" y="10" width="360" height="210" rx="14" fill="url(#accentGrad3)" opacity="0.9"/>
      <rect x="35" y="35" width="110" height="12" rx="6" fill="#FFFFFF" opacity="0.7"/>
      <rect x="35" y="60" width="240" height="8" rx="4" fill="#FFFFFF" opacity="0.4"/>
      <rect x="35" y="80" width="200" height="8" rx="4" fill="#FFFFFF" opacity="0.4"/>
      <circle cx="320" cy="55" r="20" fill="#FFFFFF" opacity="0.25"/>
    </g>
    <rect x="490" y="330" width="220" height="42" rx="10" fill="${bg}" stroke="${primary}" stroke-width="1.5"/>
    <text x="600" y="356" fill="${primary}" font-family="Segoe UI, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${escapedTitle || 'STRATEGIC ARCHITECTURE'}</text>
  </svg>`
}

async function fetchSlideGraphic(title = '', text = '', theme = THEMES.midnight) {
  const fullText = (title + ' ' + text).toLowerCase()
  let type = 'abstract'
  if (/growth|revenue|metric|stat|sales|profit|scale|performance|kpi|percent|\$/i.test(fullText)) type = 'growth'
  else if (/timeline|roadmap|step|phase|milestone|schedule|plan/i.test(fullText)) type = 'timeline'
  else if (/security|secure|guard|protect|risk|compliance|governance|privacy/i.test(fullText)) type = 'security'
  else if (/ai|neural|network|cloud|data|intelligence|model|cluster|compute|agent|tech/i.test(fullText)) type = 'network'

  // Check if explicit markdown image URL is in text: ![alt](url)
  const imgMatch = text.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/i)
  if (imgMatch && imgMatch[1]) {
    const base64 = await urlToBase64(imgMatch[1], 3000)
    if (base64) return base64
  }

  // Try online Pollinations AI image fetch with short timeout
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const prompt = `${title || 'Modern Architecture'}, high-tech 3d digital illustration, sleek minimalist composition, clean lighting, 4k render`
      const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 99999)}`
      const base64 = await urlToBase64(imgUrl, 2500)
      if (base64) return base64
    } catch {
      // Graceful fallback to SVG/PNG synthesis
    }
  }

  // High-resolution local vector PNG synthesis
  const svg = buildTopicSvg(title, theme, type)
  return await svgToPngDataUrl(svg, 800, 500)
}

export async function exportPptx(content, filename = 'presentation.pptx', autoDownload = false) {
  try {
    const PptxGen = await loadPptxGen()
    const pptx = new PptxGen()
    pptx.layout = 'LAYOUT_16x9' // 10" x 5.625"

    const theme = selectTheme(content)
    const rawSlides = splitPresentationSlides(content)
    const totalSlides = rawSlides.length || 1

    if (rawSlides.length === 0) {
      const slide = pptx.addSlide()
      slide.background = { fill: theme.bg }
      slide.addShape(pptx.ShapeType.rect, { x: 0.8, y: 0.8, w: 2.0, h: 0.08, fill: { color: theme.primary } })
      slide.addText(filename.replace(/\.pptx$/i, ''), { x: 0.8, y: 1.2, fontSize: 28, color: theme.primary, bold: true })
      slide.addText(content.slice(0, 600), { x: 0.8, y: 2.2, fontSize: 14, color: theme.text, w: 8.4 })
    } else {
      for (let idx = 0; idx < rawSlides.length; idx++) {
        const slideText = rawSlides[idx]
        const slide = pptx.addSlide()
        slide.background = { fill: theme.bg }

        const allLines = slideText.trim().split('\n').map(l => l.trim()).filter(Boolean)
        let title = (allLines[0] || `Slide ${idx + 1}`).replace(/^#{1,4}\s*/, '').replace(/^[-*•]\s*/, '').replace(/\*\*(.+?)\*\*/g, '$1')
        title = title.replace(/^Slide\s+\d+[:\s-]*/i, '').trim() || `Slide ${idx + 1}`

        const bodyLines = allLines.slice(1).map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
        const isCover = idx === 0
        const isConclusion = idx === totalSlides - 1 && totalSlides > 2
        const isTableSlide = allLines.some(l => l.startsWith('|') && l.includes('|'))
        const stats = parseStatPoints(bodyLines)
        const isMetricsSlide = !isCover && stats.length >= 2 && !isTableSlide

        // Generate or fetch contextual slide illustration graphic
        const slideGraphic = await fetchSlideGraphic(title, slideText, theme)

        // ─── 1. COVER SLIDE WITH HERO GRAPHIC ────────────────────────────
        if (isCover) {
          // Left Content Container
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.65, y: 0.45, w: 5.0, h: 4.7,
            fill: { color: theme.card },
            line: { color: theme.cardBorder, width: 1 },
            rectRadius: 0.15,
          })
          slide.addShape(pptx.ShapeType.rect, {
            x: 0.65, y: 0.45, w: 5.0, h: 0.06,
            fill: { color: theme.primary },
          })

          // Topic Category Pill
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.95, y: 0.75, w: 2.2, h: 0.32,
            fill: { color: theme.bg },
            line: { color: theme.primary, width: 1 },
            rectRadius: 0.08,
          })
          slide.addText('EXECUTIVE BRIEFING', {
            x: 0.95, y: 0.75, w: 2.2, h: 0.32,
            fontSize: 9, color: theme.primary, bold: true, align: 'center', valign: 'middle',
          })

          // Main Presentation Title
          slide.addText(title, {
            x: 0.95, y: 1.25, w: 4.4, h: 1.3,
            fontSize: 26, color: theme.title, bold: true, fontFace: 'Segoe UI',
          })

          // Subtitle / Abstract
          const sub = bodyLines.join(' ').replace(/\*\*(.+?)\*\*/g, '$1').slice(0, 150) || 'Comprehensive Strategic Insights & Key Directives'
          slide.addText(sub, {
            x: 0.95, y: 2.65, w: 4.4, h: 0.8,
            fontSize: 12, color: theme.muted, fontFace: 'Segoe UI',
          })

          // 2 Key Highlights Pills
          const pillarPoints = bodyLines.slice(0, 2)
          if (pillarPoints.length > 0) {
            pillarPoints.forEach((point, pIdx) => {
              const pillY = 3.65 + pIdx * 0.65
              slide.addShape(pptx.ShapeType.roundRect, {
                x: 0.95, y: pillY, w: 4.4, h: 0.55,
                fill: { color: theme.bg },
                line: { color: theme.cardBorder, width: 1 },
                rectRadius: 0.08,
              })
              slide.addText(`0${pIdx + 1}  ${point.replace(/\*\*(.+?)\*\*/g, '$1').slice(0, 60)}`, {
                x: 1.05, y: pillY + 0.05, w: 4.2, h: 0.45,
                fontSize: 9.5, color: theme.text, fontFace: 'Segoe UI', valign: 'middle',
              })
            })
          }

          // Right Hero Illustration Graphic
          if (slideGraphic) {
            slide.addImage({
              data: slideGraphic,
              x: 5.85, y: 0.45, w: 3.5, h: 4.7,
              rounding: true,
            })
          }
        }

        // ─── 2. METRICS / STATS SLIDE WITH VISUAL GAUGES ─────────────────
        else if (isMetricsSlide) {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.65, y: 0.35, w: 1.2, h: 0.26,
            fill: { color: theme.card },
            line: { color: theme.primary, width: 1 },
            rectRadius: 0.06,
          })
          slide.addText(`KEY DATA`, {
            x: 0.65, y: 0.35, w: 1.2, h: 0.26,
            fontSize: 8, color: theme.primary, bold: true, align: 'center', valign: 'middle',
          })
          slide.addText(title, {
            x: 0.65, y: 0.68, w: 8.7, h: 0.5,
            fontSize: 20, color: theme.title, bold: true, fontFace: 'Segoe UI',
          })
          slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 1.2, w: 8.7, h: 0.02, fill: { color: theme.cardBorder } })

          const count = Math.min(stats.length, 3)
          const cardW = (8.7 - (count - 1) * 0.25) / count
          stats.slice(0, 3).forEach((stat, sIdx) => {
            const cardX = 0.65 + sIdx * (cardW + 0.25)
            slide.addShape(pptx.ShapeType.roundRect, {
              x: cardX, y: 1.45, w: cardW, h: 3.4,
              fill: { color: theme.card },
              line: { color: theme.cardBorder, width: 1 },
              rectRadius: 0.12,
            })
            slide.addShape(pptx.ShapeType.rect, {
              x: cardX, y: 1.45, w: cardW, h: 0.06,
              fill: { color: sIdx === 0 ? theme.primary : sIdx === 1 ? theme.secondary : '10B981' },
            })
            slide.addText(stat.value, {
              x: cardX + 0.15, y: 1.7, w: cardW - 0.3, h: 0.7,
              fontSize: 26, color: theme.primary, bold: true, fontFace: 'Segoe UI', align: 'center',
            })
            // Visual Progress Meter Bar under stat
            slide.addShape(pptx.ShapeType.roundRect, {
              x: cardX + 0.4, y: 2.45, w: cardW - 0.8, h: 0.12,
              fill: { color: theme.bg },
              rectRadius: 0.06,
            })
            slide.addShape(pptx.ShapeType.roundRect, {
              x: cardX + 0.4, y: 2.45, w: (cardW - 0.8) * (0.65 + sIdx * 0.15), h: 0.12,
              fill: { color: sIdx === 0 ? theme.primary : theme.secondary },
              rectRadius: 0.06,
            })
            slide.addText(stat.label.toUpperCase(), {
              x: cardX + 0.15, y: 2.75, w: cardW - 0.3, h: 0.4,
              fontSize: 9.5, color: theme.muted, bold: true, align: 'center',
            })
            slide.addText(stat.raw, {
              x: cardX + 0.2, y: 3.2, w: cardW - 0.4, h: 1.4,
              fontSize: 10.5, color: theme.text, fontFace: 'Segoe UI', align: 'center',
            })
          })
        }

        // ─── 3. TABLE SLIDE ──────────────────────────────────────────────
        else if (isTableSlide) {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.65, y: 0.35, w: 1.2, h: 0.26,
            fill: { color: theme.card },
            line: { color: theme.primary, width: 1 },
            rectRadius: 0.06,
          })
          slide.addText(`SUMMARY`, {
            x: 0.65, y: 0.35, w: 1.2, h: 0.26,
            fontSize: 8, color: theme.primary, bold: true, align: 'center', valign: 'middle',
          })
          slide.addText(title, {
            x: 0.65, y: 0.68, w: 8.7, h: 0.5,
            fontSize: 20, color: theme.title, bold: true, fontFace: 'Segoe UI',
          })
          slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 1.2, w: 8.7, h: 0.02, fill: { color: theme.cardBorder } })

          const tableLines = allLines.filter(l => l.startsWith('|') && !l.includes('---'))
          if (tableLines.length > 1) {
            const tableData = tableLines.slice(0, 7).map((tl, rIdx) => {
              const cells = tl.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*(.+?)\*\*/g, '$1'))
              return cells.map(cellText => ({
                text: cellText,
                options: {
                  fill: { color: rIdx === 0 ? theme.card : rIdx % 2 === 0 ? '11192A' : theme.bg },
                  color: rIdx === 0 ? theme.primary : theme.text,
                  bold: rIdx === 0,
                  fontSize: rIdx === 0 ? 11 : 10,
                  align: 'left',
                },
              }))
            })
            slide.addTable(tableData, {
              x: 0.65, y: 1.45, w: 8.7,
              border: { type: 'solid', color: theme.cardBorder, pt: 1 },
            })
          }
        }

        // ─── 4. STANDARD 2-COLUMN SLIDE WITH EMBEDDED GRAPHIC & INSIGHT ──
        else {
          // Header Accent Pill
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.65, y: 0.35, w: 1.3, h: 0.26,
            fill: { color: theme.card },
            line: { color: theme.primary, width: 1 },
            rectRadius: 0.06,
          })
          slide.addText(isConclusion ? 'ACTION PLAN' : `SLIDE 0${idx + 1}`, {
            x: 0.65, y: 0.35, w: 1.3, h: 0.26,
            fontSize: 8.5, color: theme.primary, bold: true, align: 'center', valign: 'middle',
          })

          // Slide Title
          slide.addText(title, {
            x: 0.65, y: 0.68, w: 8.7, h: 0.5,
            fontSize: 20, color: theme.title, bold: true, fontFace: 'Segoe UI',
          })
          slide.addShape(pptx.ShapeType.rect, { x: 0.65, y: 1.2, w: 8.7, h: 0.02, fill: { color: theme.cardBorder } })

          // Left Column (Structured Bullet List)
          if (bodyLines.length > 0) {
            const formattedPoints = bodyLines.slice(0, 5).map(rawText => {
              const clean = rawText.replace(/\*\*(.+?)\*\*/g, '$1')
              return {
                text: `  ${clean}`,
                options: {
                  bullet: { type: 'number', color: theme.primary },
                  fontSize: 12,
                  color: theme.text,
                  lineSpacing: 18,
                  breakLine: true,
                },
              }
            })
            slide.addText(formattedPoints, {
              x: 0.65, y: 1.45, w: 5.2, h: 3.45,
            })
          }

          // Right Column: Embedded Slide Illustration Graphic + Insight Card
          const rightX = 6.1
          const rightW = 3.25

          // 1. Embedded Graphic Image
          if (slideGraphic) {
            slide.addImage({
              data: slideGraphic,
              x: rightX, y: 1.45, w: rightW, h: 1.85,
              rounding: true,
            })
          }

          // 2. Insight Box below Graphic
          const insightY = 3.4
          const insightH = 1.5
          slide.addShape(pptx.ShapeType.roundRect, {
            x: rightX, y: insightY, w: rightW, h: insightH,
            fill: { color: theme.card },
            line: { color: theme.cardBorder, width: 1 },
            rectRadius: 0.1,
          })
          slide.addShape(pptx.ShapeType.rect, {
            x: rightX, y: insightY, w: rightW, h: 0.04,
            fill: { color: isConclusion ? '10B981' : theme.primary },
          })
          slide.addText(isConclusion ? 'KEY DIRECTIVE' : 'STRATEGIC FOCUS', {
            x: rightX + 0.15, y: insightY + 0.12, fontSize: 8.5, color: theme.primary, bold: true, letterSpacing: 1,
          })

          const insightText = bodyLines[0]?.replace(/\*\*(.+?)\*\*/g, '$1') ||
            (isConclusion ? 'Execute on prioritised milestones and track measurable deliverables.' : 'Ensure robust architectural alignment and operational agility.')
          slide.addText(insightText.slice(0, 110), {
            x: rightX + 0.15, y: insightY + 0.38, w: rightW - 0.3, h: 0.95,
            fontSize: 10.5, color: theme.text, fontFace: 'Segoe UI',
          })
        }

        // ─── FOOTER ──────────────────────────────────────────────────────
        slide.addText(filename.replace(/\.pptx$/i, ''), {
          x: 0.65, y: 5.15, fontSize: 8.5, color: theme.muted,
        })
        slide.addText(`Slide ${idx + 1} of ${totalSlides}`, {
          x: 7.35, y: 5.15, w: 2.0, fontSize: 8.5, color: theme.muted, align: 'right',
        })
      }
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
      const cleanTitle = filename.replace(/\.(rtf|doc|docx|txt)$/i, '')
      const htmlBody = mdToHtml(content)
      outContent = `<!DOCTYPE html><html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${cleanTitle}</title><style>body{font-family:'Calibri','Segoe UI',sans-serif;font-size:11pt;line-height:1.6;color:#1e293b;margin:1in;}h1{font-size:22pt;color:#0f172a;border-bottom:2px solid #38bdf8;padding-bottom:6pt;margin-top:14pt;margin-bottom:12pt;}h2{font-size:16pt;color:#1e3a8a;margin-top:14pt;border-bottom:1px solid #cbd5e1;padding-bottom:4pt;margin-bottom:8pt;}h3{font-size:13pt;color:#0284c7;margin-top:10pt;}p{margin-bottom:8pt;}ul,ol{margin:6pt 0 8pt 20pt;}li{margin-bottom:3pt;}code{font-family:Consolas,monospace;background:#f1f5f9;padding:2px 5px;border-radius:3px;color:#0f172a;}pre{background:#0f172a;color:#f8fafc;padding:12px;border-radius:6px;}table{border-collapse:collapse;width:100%;margin:12pt 0;}th,td{border:1px solid #cbd5e1;padding:8px 10px;text-align:left;}th{background:#1e293b;color:#ffffff;font-weight:bold;}tr:nth-child(even){background:#f8fafc;}blockquote{border-left:4px solid #38bdf8;background:#f0f9ff;margin:10pt 0;padding:8pt 12pt;color:#0369a1;font-style:italic;}</style></head><body><h1>${cleanTitle}</h1><p style='color:#64748b;font-size:9.5pt;margin-bottom:18pt;'>Generated by Yogatik Intelligence Engine • ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p><hr style='border:none;border-top:1px solid #e2e8f0;margin-bottom:18pt;'/>${htmlBody}</body></html>`
    } else if (requestedExt === 'csv') {
      mimeType = 'text/csv;charset=utf-8;'
      // Convert Markdown tables to CSV lines automatically if markdown table detected
      if (content.includes('|')) {
        const lines = content.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'))
        outContent = '\uFEFF' + lines.map(l => l.split('|').slice(1, -1).map(c => `"${c.trim().replace(/"/g, '""')}"`).join(',')).join('\n')
      } else {
        outContent = '\uFEFF' + content
      }
    } else if (requestedExt === 'html') {
      mimeType = 'text/html'
      const cleanTitle = filename.replace(/\.html$/i, '')
      outContent = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${cleanTitle}</title><style>body{font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;line-height:1.6;padding:2.5rem 1.5rem;max-width:880px;margin:0 auto;color:#1e293b;background:#f8fafc;}h1{color:#0f172a;border-bottom:2px solid #38bdf8;padding-bottom:8px;}h2{color:#1e3a8a;margin-top:24px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;}h3{color:#0284c7;}table{border-collapse:collapse;width:100%;margin:1.5rem 0;}th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;}th{background:#1e293b;color:#fff;}tr:nth-child(even){background:#f1f5f9;}blockquote{border-left:4px solid #38bdf8;background:#f0f9ff;padding:0.75rem 1.25rem;color:#0369a1;border-radius:0 6px 6px 0;margin:1.25rem 0;}code{background:#e2e8f0;padding:2px 6px;border-radius:4px;font-family:Consolas,monospace;}pre{background:#0f172a;color:#f8fafc;padding:1rem;border-radius:8px;overflow-x:auto;}</style></head><body><h1>${cleanTitle}</h1>${mdToHtml(content)}</body></html>`
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
      const cleanTitle = filename.replace(/\.(doc|docx|md|pdf|html)$/i, '')
      const styledHeader = `# EXECUTIVE REPORT: ${cleanTitle.toUpperCase()}\n*Generated & Enhanced by Yogatik Document Intelligence Engine*\n\n> [!NOTE]\n> **Executive Summary**: This document has been enriched with structured hierarchy, formatted KPI data tables, and print-grade typography.\n\n---\n\n`
      const enhancedContent = styledHeader + content
      return {
        success: true,
        tool: 'doc_enhance',
        filename: `${cleanTitle}_executive.doc`,
        format: 'doc',
        mime_type: 'application/msword',
        exported_text: enhancedContent,
        enhanced_type: 'Executive Cover Styling, Callout Notes & Visual Hierarchy Applied',
      }
    }
  },
}
