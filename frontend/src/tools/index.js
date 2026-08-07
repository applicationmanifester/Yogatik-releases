/**
 * Browser-native tool registry — all 44 tools, zero backend.
 * Each tool: { schema (OpenAI function schema), execute(args) → result }
 */

import { weatherTool } from './weather'
import { calculatorTool } from './calculator'
import { imageGenTool } from './imageGen'
import { ttsTool } from './tts'
import { sttTool } from './stt'
import { translateTool } from './translate'
import { chartTool } from './chart'
import { codeExecTool } from './codeExec'
import { ocrTool } from './ocr'
import { qrGenerateTool, qrReadTool } from './qr'
import { pdfExtractTool } from './pdfExtract'
import { summarizeTool } from './summarize'
import { rssTool } from './rss'
import { hashTool } from './hash'
import { regexTool } from './regex'
import { dataConvertTool } from './dataConvert'
import { colorTool } from './color'
import { whoisTool } from './whois'
import { diagramTool } from './diagram'
import { audioTool } from './audio'
import { imageInfoTool } from './imageInfo'
import { linkPreviewTool } from './linkPreview'
import { diffTool } from './diff'
import { unitConvertTool } from './unitConvert'
import { ipLookupTool } from './ipLookup'
import { mdToPdfTool } from './mdToPdf'
import { webExtractTool } from './webExtract'
import { webSearchTool } from './webSearch'
import { researchTool } from './research'
import { docSearchTool, docListTool } from './documents'
import {
  wikipediaTool, scholarTool, stackOverflowTool, hackerNewsTool,
  archiveTool, dictionaryTool, booksTool,
} from './knowledge'
import {
  packageTool, gutenbergTool, geocodeTool, currencyTool, earthquakeTool,
} from './opendata'
import { youtubeTool } from './youtube'

const ALL_TOOLS = {
  weather: weatherTool,
  calculator: calculatorTool,
  image_generate: imageGenTool,
  tts: ttsTool,
  stt: sttTool,
  translate: translateTool,
  chart: chartTool,
  code_execute: codeExecTool,
  ocr: ocrTool,
  qr_generate: qrGenerateTool,
  qr_read: qrReadTool,
  pdf_extract: pdfExtractTool,
  summarize: summarizeTool,
  rss_feed: rssTool,
  hash: hashTool,
  regex: regexTool,
  data_convert: dataConvertTool,
  color_palette: colorTool,
  whois: whoisTool,
  diagram: diagramTool,
  audio_edit: audioTool,
  image_info: imageInfoTool,
  link_preview: linkPreviewTool,
  diff: diffTool,
  unit_convert: unitConvertTool,
  ip_lookup: ipLookupTool,
  md_to_pdf: mdToPdfTool,
  web_search: webSearchTool,
  deep_research: researchTool,
  doc_search: docSearchTool,
  doc_list: docListTool,
  wikipedia: wikipediaTool,
  scholar: scholarTool,
  stackoverflow: stackOverflowTool,
  hackernews: hackerNewsTool,
  archive: archiveTool,
  dictionary: dictionaryTool,
  books: booksTool,
  package_info: packageTool,
  gutenberg: gutenbergTool,
  geocode: geocodeTool,
  currency: currencyTool,
  earthquake: earthquakeTool,
  web_extract: webExtractTool,
  youtube: youtubeTool,
}

/** Get OpenAI function schemas, optionally excluding user-disabled tools */
export function getToolSchemas(disabled = []) {
  const off = new Set(disabled)
  return Object.entries(ALL_TOOLS)
    .filter(([name]) => !off.has(name))
    .map(([name, tool]) => ({
      type: 'function',
      function: { name, ...tool.schema },
    }))
}

/** Execute a tool by name */
export async function executeTool(name, args) {
  const tool = ALL_TOOLS[name]
  if (!tool) return { success: false, error: `Unknown tool: ${name}` }
  try {
    return await tool.execute(args)
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/** List all tool names */
export function getToolNames() {
  return Object.keys(ALL_TOOLS)
}

export default ALL_TOOLS
