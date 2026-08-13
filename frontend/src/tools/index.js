/**
 * Browser-native tool registry — all 47 tools, zero backend.
 * Each tool: { schema (OpenAI function schema), execute(args) → result }
 */

import { weatherTool } from './weather'
import { calculatorTool } from './calculator'
import { imageGenTool, stickerGenTool } from './imageGen'
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
import { docSearchTool, docListTool, localVaultTool } from './documents'
import { localSearchTool } from './localSearch.js'
import {
  wikipediaTool, scholarTool, stackOverflowTool, hackerNewsTool,
  archiveTool, dictionaryTool, booksTool,
} from './knowledge'
import {
  packageTool, gutenbergTool, geocodeTool, currencyTool, earthquakeTool,
  airQualityTool, grammarTool,
} from './opendata'
import { youtubeTool } from './youtube'
import { jsExecTool } from './jsExec'
import { memoryTool } from './memory'
import { textToAudioTool } from './textToAudio'
import { seeTool } from './see'
import { videoRenderTool } from './videoRender'
import {
  diagramRenderTool, codeFormatTool, textAnalyticsTool, dataStatsTool,
  keywordExtractTool, entityExtractTool, queryRefineTool,
  docExportTool, docEnhanceTool,
} from './independentTools'
import { pushAmbientSignal, popAmbientSignal } from './http'
import { getMcpSchemas, isMcpTool, callMcpTool } from '../mcp'
import {
  isDesktop, fsGrantTool, fsListTool, fsReadTool, fsWriteTool, fsEditTool, fsSearchTool,
  fsDeleteTool, fsMkdirTool, fsMoveTool,
} from './localFs'
import { terminalRunTool } from './terminalRun'
import {
  uuidTool, passwordTool, numberBaseTool, cronTool, timezoneTool, thesaurusTool, countryTool,
} from './moretools'
import { spawnAgentsTool } from './spawnAgents'
import { schedulerTool } from './scheduler'
import { autoSkillsTool } from './autoSkills'
import { subAgentRunnerTool } from './subAgentRunner'

const ALL_TOOLS = {
  weather: weatherTool,
  calculator: calculatorTool,
  image_generate: imageGenTool,
  sticker_generate: stickerGenTool,
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
  web_search: localSearchTool,
  deep_research: researchTool,
  doc_search: docSearchTool,
  doc_list: docListTool,
  local_vault_search: localVaultTool,
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
  air_quality: airQualityTool,
  grammar_check: grammarTool,
  js_execute: jsExecTool,
  memory: memoryTool,
  text_to_audio: textToAudioTool,
  web_extract: webExtractTool,
  youtube: youtubeTool,
  see: seeTool,
  video_render: videoRenderTool,
  diagram_render: diagramRenderTool,
  code_format: codeFormatTool,
  text_analytics: textAnalyticsTool,
  data_stats: dataStatsTool,
  keyword_extract: keywordExtractTool,
  entity_extract: entityExtractTool,
  query_refine: queryRefineTool,
  doc_export: docExportTool,
  doc_enhance: docEnhanceTool,
  // Desktop-only local filesystem tools (Tauri shell). Present in every build;
  // in the browser they return an honest "desktop only" note.
  fs_grant: fsGrantTool,
  fs_list: fsListTool,
  fs_read: fsReadTool,
  fs_write: fsWriteTool,
  fs_edit: fsEditTool,
  fs_search: fsSearchTool,
  fs_delete: fsDeleteTool,
  fs_mkdir: fsMkdirTool,
  fs_move: fsMoveTool,
  terminal_run: terminalRunTool,
  // Open, keyless utilities + word/country data.
  uuid: uuidTool,
  password_generate: passwordTool,
  number_base: numberBaseTool,
  cron_next: cronTool,
  timezone: timezoneTool,
  thesaurus: thesaurusTool,
  country_info: countryTool,
  // Scheduler / Cron Daemon
  scheduler: schedulerTool,
  // Auto-Skill Generator
  auto_skills: autoSkillsTool,
  // Sub-Agent Runner (isolated processes + Python RPC)
  sub_agent_runner: subAgentRunnerTool,
  // Multi-agent delegation: hand focused sub-tasks to specialist sub-agents.
  spawn_agents: spawnAgentsTool,
}

/** True when running inside the Yogatik desktop (Tauri) shell. */
export { isDesktop }

/** Get OpenAI function schemas, optionally excluding user-disabled tools */
export function getToolSchemas(disabled = []) {
  const off = new Set(disabled)
  const builtin = Object.entries(ALL_TOOLS)
    .filter(([name]) => !off.has(name))
    .map(([name, tool]) => ({
      type: 'function',
      function: { name, ...tool.schema },
    }))
  // Discovered MCP-server tools (if any servers are connected) join the list.
  return [...builtin, ...getMcpSchemas().filter(s => !off.has(s.function.name))]
}

/** Execute a tool by name */
export async function executeTool(name, args, { signal } = {}) {
  if (isMcpTool(name)) return callMcpTool(name, args)
  const tool = ALL_TOOLS[name]
  if (!tool) return { success: false, error: `Unknown tool: ${name}` }
  if (signal?.aborted) return { success: false, error: 'Stopped' }
  // Makes Stop reach the tool's own network calls (see tools/http.js).
  pushAmbientSignal(signal)
  try {
    return await tool.execute(args)
  } catch (err) {
    if (err?.name === 'AbortError' || signal?.aborted) return { success: false, error: 'Stopped' }
    return { success: false, error: err.message }
  } finally {
    popAmbientSignal(signal)
  }
}

/** List all tool names */
export function getToolNames() {
  return Object.keys(ALL_TOOLS)
}

export default ALL_TOOLS
