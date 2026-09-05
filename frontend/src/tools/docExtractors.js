/**
 * Universal Client-Side Document & File Extractor
 *
 * Supports:
 * - PDF: Digital text + Scanned/Image PDFs via high-DPI canvas & auto-OCR
 * - Microsoft Word (.docx): XML text & paragraph parsing via JSZip
 * - Microsoft Excel (.xlsx, .xls): CSV table generation per sheet via SheetJS
 * - Images (.png, .jpg, .jpeg, .webp, .bmp, .tiff): OCR text extraction via Tesseract.js
 * - Data & Config: CSV, TSV, JSON, JSONL, XML, YAML, TOML, INI, ENV, SQL
 * - Programming Languages: JS, TS, Python, Java, C, C++, C#, Go, Rust, PHP, Ruby, Bash, PowerShell, etc.
 * - Universal Text Fallback: Any text-encoded file (checked via byte inspection for null characters)
 */

const CODE_OR_TEXT_EXTS = new Set([
  'txt', 'text', 'md', 'markdown', 'log', 'rtf', 'csv', 'tsv', 'json', 'jsonl',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'env', 'conf', 'cfg', 'properties',
  'html', 'htm', 'xhtml', 'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'pyw', 'java', 'c', 'cpp', 'cc', 'cxx',
  'h', 'hpp', 'hh', 'cs', 'go', 'rs', 'php', 'rb', 'sh', 'bash', 'zsh', 'ps1',
  'bat', 'cmd', 'sql', 'r', 'swift', 'kt', 'kts', 'dart', 'scala', 'lua', 'pl', 'pm',
  'graphql', 'gql', 'proto', 'diff', 'patch', 'dockerfile', 'makefile'
])

const KNOWN_TEXT_BASENAMES = new Set([
  'dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile', 'license', 'licence',
  'readme', 'authors', 'contributors', 'changelog', 'install'
])

async function loadScript(urls, globalVar) {
  if (typeof window !== 'undefined' && window[globalVar]) return window[globalVar]
  if (typeof document === 'undefined') throw new Error(`Script loading requires DOM environment: ${globalVar}`)

  for (const url of urls) {
    try {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = url
        s.onload = resolve
        s.onerror = () => reject(new Error(`Failed to load ${url}`))
        document.head.appendChild(s)
      })
      if (window[globalVar]) return window[globalVar]
    } catch {
      // try next CDN fallback
    }
  }
  throw new Error(`Could not load ${globalVar} from CDN mirrors.`)
}

/** Extract text from PDF (digital layer + scanned OCR fallback) */
export async function extractPdf(file) {
  const { pdfExtractTool } = await import('./pdfExtract')
  const url = URL.createObjectURL(file)
  try {
    const res = await pdfExtractTool.execute({ url })
    if (!res?.text?.trim()) {
      throw new Error(res?.error || 'No extractable text or OCR content found in this PDF.')
    }
    return res.text.trim()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Extract text from Word (.docx) files */
export async function extractDocx(file) {
  const JSZip = await loadScript([
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'
  ], 'JSZip')

  const arrayBuffer = await readBlobAsArrayBuffer(file)
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docXml = zip.file('word/document.xml')
  if (!docXml) throw new Error('Invalid Word document: word/document.xml not found')

  const xmlText = await docXml.async('text')
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'text/xml')
  const paragraphs = doc.getElementsByTagName('w:p')
  const lines = []

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]
    const texts = p.getElementsByTagName('w:t')
    let line = ''
    for (let j = 0; j < texts.length; j++) {
      line += texts[j].textContent || ''
    }
    if (line.trim()) lines.push(line.trim())
  }

  const result = lines.join('\n\n')
  if (!result.trim()) {
    throw new Error('Word document contains no readable text.')
  }
  return result
}

/** Extract structured tables/data from Excel (.xlsx, .xls) */
export async function extractXlsx(file) {
  const XLSX = await loadScript([
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ], 'XLSX')

  const arrayBuffer = await readBlobAsArrayBuffer(file)
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sections = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv && csv.trim()) {
      sections.push(`=== Sheet: ${sheetName} ===\n${csv.trim()}`)
    }
  }

  const result = sections.join('\n\n')
  if (!result.trim()) {
    throw new Error('Spreadsheet appears to be empty.')
  }
  return result
}

/** Extract text from images via OCR */
export async function extractImage(file) {
  const { ocrTool } = await import('./ocr')
  const url = URL.createObjectURL(file)
  try {
    const res = await ocrTool.execute({ url })
    if (!res?.text?.trim()) {
      throw new Error(res?.error || 'No readable text found in this image via OCR.')
    }
    return res.text.trim()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Safe reader for text content across modern browsers, Electron, and test environments */
export async function readBlobAsText(blob) {
  if (typeof blob.text === 'function') {
    try {
      return await blob.text()
    } catch { /* fallback to FileReader */ }
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error || new Error('Failed to read file as text'))
      reader.readAsText(blob)
    })
  }
  throw new Error('No mechanism available to read file as text.')
}

/** Safe reader for ArrayBuffer across modern browsers, Electron, and test environments */
export async function readBlobAsArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') {
    try {
      return await blob.arrayBuffer()
    } catch { /* fallback to FileReader */ }
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error || new Error('Failed to read file as array buffer'))
      reader.readAsArrayBuffer(blob)
    })
  }
  throw new Error('No mechanism available to read file as array buffer.')
}

/** Check if file is text/code via type, extension, or byte inspection */
export async function isLikelyTextFile(file) {
  if (!file) return false
  if (file.type && (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('xml') || file.type.includes('yaml'))) {
    return true
  }

  const name = (file.name || '').toLowerCase()
  const base = name.split('/').pop().split('\\').pop()
  if (KNOWN_TEXT_BASENAMES.has(base) || base.startsWith('.env') || base.startsWith('.git') || base.startsWith('.docker')) {
    return true
  }

  const ext = name.includes('.') ? name.split('.').pop() : ''
  if (CODE_OR_TEXT_EXTS.has(ext)) {
    return true
  }

  // Universal fallback: check first 4KB for null bytes
  try {
    const slice = typeof file.slice === 'function' ? file.slice(0, 4096) : file
    const buf = await readBlobAsArrayBuffer(slice)
    const bytes = new Uint8Array(buf)
    if (bytes.length === 0) return true
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0) return false // null byte indicates binary file
    }
    return true
  } catch {
    return false
  }
}

/**
 * Universal text extraction entrypoint for any file uploaded or dropped.
 * Automatically routes to PDF, Word, Excel, Image OCR, or text/code parser.
 */
export async function extractFileText(file) {
  if (!file) throw new Error('No file provided for extraction.')

  const name = (file.name || '').toLowerCase()
  const mime = file.type || ''

  // 1. PDF
  if (name.endsWith('.pdf') || mime === 'application/pdf') {
    return extractPdf(file)
  }

  // 2. Word document (.docx)
  if (name.endsWith('.docx') || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocx(file)
  }

  // 3. Excel spreadsheet (.xlsx, .xls)
  if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel') {
    return extractXlsx(file)
  }

  // 4. Image file (PNG, JPG, WEBP, BMP, TIFF) via OCR
  if (/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name) || mime.startsWith('image/')) {
    return extractImage(file)
  }

  // 5. Text, Markdown, Data, Config, Code, Scripts
  if (await isLikelyTextFile(file)) {
    return readBlobAsText(file)
  }

  throw new Error(`Unsupported file type: ${mime || name}. Supported: PDF (digital & scan), DOCX, XLSX/XLS, Images (PNG/JPG/WEBP with OCR), CSV/TSV, JSON, Markdown, and all Code/Config files.`)
}
