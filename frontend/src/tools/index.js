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
// web_search is registered as localSearchTool, which uses the desktop search
// sidecar when it is running and delegates to webSearchTool everywhere else —
// so webSearchTool is reached THROUGH that module, not imported here.
import { researchTool } from './research'
import { docSearchTool, docListTool, localVaultTool } from './documents'
import { localSearchTool } from './localSearch.js'
import { localIndexSearchTool, localCrawlerTool } from './localIndexEngine.js'
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
import { podcastGenerateTool } from './podcastGen'
import { webAutomationTool } from './webAutomation'
import { seeTool } from './see'
import { videoRenderTool } from './videoRender'
import { studioMediaGenTool } from './mediaStudio'
import { localImageGenTool, localVideoGenTool } from './localGen'
import { castToTvTool } from './tvCast'
import {
  diagramRenderTool, codeFormatTool, textAnalyticsTool, dataStatsTool,
  keywordExtractTool, entityExtractTool, queryRefineTool,
  docExportTool, docEnhanceTool,
} from './independentTools'
import { visualVerifyTool } from './visualVerify'
import { askUserTool, setUserQuestionHandler } from './askUser'
import { fsPatchTool } from './fsPatch'
import { codeOutlineTool } from './codeOutline'
import { codeValidateTool } from './codeValidate'
import { fsOutlineTool, fsSmartReadTool } from './fsSmartRead'
import { fsSkimTool } from './fsSkim'
import { pushAmbientSignal, popAmbientSignal } from './http'
import { repairToolArguments } from './schemaRepair'
import { validateToolSafety } from './toolGuard'
import { getMcpSchemas, isMcpTool, callMcpTool } from '../mcp'
import {
  isDesktop, fsAddFolderTool, fsListTool, fsReadTool, fsWriteTool, fsEditTool, fsSearchTool,
  fsFindFilesTool, fsDeleteTool, fsMkdirTool, fsMoveTool, fsBatchReadTool, fsFileTreeTool,
  fsReplaceContentTool, fsMultiReplaceTool, fsFileInfoTool, fsBatchWriteTool, fsCopyTool,
  fsUndoTool, fsGitTool, fsCodebaseMapTool, getWorkspaceCtx, withWorkspaceContext,
  fsExistsTool, fsWriteAppendTool, fsComputeHashTool, fsLockTool, fsUnlockTool, fsAtomicWriteTool, fsPingTool,
  DESKTOP_ONLY_TOOLS as REAL_DESKTOP_ONLY_TOOLS,
} from './localFs'
import { requestPermission } from '../permissions'
import { terminalRunTool } from './terminalRun'
import { mcpResourceTool, mcpPromptTool } from './mcpResources'
import { backgroundTaskSpawnTool } from '../backgroundWorkers'
import { mcpSearchTool } from './mcpSearchTool'
import { computerControlTool } from './computerControl'
import { identifyTool } from './identify'
import { segmentTool } from './segment'
import { browserControlTool } from './browserControl'
import { qaReportTool } from './qaReportGen'
import { clipboardAccessTool } from './clipboardAccess'
import { watchFolderTool } from './watchFolder'
import { systemStateTool } from './systemState'
import { processManagerTool } from './processManager'
import { fileDialogTool } from './fileDialog'
import { todoTool } from './todo'
import { financeTool } from './finance'
import { marketDataTool } from './marketData'
import { zerodhaTradeTool } from './zerodhaTrade'
import { videoEditTool } from './videoEdit'
import {
  gitStatusTool, gitLogTool, gitDiffTool,
  procStartTool, procOutputTool, procStopTool, procListTool, watchTool,
} from './devTools'
import {
  uuidTool, passwordTool, numberBaseTool, cronTool, timezoneTool, thesaurusTool, countryTool,
} from './moretools'
import { spawnAgentsTool } from './spawnAgents'
import { schedulerTool } from './scheduler'
import { timerTool } from './timer'
import { socialSearchTool } from './socialSearch'
import { jobSearchTool } from './jobSearch'
import { socialPostTool } from './socialPost'
import { autoSkillsTool } from './autoSkills'
import { actionJournalTool } from './actionJournalTool'
import { agentSwarmTool } from './agentSwarmTool'
import { subAgentRunnerTool } from './subAgentRunner'
import { documentGeneratorTool } from './docGenerator'
import { crewOrchestratorTool } from './crewRunner'
import { deepsecTool } from './deepsec'
import { turbovecTool } from './turbovec'
import { fprimeTool } from './fprime'
import { threeuiTool } from './threeui'
import { manimAnimTool } from './manimEngine'
import { numbatTool } from './numbat'
import { agentReachTool } from './agentReach'
import { unlimitedOcrTool } from './unlimitedOcr'
import { lightpandaTool } from './lightpanda'
import { repoFinderTool } from './repoFinder'
import { guardrailsTool } from './guardrails'
import { firecrawlTool } from './firecrawl'
import { cloudflareOsTool } from './cloudflareOs'
import {
  semanticaRecordDecisionTool,
  semanticaTraceCausalChainTool,
  semanticaFindPrecedentsTool,
  semanticaContextGraphTool,
  semanticaAuditExportTool,
} from './semantica'
import {
  codeReviewDiffTool,
  codeReviewScanTool,
  codeReviewPrTool,
} from './codeReview'
import {
  hexstrikeReconTool,
  hexstrikeAuditHeadersTool,
  hexstrikeVulnScanTool,
  hexstrikeAttackSurfaceTool,
  hexstrikeGeneratePlaybookTool,
} from './hexstrike'
import {
  drugInfoTool, cryptoPriceTool, chemicalInfoTool, worldBankTool,
  nobelPrizeTool, issLocationTool, tvShowTool, triviaQuizTool, postalLookupTool,
  nasaApodTool, itunesSearchTool, artInstituteTool, solarTimesTool,
  dnsLookupTool, activitySuggestTool, jokesTool, animalFactsTool,
  cocktailRecipeTool, mealRecipeTool, toolDiscoveryTool, federalRegisterTool,
  userProfileGenTool, nasaAsteroidsTool, bibleScriptureTool, wikimediaFeedTool,
  // waybackArchiveTool retired 2026-09-04 — a duplicate of knowledge.js's
  // archiveTool (same job, same endpoint). See archive.js note below.
} from './openApis'
import { sportsTool, animeTool } from './sportsAnime'
import {
  executeScreenInspect,
  executeDesktopAction,
  executeBrowserAutopilot,
} from './desktopCompanion'
import { localInferenceTool } from './localInference'
import { dspyOptimizerTool } from './dspyOptimizer'
import { pillLookupTool } from './pillLookup'
import { barcodeLookupTool } from './barcodeLookup'
import { haystackRagTool } from './haystackRag'
import { aiderCopilotTool } from './aiderCopilot'
import { langsmithObservabilityTool } from './langsmithObservability'
import { langGraphFlowTool } from './langGraphFlow'
import { scraplingTool } from './scrapling'
import { researchBriefingTool } from './researchBriefing'
import { appSettingsTool } from './appSettings'
import { artemisAndroidTool, executeArtemisAndroid } from './artemisAndroid'

export const screenInspectTool = {
  schema: {
    type: 'function',
    function: {
      name: 'screen_inspect',
      description: 'Capture the desktop screen and inspect the active foreground application window (title, process, visual UI context, and OCR text). Use when the user asks to analyze what is on their screen, monitor an external app, or read active desktop state.',
      parameters: {
        type: 'object',
        properties: {
          focus: { type: 'string', description: 'Target focus area: "all" (entire primary screen) or "active_window"' },
          includeOcr: { type: 'boolean', description: 'Whether to extract OCR text from the capture (default: true)' },
        },
      },
    },
  },
  execute: executeScreenInspect,
}

export const desktopActionTool = {
  schema: {
    type: 'function',
    function: {
      name: 'desktop_action',
      description: 'Perform an OS-level synthetic action in the active application window or desktop (type text, trigger hotkeys, open apps/URLs, or copy to clipboard).',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['type', 'hotkey', 'clipboard', 'launch'], description: 'Action type: type (keystrokes), hotkey (e.g. ^c, ^v), clipboard (copy text), launch (open URL/app)' },
          text: { type: 'string', description: 'Text to type or copy to clipboard' },
          keys: { type: 'string', description: 'Key combination for hotkeys (e.g. ^c, {ENTER}, {TAB})' },
          targetUrl: { type: 'string', description: 'URL to launch in default browser' },
          targetApp: { type: 'string', description: 'Application or path to open' },
        },
        required: ['action'],
      },
    },
  },
  execute: executeDesktopAction,
}

export const torrentDownloadTool = {
  schema: {
    type: 'function',
    function: {
      name: 'download_torrent',
      description: 'Download an open-source dataset, Linux ISO, or file using Yogatik Desktop\'s built-in P2P BitTorrent engine via magnet URI or torrent link.',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'Magnet URI (e.g. magnet:?xt=urn:btih:...) or HTTP link to a .torrent file' },
          download_path: { type: 'string', description: 'Optional custom target folder. Defaults to user\'s Downloads directory.' }
        },
        required: ['uri']
      }
    }
  },
  execute: async ({ uri, download_path }) => {
    const { addTorrent, isTorrentAvailable } = await import('./torrentClient.js')
    if (!isTorrentAvailable()) {
      return { success: false, error: 'BitTorrent engine is available in Yogatik Desktop app only.' }
    }
    return addTorrent({ uri, downloadPath: download_path })
  }
}

export const browserAutopilotTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_autopilot',
      description: 'Fetch a web page\'s static HTML and extract its text, optionally focused on a query. Does NOT run JavaScript, log in, click, or see what a page renders — for that use browser_control (desktop app). Good for quick text extraction from simple public pages.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Web page URL to navigate and pilot' },
          task: { type: 'string', description: 'Task description: "extract", "monitor", or "summarize"' },
          query: { type: 'string', description: 'Specific keyword, topic, or section to focus on' },
        },
        required: ['url'],
      },
    },
  },
  execute: executeBrowserAutopilot,
}

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
  local_search: localIndexSearchTool,
  local_crawl: localCrawlerTool,
  download_torrent: torrentDownloadTool,
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
  podcast_generate: podcastGenerateTool,
  audio_overview: podcastGenerateTool,
  web_extract: webExtractTool,
  web_automate: webAutomationTool,
  web_automation: webAutomationTool,
  youtube: youtubeTool,
  see: seeTool,
  visual_verify: visualVerifyTool,
  video_render: videoRenderTool,
  video_edit: videoEditTool,
  studio_media_generate: studioMediaGenTool,
  // Local on-device generation via a user-installed ComfyUI. Desktop only.
  local_image_generate: localImageGenTool,
  local_video_generate: localVideoGenTool,
  // Cast this app's own generated media to a TV over UPnP/DLNA. Desktop only.
  cast_to_tv: castToTvTool,
  diagram_render: diagramRenderTool,
  code_format: codeFormatTool,
  text_analytics: textAnalyticsTool,
  data_stats: dataStatsTool,
  keyword_extract: keywordExtractTool,
  entity_extract: entityExtractTool,
  query_refine: queryRefineTool,
  doc_export: docExportTool,
  doc_enhance: docEnhanceTool,
  // Social Media & Career Intelligence Tools
  social_search: socialSearchTool,
  job_search: jobSearchTool,
  social_post_generator: socialPostTool,
  background_task_spawn: backgroundTaskSpawnTool,
  background_task: backgroundTaskSpawnTool,
  ask_user: askUserTool,
  ask_question: askUserTool,
  user_input: askUserTool,
  // Desktop-only local filesystem tools (Tauri shell). Present in every build;
  // in the browser they return an honest "desktop only" note.
  fs_add_folder: fsAddFolderTool,
  fs_list: fsListTool,
  fs_read: fsReadTool,
  fs_write: fsWriteTool,
  fs_edit: fsEditTool,
  fs_replace_content: fsReplaceContentTool,
  fs_multi_replace: fsMultiReplaceTool,
  fs_patch: fsPatchTool,
  code_outline: codeOutlineTool,
  code_validate: codeValidateTool,
  fs_outline: fsOutlineTool,
  fs_smart_read: fsSmartReadTool,
  fs_skim: fsSkimTool,
  segment: segmentTool,
  fs_file_info: fsFileInfoTool,
  fs_copy: fsCopyTool,
  identify: identifyTool,
  fs_batch_write: fsBatchWriteTool,
  fs_search: fsSearchTool,
  fs_find_files: fsFindFilesTool,
  fs_delete: fsDeleteTool,
  fs_mkdir: fsMkdirTool,
  fs_move: fsMoveTool,
  fs_batch_read: fsBatchReadTool,
  fs_file_tree: fsFileTreeTool,
  fs_codebase_map: fsCodebaseMapTool,
  fs_undo: fsUndoTool,
  fs_git: fsGitTool,
  fs_exists: fsExistsTool,
  fs_is_file: fsExistsTool,
  fs_is_dir: fsExistsTool,
  fs_write_append: fsWriteAppendTool,
  fs_append: fsWriteAppendTool,
  fs_compute_hash: fsComputeHashTool,
  fs_hash: fsComputeHashTool,
  fs_lock: fsLockTool,
  fs_unlock: fsUnlockTool,
  fs_atomic_write: fsAtomicWriteTool,
  fs_ping: fsPingTool,
  terminal_run: terminalRunTool,
  todo: todoTool,
  finance_analytics: financeTool,
  market_data: marketDataTool,
  zerodha_trade: zerodhaTradeTool,
  // MCP: use resources & prompt templates published by connected servers + dynamic tool search.
  mcp_resource: mcpResourceTool,
  mcp_prompt: mcpPromptTool,
  mcp_search_tools: mcpSearchTool,
  // Desktop-native OS capabilities (Electron shell). Web build returns an
  // honest "desktop only" note; each gates on its own bridge.
  clipboard_access: clipboardAccessTool,
  watch_folder: watchFolderTool,
  system_state: systemStateTool,
  process_manager: processManagerTool,
  file_dialog: fileDialogTool,
  // Desktop dev loop: git, background command runner, polling file watch.
  git_status: gitStatusTool,
  git_log: gitLogTool,
  git_diff: gitDiffTool,
  proc_start: procStartTool,
  proc_output: procOutputTool,
  proc_stop: procStopTool,
  proc_list: procListTool,
  watch: watchTool,
  // Open, keyless utilities + word/country data.
  uuid: uuidTool,
  password_generate: passwordTool,
  number_base: numberBaseTool,
  cron_next: cronTool,
  timezone: timezoneTool,
  thesaurus: thesaurusTool,
  country_info: countryTool,
  // Scheduler, Timers & Alarms
  scheduler: schedulerTool,
  timer: timerTool,
  alarm: timerTool,
  // Auto-Skill Generator
  auto_skills: autoSkillsTool,
  // Cryptographic Action Journal & Time-Machine Rollback
  action_journal: actionJournalTool,
  // Sovereign Autonomous Multi-Agent Swarm with Self-Healing
  agent_swarm: agentSwarmTool,
  // Sub-Agent Runner (isolated processes + Python RPC)
  sub_agent_runner: subAgentRunnerTool,
  // Multi-agent delegation: hand focused sub-tasks to specialist sub-agents.
  spawn_agents: spawnAgentsTool,
  // OS-Level Screen Monitoring, Cross-App Computer Use & Browser Autopilot
  screen_inspect: screenInspectTool,
  desktop_action: desktopActionTool,
  computer_control: computerControlTool,
  browser_autopilot: browserAutopilotTool,
  browser_control: browserControlTool,
  qa_report_generate: qaReportTool,
  pill_lookup: pillLookupTool,
  barcode_lookup: barcodeLookupTool,
  // Open Public API Tools (Keyless, Free, Browser-Native)
  drug_info: drugInfoTool,
  crypto_price: cryptoPriceTool,
  chemical_info: chemicalInfoTool,
  world_bank: worldBankTool,
  nobel_prize: nobelPrizeTool,
  iss_location: issLocationTool,
  tv_shows: tvShowTool,
  trivia_quiz: triviaQuizTool,
  postal_lookup: postalLookupTool,
  nasa_apod: nasaApodTool,
  itunes_search: itunesSearchTool,
  art_institute: artInstituteTool,
  solar_times: solarTimesTool,
  dns_lookup: dnsLookupTool,
  activity_suggest: activitySuggestTool,
  jokes: jokesTool,
  animal_facts: animalFactsTool,
  cocktail_recipe: cocktailRecipeTool,
  meal_recipe: mealRecipeTool,
  tool_discovery: toolDiscoveryTool,
  federal_register: federalRegisterTool,
  user_profile_gen: userProfileGenTool,
  nasa_asteroids: nasaAsteroidsTool,
  bible_scripture: bibleScriptureTool,
  wikimedia_feed: wikimediaFeedTool,
  // Sports scores/schedules + anime/manga lookup — keyless, CORS-verified.
  sports_scores: sportsTool,
  anime_lookup: animeTool,
  document_generator: documentGeneratorTool,
  crew_orchestrator: crewOrchestratorTool,
  deepsec: deepsecTool,
  turbovec: turbovecTool,
  fprime: fprimeTool,
  threeui: threeuiTool,
  manim_anim: manimAnimTool,
  numbat: numbatTool,
  agent_reach: agentReachTool,
  unlimited_ocr: unlimitedOcrTool,
  lightpanda: lightpandaTool,
  repo_finder: repoFinderTool,
  guardrails: guardrailsTool,
  firecrawl: firecrawlTool,
  cloudflare_os: cloudflareOsTool,
  // Semantica: Graph-Native Context & Decision Intelligence
  semantica_record_decision: semanticaRecordDecisionTool,
  semantica_trace_causal_chain: semanticaTraceCausalChainTool,
  semantica_find_precedents: semanticaFindPrecedentsTool,
  semantica_context_graph: semanticaContextGraphTool,
  semantica_audit_export: semanticaAuditExportTool,
  // Alibaba Open Code Review
  code_review_diff: codeReviewDiffTool,
  code_review_scan: codeReviewScanTool,
  code_review_pr: codeReviewPrTool,
  // HexStrike AI Security Suite
  hexstrike_recon: hexstrikeReconTool,
  hexstrike_audit_headers: hexstrikeAuditHeadersTool,
  hexstrike_vuln_scan: hexstrikeVulnScanTool,
  hexstrike_attack_surface: hexstrikeAttackSurfaceTool,
  hexstrike_generate_playbook: hexstrikeGeneratePlaybookTool,
  // Core AI & LLM Frameworks Integration
  local_inference: localInferenceTool,
  dspy_optimizer: dspyOptimizerTool,
  haystack_rag: haystackRagTool,
  aider_copilot: aiderCopilotTool,
  langsmith_observability: langsmithObservabilityTool,
  langgraph_flow: langGraphFlowTool,
  scrapling_scrape: scraplingTool,
  research_briefing: researchBriefingTool,
  // Yogatik AI Settings, Workspace Resources, and Modal Control Suite
  app_settings: appSettingsTool,
  // Google Artemis: Autonomous Android & Emulator Testing Suite (Pixel Test Engineering)
  artemis_android: artemisAndroidTool,
}

/** Common LLM hallucinated tool names mapped to their canonical Yogatik tool */
export const TOOL_ALIASES = {
  // Artemis Android aliases
  artemis: 'artemis_android',
  google_artemis: 'artemis_android',
  android_automation: 'artemis_android',
  adb_device: 'artemis_android',
  adb_mobile: 'artemis_android',
  android_test: 'artemis_android',
  artemis_test: 'artemis_android',
  settings: 'app_settings',
  settings_manage: 'app_settings',
  manage_settings: 'app_settings',
  update_setting: 'app_settings',
  change_setting: 'app_settings',
  get_setting: 'app_settings',
  system_settings: 'app_settings',
  app_resources: 'app_settings',
  resource_manager: 'app_settings',
  open_modal: 'app_settings',
  local_vault: 'local_vault_search',
  scrapling: 'scrapling_scrape',
  scrapling_tool: 'scrapling_scrape',
  web_scrape_adaptive: 'scrapling_scrape',
  stealth_scrape: 'scrapling_scrape',
  adaptive_scraper: 'scrapling_scrape',
  // Identify — the tool that answers "what IS this" about an image. Naming it
  // the obvious ways matters: the model reaching for `ocr` on a photo gets
  // text and nothing else, which is exactly how a video-player screenshot
  // became "10 » | 41 PLEY" instead of a search for the series.
  identify_image: 'identify',
  what_is_this: 'identify',
  reverse_image: 'identify',
  image_identify: 'identify',
  recognize_image: 'identify',
  analyze_image: 'identify',
  // Local Inference aliases
  ollama: 'local_inference',
  lmstudio: 'local_inference',
  vllm: 'local_inference',
  llamacpp: 'local_inference',
  sglang: 'local_inference',
  local_llm: 'local_inference',
  local_model: 'local_inference',
  benchmark_model: 'local_inference',
  // DSPy aliases
  dspy: 'dspy_optimizer',
  prompt_compiler: 'dspy_optimizer',
  optimize_prompt: 'dspy_optimizer',
  teleprompter: 'dspy_optimizer',
  mipro: 'dspy_optimizer',
  // Haystack & RAG aliases
  haystack: 'haystack_rag',
  hybrid_rag: 'haystack_rag',
  hybrid_search: 'haystack_rag',
  bm25_search: 'haystack_rag',
  hyde: 'haystack_rag',
  rerank: 'haystack_rag',
  // Aider / Coding Assistant aliases
  aider: 'aider_copilot',
  continue_dev: 'aider_copilot',
  pair_programmer: 'aider_copilot',
  apply_patch: 'aider_copilot',
  generate_commit: 'aider_copilot',
  // Observability & LangSmith aliases
  langsmith: 'langsmith_observability',
  observability: 'langsmith_observability',
  trace_run: 'langsmith_observability',
  token_cost: 'langsmith_observability',
  // LangGraph aliases
  langgraph: 'langgraph_flow',
  state_graph: 'langgraph_flow',
  agent_graph: 'langgraph_flow',
  multi_agent_flow: 'langgraph_flow',
  // Agent Swarm & Action Journal aliases
  swarm: 'agent_swarm',
  multi_agent_swarm: 'agent_swarm',
  swarm_orchestrator: 'agent_swarm',
  action_journal_rollback: 'action_journal',
  time_machine: 'action_journal',
  time_machine_rollback: 'action_journal',
  merkle_audit: 'action_journal',
  // Semantica aliases
  record_decision: 'semantica_record_decision',
  trace_decision: 'semantica_trace_causal_chain',
  trace_causal_chain: 'semantica_trace_causal_chain',
  find_precedents: 'semantica_find_precedents',
  similar_decisions: 'semantica_find_precedents',
  context_graph: 'semantica_context_graph',
  semantica: 'semantica_context_graph',
  audit_export: 'semantica_audit_export',
  export_audit_trail: 'semantica_audit_export',
  // Open Code Review aliases
  code_review: 'code_review_diff',
  ocr_diff: 'code_review_diff',
  ocr_scan: 'code_review_scan',
  scan_code: 'code_review_scan',
  audit_file: 'code_review_scan',
  review_pr: 'code_review_pr',
  open_code_review: 'code_review_diff',
  // HexStrike AI aliases
  hexstrike: 'hexstrike_vuln_scan',
  hexstrike_ai: 'hexstrike_vuln_scan',
  vuln_scan: 'hexstrike_vuln_scan',
  audit_headers: 'hexstrike_audit_headers',
  security_headers: 'hexstrike_audit_headers',
  recon_target: 'hexstrike_recon',
  attack_surface: 'hexstrike_attack_surface',
  security_playbook: 'hexstrike_generate_playbook',
  replace_file_content: 'fs_replace_content',
  multi_replace_file_content: 'fs_multi_replace',
  file_info: 'fs_file_info',
  batch_write: 'fs_batch_write',
  batch_write_files: 'fs_batch_write',
  find_files: 'fs_find_files',
  find_file: 'fs_find_files',
  glob_files: 'fs_find_files',
  fs_glob: 'fs_find_files',
  locate_file: 'fs_find_files',
  codebase_map: 'fs_codebase_map',
  repo_map: 'fs_codebase_map',
  map_codebase: 'fs_codebase_map',
  understand_codebase: 'fs_codebase_map',
  explore_codebase: 'fs_codebase_map',
  read_file: 'fs_read',
  smart_read: 'fs_smart_read',
  file_outline: 'fs_outline',
  skim_file: 'fs_skim',
  skim: 'fs_skim',
  file_skeleton: 'fs_skim',
  read_skeleton: 'fs_skim',
  outline_body: 'fs_skim',
  // `segment` is what a model reaches for by many names. None of these shadow
  // a registered tool — `crop` and `cutout` in particular are not tools.
  segment_object: 'segment', cutout: 'segment', remove_background: 'segment',
  isolate_object: 'segment', crop_to_object: 'segment', mask_object: 'segment',
  // RETIRED: spawn_subagent was a strictly worse second copy of spawn_agents.
  // executeTool only ever passes { signal, ctx }, so its `opts.provider ||
  // 'local'` pinned EVERY worker to the WebLLM provider regardless of the chat's
  // actual provider — a 750MB download that must never be a default, and empty
  // for anyone without it. Its workers called streamChat directly, so they had
  // NO TOOLS at all while the description promised parallel searching and file
  // analysis; and its bare Promise.all sat outside agentPool, the one global
  // semaphore that keeps concurrent sub-agent calls under the provider rate
  // limit. Same class as terminal_exec: two near-identical descriptions in a
  // 64-slot budget, one of which could not do the job.
  spawn_subagent: 'spawn_agents',
  parallel_agents: 'spawn_agents',
  view_file: 'fs_read',
  write_file: 'fs_write',
  create_file: 'fs_write',
  edit_file: 'fs_edit',
  list_dir: 'fs_list',
  list_files: 'fs_list',
  list_directory: 'fs_list',
  delete_file: 'fs_delete',
  remove_file: 'fs_delete',
  move_file: 'fs_move',
  rename_file: 'fs_move',
  mkdir: 'fs_mkdir',
  make_dir: 'fs_mkdir',
  make_directory: 'fs_mkdir',
  file_tree: 'fs_file_tree',
  directory_tree: 'fs_file_tree',
  grep_search: 'fs_search',
  search_files: 'fs_search',
  search_code: 'fs_search',
  batch_read: 'fs_batch_read',
  git: 'fs_git',
  git_commit: 'fs_git',
  git_stage: 'fs_git',
  git_unstage: 'fs_git',
  git_history: 'fs_git',
  // terminal_exec was a duplicate of terminal_run; it is an alias now.
  terminal_exec: 'terminal_run',
  terminal_cmd: 'terminal_run',
  exec_terminal: 'terminal_run',
  cloudflareos: 'cloudflare_os',
  cloudflare_workspace: 'cloudflare_os',
  gatekeeper: 'cloudflare_os',
  cf_os: 'cloudflare_os',
  cf_gadgets: 'cloudflare_os',
  ai_gateway: 'cloudflare_os',
  guardrails_ai: 'guardrails',
  rebuff: 'guardrails',
  pii_redact: 'guardrails',
  canary_guard: 'guardrails',
  firecrawl_scraper: 'firecrawl',
  deep_crawler: 'firecrawl',
  github_repo_finder: 'repo_finder',
  repo_finder_tool: 'repo_finder',
  github_finder: 'repo_finder',
  repo_search: 'repo_finder',
  find_repos: 'repo_finder',
  similar_repos: 'repo_finder',
  lightpanda_browser: 'lightpanda',
  lightpanda_tool: 'lightpanda',
  fast_browser: 'lightpanda',
  headless_browser: 'lightpanda',
  light_browser: 'lightpanda',
  unlimited_ocr_tool: 'unlimited_ocr',
  unlimitedocr: 'unlimited_ocr',
  baidu_ocr: 'unlimited_ocr',
  doc_parser: 'unlimited_ocr',
  rswa_ocr: 'unlimited_ocr',
  formula_ocr: 'unlimited_ocr',
  agent_reach_tool: 'agent_reach',
  agentreach: 'agent_reach',
  social_reach: 'agent_reach',
  universal_reader: 'agent_reach',
  platform_search: 'agent_reach',
  perplexity_numbat: 'numbat',
  numbat_guard: 'numbat',
  agent_security_guard: 'numbat',
  agent_guard: 'numbat',
  agent_sandbox: 'numbat',
  threejs_ui: 'threeui',
  three_ui: 'threeui',
  '3d_ui': 'threeui',
  '3d_hero': 'threeui',
  three_generator: 'threeui',
  nasa_fprime: 'fprime',
  fprime_tool: 'fprime',
  fprime_scaffold: 'fprime',
  flight_software: 'fprime',
  fprime_generator: 'fprime',
  vector_search: 'turbovec',
  vector_index: 'turbovec',
  turbo_vector: 'turbovec',
  turbovec_search: 'turbovec',
  turbovec_index: 'turbovec',
  semantic_index: 'turbovec',
  deepsec_audit: 'deepsec',
  security_audit: 'deepsec',
  deep_security_scan: 'deepsec',
  code_security: 'deepsec',
  vuln_scan: 'deepsec',
  vulnerability_scan: 'deepsec',
  pill_identifier: 'pill_lookup',
  pill_id: 'pill_lookup',
  identify_pill: 'pill_lookup',
  rx_lookup: 'pill_lookup',
  medication_lookup: 'pill_lookup',
  barcode_reader: 'barcode_lookup',
  upc_lookup: 'barcode_lookup',
  ean_lookup: 'barcode_lookup',
  product_barcode: 'barcode_lookup',
  sast_scan: 'deepsec',
  schedule: 'scheduler',
  set_alarm: 'timer',
  set_timer: 'timer',
  set_reminder: 'timer',
  reminder: 'timer',
  remind: 'timer',
  clock: 'timer',
  cron: 'cron_next',
  cron_scheduler: 'scheduler',
  screen_capture: 'screen_inspect',
  capture_screen: 'screen_inspect',
  inspect_screen: 'screen_inspect',
  inspect_app: 'screen_inspect',
  monitor_screen: 'screen_inspect',
  computer_use: 'computer_control',
  click_screen: 'computer_control',
  type_text: 'desktop_action',
  mouse_click: 'computer_control',
  mouse_move: 'computer_control',
  click: 'computer_control',
  scroll: 'computer_control',
  press_key: 'computer_control',
  keyboard: 'computer_control',
  // Real in-app browser (desktop). Deliberately NOT aliased to
  // browser_autopilot, which only fetches static HTML.
  browse: 'browser_control',
  open_url: 'browser_control',
  web_browse: 'browser_control',
  browser: 'browser_control',
  click_element: 'browser_control',
  browser_read: 'browser_control',
  // Desktop-native capability aliases
  clipboard: 'clipboard_access',
  read_clipboard: 'clipboard_access',
  get_clipboard: 'clipboard_access',
  clipboard_history: 'clipboard_access',
  paste: 'clipboard_access',
  // NOTE: no `watch:` alias here — `watch` is a REGISTERED tool (devTools) with
  // its own actions. An alias of the same name shadowed it.
  watch_files: 'watch_folder',
  file_watcher: 'watch_folder',
  monitor_folder: 'watch_folder',
  idle_time: 'system_state',
  power_state: 'system_state',
  battery_status: 'system_state',
  system_status: 'system_state',
  list_processes: 'process_manager',
  kill_process: 'process_manager',
  task_manager: 'process_manager',
  ps: 'process_manager',
  open_file_dialog: 'file_dialog',
  file_picker: 'file_dialog',
  save_file: 'file_dialog',
  pick_file: 'file_dialog',
  save_dialog: 'file_dialog',
  browser_agent: 'browser_autopilot',
  strawberry_browser: 'browser_autopilot',
  qa_report: 'qa_report_generate',
  qa_report_generator: 'qa_report_generate',
  test_report: 'qa_report_generate',
  generate_test_report: 'qa_report_generate',
  browser_test: 'browser_control',
  browser_assert: 'browser_control',
  browser_wait: 'browser_control',
  browser_audit: 'browser_control',
  wcag_audit: 'browser_control',
  search: 'web_search',
  google: 'web_search',
  bing: 'web_search',
  duckduckgo: 'web_search',
  websearch: 'web_search',
  internet_search: 'web_search',
  online_search: 'web_search',
  // web_extract aliases — models often call web_read, read_url, fetch_url
  web_read: 'web_extract',
  read_url: 'web_extract',
  read_url_content: 'web_extract',
  fetch_url: 'web_extract',
  read_web_page: 'web_extract',
  scrape_url: 'web_extract',
  web_fetch: 'web_extract',
  web_scrape: 'web_extract',
  extract_web: 'web_extract',
  extract_url: 'web_extract',
  browse_url: 'web_extract',
  url_read: 'web_extract',
  url_extract: 'web_extract',
  web_page: 'web_extract',
  fetch_web_page: 'web_extract',
  read_page: 'web_extract',
  generate_image: 'image_generate',
  create_image: 'image_generate',
  text_to_image: 'image_generate',
  dalle: 'image_generate',
  imagegen: 'image_generate',
  generate_sticker: 'sticker_generate',
  comfy_generate: 'local_image_generate',
  comfyui_generate: 'local_image_generate',
  local_diffusion: 'local_image_generate',
  offline_image_generate: 'local_image_generate',
  animate_image: 'local_video_generate',
  image_to_video: 'local_video_generate',
  img2vid: 'local_video_generate',
  cast: 'cast_to_tv',
  cast_media: 'cast_to_tv',
  throw_to_tv: 'cast_to_tv',
  screen_cast: 'cast_to_tv',
  dlna_cast: 'cast_to_tv',
  chromecast: 'cast_to_tv',
  play_on_tv: 'cast_to_tv',
  draw_chart: 'chart',
  generate_chart: 'chart',
  plot_chart: 'chart',
  generate_diagram: 'diagram',
  mermaid: 'diagram',
  execute_code: 'code_execute',
  run_code: 'code_execute',
  python_execute: 'code_execute',
  python_runner: 'code_execute',
  code_runner: 'code_execute',
  calculate: 'calculator',
  calc: 'calculator',
  math: 'calculator',
  format_code: 'code_format',
  validate_code: 'code_validate',
  check_syntax: 'code_validate',
  syntax_check: 'code_validate',
  code_lint: 'code_validate',
  kite_trade: 'zerodha_trade',
  trade_indian_stock: 'zerodha_trade',
  paper_trade: 'zerodha_trade',
  zerodha: 'zerodha_trade',
  kite: 'zerodha_trade',
  indian_stocks: 'zerodha_trade',
  text_to_speech: 'tts',
  speak: 'tts',
  read_aloud: 'tts',
  speech_to_text: 'stt',
  transcribe: 'stt',
  audio_transcribe: 'stt',
  narrate: 'text_to_audio',
  get_weather: 'weather',
  check_weather: 'weather',
  translator: 'translate',
  translation: 'translate',
  wiki: 'wikipedia',
  generate_qr: 'qr_generate',
  create_qr: 'qr_generate',
  read_qr: 'qr_read',
  scan_qr: 'qr_read',
  extract_pdf: 'pdf_extract',
  read_pdf: 'pdf_extract',
  // md_to_pdf aliases — the model sometimes calls these names when creating PDFs
  create_pdf: 'md_to_pdf',
  generate_pdf: 'md_to_pdf',
  export_pdf: 'md_to_pdf',
  make_pdf: 'md_to_pdf',
  pdf_create: 'md_to_pdf',
  pdf_generate: 'md_to_pdf',
  pdf_export: 'md_to_pdf',
  markdown_to_pdf: 'md_to_pdf',
  convert_to_pdf: 'md_to_pdf',
  // Manim Mathematical Animation Aliases
  manim: 'manim_anim',
  math_anim: 'manim_anim',
  manim_create: 'manim_anim',
  animate_math: 'manim_anim',
  research: 'deep_research',
  deep_search: 'deep_research',
  // Social & Platform Search
  social_media: 'social_search',
  social_media_search: 'social_search',
  twitter_search: 'social_search',
  tweet_search: 'social_search',
  x_search: 'social_search',
  linkedin_search: 'social_search',
  reddit_search: 'social_search',
  instagram_search: 'social_search',
  tiktok_search: 'social_search',
  facebook_search: 'social_search',
  threads_search: 'social_search',
  youtube_search: 'social_search',
  pinterest_search: 'social_search',
  bluesky_search: 'social_search',
  producthunt_search: 'social_search',
  medium_search: 'social_search',
  substack_search: 'social_search',
  discord_search: 'social_search',
  telegram_search: 'social_search',
  // Job Search
  jobs: 'job_search',
  job_finder: 'job_search',
  find_jobs: 'job_search',
  naukri_search: 'job_search',
  naukri: 'job_search',
  indeed_search: 'job_search',
  indeed: 'job_search',
  linkedin_jobs: 'job_search',
  glassdoor: 'job_search',
  // Social Post Generator
  social_post: 'social_post_generator',
  create_post: 'social_post_generator',
  write_post: 'social_post_generator',
  write_tweet: 'social_post_generator',
  tweet_generator: 'social_post_generator',
  linkedin_post: 'social_post_generator',
  instagram_caption: 'social_post_generator',
  tiktok_script: 'social_post_generator',
  social_content: 'social_post_generator',
  // Open Public API Aliases
  fda: 'drug_info',
  drug: 'drug_info',
  medication: 'drug_info',
  crypto: 'crypto_price',
  bitcoin: 'crypto_price',
  cryptocurrency: 'crypto_price',
  chemical: 'chemical_info',
  pubchem: 'chemical_info',
  molecule: 'chemical_info',
  worldbank: 'world_bank',
  gdp: 'world_bank',
  nobel: 'nobel_prize',
  nobel_laureates: 'nobel_prize',
  iss: 'iss_location',
  space_station: 'iss_location',
  tv: 'tv_shows',
  tv_series: 'tv_shows',
  tvmaze: 'tv_shows',
  trivia: 'trivia_quiz',
  quiz: 'trivia_quiz',
  zipcode: 'postal_lookup',
  zip_code: 'postal_lookup',
  postal: 'postal_lookup',
  apod: 'nasa_apod',
  astronomy_picture: 'nasa_apod',
  nasa_photo: 'nasa_apod',
  itunes: 'itunes_search',
  music_search: 'itunes_search',
  song_search: 'itunes_search',
  podcast_search: 'itunes_search',
  art: 'art_institute',
  artwork: 'art_institute',
  museum_art: 'art_institute',
  sunrise: 'solar_times',
  sunset: 'solar_times',
  sun_times: 'solar_times',
  dns: 'dns_lookup',
  nslookup: 'dns_lookup',
  dig: 'dns_lookup',
  bored: 'activity_suggest',
  activity: 'activity_suggest',
  joke: 'jokes',
  tell_joke: 'jokes',
  dog_facts: 'animal_facts',
  cat_facts: 'animal_facts',
  recipe: 'meal_recipe',
  food_recipe: 'meal_recipe',
  cooking: 'meal_recipe',
  cocktail: 'cocktail_recipe',
  drink_recipe: 'cocktail_recipe',
  mocktail: 'cocktail_recipe',
  executive_order: 'federal_register',
  executive_orders: 'federal_register',
  federal_rules: 'federal_register',
  // waybackArchiveTool was a duplicate of this same 'archive' tool (both hit
  // archive.org/wayback/available) — retired 2026-09-04, aliases point here now.
  wayback: 'archive',
  wayback_archive: 'archive',
  wayback_machine: 'archive',
  archive_url: 'archive',
  random_user: 'user_profile_gen',
  mock_user: 'user_profile_gen',
  generate_persona: 'user_profile_gen',
  asteroids: 'nasa_asteroids',
  asteroid: 'nasa_asteroids',
  near_earth_objects: 'nasa_asteroids',
  neo: 'nasa_asteroids',
  bible: 'bible_scripture',
  scripture: 'bible_scripture',
  verse: 'bible_scripture',
  today_in_history: 'wikimedia_feed',
  on_this_day: 'wikimedia_feed',
  wikipedia_featured: 'wikimedia_feed',
  doc_generator: 'document_generator',
  generate_document: 'document_generator',
  generate_docx: 'document_generator',
  generate_slides: 'document_generator',
  generate_invoice: 'document_generator',
  generate_certificate: 'document_generator',
  make_doc: 'document_generator',
  make_slides: 'document_generator',
  make_invoice: 'document_generator',
  slide_deck: 'document_generator',
  slides: 'document_generator',
  invoice: 'document_generator',
  certificate: 'document_generator',
  crew: 'crew_orchestrator',
  crewai: 'crew_orchestrator',
  multi_agent: 'crew_orchestrator',
  agent_crew: 'crew_orchestrator',
  agent_pipeline: 'crew_orchestrator',
  reflexion: 'crew_orchestrator',
}

/** True when running inside the Yogatik desktop (Tauri) shell. */
export { isDesktop }

/** Get OpenAI function schemas, optionally excluding user-disabled tools */
/**
 * Most tools declare a BARE schema ({description, parameters}) which we wrap in
 * the OpenAI function envelope. A dozen (screen_inspect, desktop_action,
 * browser_autopilot, browser_control, semantica_*, code_review_*) declare the
 * FULL envelope themselves. Blindly spreading those produced
 *   { type:'function', function:{ name, type:'function', function:{…} } }
 * — a tool with a name but NO description and NO parameters. The model could not
 * tell what those tools did and had nothing to fill in, which is why the real
 * browser_control lost out to browser_autopilot. Normalise both shapes.
 */
function toFunctionSchema(name, tool = {}) {
  // A third shape exists: semantica_* and code_review_* declare {name, description,
  // parameters, execute} FLAT, with no `schema` key at all — those reached the model
  // as a name and nothing else.
  const raw = tool.schema && typeof tool.schema === 'object' ? tool.schema : tool

  // And a FOURTH: local_inference, dspy_optimizer, haystack_rag, aider_copilot,
  // langsmith_observability and langgraph_flow put the PARAMETERS object itself
  // under `schema` ({type:'object', properties:{…}}) and keep name/description on
  // the tool. Treating that as a schema wrapper loses both the description and
  // every argument — the model is handed a name it cannot use. Detect it by the
  // thing only a parameters object has: a `properties` map with no description
  // or nested parameters beside it.
  const looksLikeParameters =
    raw && raw.type === 'object' && raw.properties && !raw.description && !raw.parameters
  const schema = looksLikeParameters
    ? { name: tool.name, description: tool.description, parameters: raw }
    : raw

  const inner = schema.function && typeof schema.function === 'object' ? schema.function : schema
  const { type: _ignoredType, function: _ignoredFn, ...rest } = inner
  return {
    type: 'function',
    function: {
      ...rest,
      name: rest.name || name,
      parameters: rest.parameters || { type: 'object', properties: {} },
    },
  }
}

// This USED TO BE a second, hand-maintained literal copy of the set below —
// nothing here ever imported it (agent.js and api.js both correctly import
// the real one from ./localFs), so it was pure drift-in-waiting: the exact
// "two copies, only one wired" class this codebase has hit before (the
// relay list in youtube.js, the two usage meters, the two toast systems).
// Re-exporting the real set is what makes that structurally impossible now —
// there is only one list to add a new desktop-only tool to.
export const DESKTOP_ONLY_TOOLS = REAL_DESKTOP_ONLY_TOOLS

export function getToolSchemas(disabled = []) {
  const off = new Set(disabled)
  const builtin = Object.entries(ALL_TOOLS)
    .filter(([name]) => !off.has(name))
    .map(([name, tool]) => toFunctionSchema(name, tool))
  // Discovered MCP-server tools (if any servers are connected) join the list.
  return [...builtin, ...getMcpSchemas().filter(s => !off.has(s.function.name))]
}

/**
 * How many tool schemas may ride along on ONE request.
 *
 * All 178 registered schemas serialise to ~128KB (~32k tokens) — sent on every
 * single turn. That alone overflows an 8k/16k context, costs real money on paid
 * providers, and OpenAI hard-caps a request at 128 functions, so the full list
 * is also simply invalid there. Ranking without truncating changed nothing about
 * the payload; the cap is what makes the ranking matter.
 */
// Was raised from 64 to Infinity, which turned the paragraph above from a
// description into a contradiction: ranking still ran, truncation stopped, and
// the payload went back to the whole registry — 203 tools as of this change,
// ~36k tokens of function schemas on EVERY turn. On OpenAI that is not merely
// expensive, it is an INVALID REQUEST: the API hard-caps a call at 128
// functions, so a raised cap does not degrade the answer, it 400s the turn.
//
// 96 rather than back to 64: comfortably under the provider limit, but half as
// much headroom sacrificed as the original value, since the registry has since
// tripled. If tools are being dropped mid-task the fix is CORE_TOOL_SCORES —
// that floor is what keeps fs_*/terminal/browser/delegation in the list when a
// follow-up carries no keywords — not removing the cap.
export const MAX_TOOLS_PER_REQUEST = 96

/**
 * Tools that must survive the cap on EVERY turn, whatever the wording.
 *
 * Keyword boosts only fire when the message mentions the thing. A follow-up like
 * "now do the same for the other file" has no keywords, and without a floor the
 * filesystem, shell, browser and delegation tools dropped off the list mid-task —
 * the model would then say it has no file access while holding fs_read.
 * The floor sits above "no score" and far below any keyword boost, so a relevant
 * tool still outranks it.
 */
const CORE_TOOL_SCORES = {
  fs_read: 40, fs_write: 40, fs_edit: 40, fs_list: 40, fs_search: 38, fs_find_files: 38,
  fs_codebase_map: 36,
  terminal_run: 40, proc_start: 30, browser_control: 38, computer_control: 30,
  spawn_agents: 34, memory: 34, doc_search: 34, web_search: 38, web_extract: 38, deep_research: 35, code_execute: 34,
  js_execute: 34, clipboard_access: 28, file_dialog: 28,
  // An image in the turn is the whole reason identify exists; without a floor
  // the 64-tool cap can drop it exactly when it is needed.
  identify: 30, ocr: 26, segment: 26,
}

/** Rank and prioritize tools based on the active user query context */
export function prioritizeToolSchemas(schemas = [], userMessage = '', { limit = MAX_TOOLS_PER_REQUEST } = {}) {
  if (!Array.isArray(schemas) || schemas.length === 0) return []
  // No message to rank by still goes through scoring, so the core floor applies
  // and the cap does not decide by registry order alone.
  const text = typeof userMessage === 'string' ? userMessage.toLowerCase() : ''

  const scores = {
    ...CORE_TOOL_SCORES,
    web_search: 35,
    calculator: 20,
    doc_export: 20,
    code_execute: 15,
    timer: 15,
  }

  // Repository & GitHub search boosts
  if (/\b(repo|repository|repositories|github|gitlab|stars|downloads|npm|pip|pypi|package|open source|oss|trending)\b/i.test(text)) {
    scores['repo_finder'] = 220
    scores['package_info'] = 220
    scores['web_search'] = 200
    scores['web_extract'] = 180
    scores['deep_research'] = 160
  }
  if (/\b(deep research|in-depth research|comprehensive research|literature review|research briefing|study guide|deep dive)\b/i.test(text)) {
    scores['deep_research'] = 280
    scores['research_briefing'] = 240
    scores['web_search'] = 220
    scores['scholar'] = 200
    scores['web_extract'] = 180
  } else if (/\b(research|investigate|find out|explore|lookup|search|overview|information on|facts about|analysis of|summary of)\b/i.test(text)) {
    scores['web_search'] = 220
    scores['deep_research'] = 210
    scores['web_extract'] = 180
    scores['wikipedia'] = 150
  }

  // Domain score boosts
  if (/youtube\.com|youtu\.be|video|watch|clip/i.test(text)) {
    scores['youtube'] = 200
    scores['web_extract'] = 150
    scores['web_search'] = 100
    scores['summarize'] = 90
  }
  if (/https?:\/\//i.test(text)) {
    scores['web_extract'] = 180
    scores['link_preview'] = 120
    scores['web_search'] = 100
  }
  if (/\b(ppt|pptx|powerpoint|slides?|presentation|document|doc|docx|csv|export|download)\b/i.test(text)) {
    scores['doc_export'] = 200
    scores['doc_enhance'] = 180
    scores['pdf_extract'] = 120
    scores['data_convert'] = 100
  }
  // "create/generate/make/export a PDF" → always use md_to_pdf, not doc_export
  if (/\b(pdf|portable document)\b/i.test(text)) {
    if (/\b(creat|generat|make|build|export|convert|produc|write|output|download|save)\b/i.test(text)) {
      scores['md_to_pdf'] = 260
      scores['doc_export'] = 80
    } else {
      // Just mentioned PDF (could be reading or creating)
      scores['md_to_pdf'] = 180
      scores['pdf_extract'] = 140
      scores['doc_export'] = 60
    }
  }
  if (/\b(job|career|hire|naukri|indeed|internship|resume|salary|opening)\b/i.test(text)) {
    scores['job_search'] = 200
    scores['social_post_generator'] = 120
    scores['doc_export'] = 100
  }
  if (/\b(tweet|instagram|post|linkedin|caption|threads|social media)\b/i.test(text)) {
    scores['social_post_generator'] = 200
    scores['social_search'] = 180
  }
  if (/\b(code|python|javascript|script|function|program|bug|error|diff|regex|terminal|run)\b/i.test(text)) {
    scores['code_execute'] = 200
    scores['js_execute'] = 180
    scores['code_validate'] = 170
    scores['code_format'] = 150
    scores['diff'] = 140
    scores['terminal_run'] = 120
  }
  if (/\b(review|bottleneck|audit|inspect|refactor|clean code|code smell|bug risk|defect|snippet|codebase|project structure|file tree)\b/i.test(text)) {
    scores['code_review_scan'] = 240
    scores['fs_read'] = 230
    scores['fs_list'] = 220
    scores['fs_find_files'] = 210
    scores['fs_file_tree'] = 205
    scores['fs_search'] = 200
  }
  if (/\b(syntax|validate|check syntax|lint|bracket|tag|unclosed|malformed)\b/i.test(text)) {
    scores['code_validate'] = 250
  }
  if (/\b(zerodha|kite|nse|bse|indian stock|stock trade|paper trade|buy shares|sell shares|trade live|broker|portfolio|margins)\b/i.test(text)) {
    scores['zerodha_trade'] = 260
    scores['market_data'] = 200
    scores['finance_analytics'] = 170
  }
  if (/\b(diagram|flowchart|lifecycle|mindmap|sequence diagram|architecture|er diagram|class diagram|process flow|schema)\b/i.test(text)) {
    scores['diagram'] = 250
    scores['diagram_render'] = 220
  }
  if (/\b(chart|graph|plot|bar chart|pie chart|line chart|scatter plot)\b/i.test(text)) {
    scores['chart'] = 220
  }
  if (/\b(manim|math animation|calculus animation|fourier animation|matrix animation|vector field animation|3b1b|3blue1brown|kinetic math)\b/i.test(text)) {
    scores['manim_anim'] = 260
  }
  if (/\b(image|picture|photo|draw|illustration|photorealistic|wallpaper|portrait|painting)\b/i.test(text) && !/\b(diagram|flowchart|lifecycle|architecture|schema)\b/i.test(text)) {
    scores['image_generate'] = 200
  }
  // Only surface the local/ComfyUI tools when the request actually asks for
  // local, offline or on-device generation — image_generate/video_render work
  // everywhere with no setup, so they stay the default the rest of the time.
  if (/\b(locally|on-device|on device|offline|my own gpu|comfyui|comfy ui|stable diffusion|local checkpoint)\b/i.test(text)) {
    scores['local_image_generate'] = 210
    scores['local_video_generate'] = 190
  }
  if (/\b(animate (this|that|the) (image|photo|picture)|turn (this|that) image into a video|image to video|img2vid)\b/i.test(text)) {
    scores['local_video_generate'] = 220
  }
  if (/\b(sticker|icon|emoji|badge)\b/i.test(text)) {
    scores['sticker_generate'] = 200
  }
  if (/\b(cast|chromecast|dlna|upnp|smart tv|on (the |my )?tv|play (it |this |that )?on (the |my )?tv)\b/i.test(text)) {
    scores['cast_to_tv'] = 200
  }
  if (/\b(qr|qr code|barcode)\b/i.test(text)) {
    scores['qr_generate'] = 200
  }
  // Isolating one object before reading it is the difference between an
  // imprint that fills the frame and one that is 4% of a cluttered photo —
  // which is the exact case identify and pill_lookup keep meeting.
  if (/\b(imprint|engrav\w*|serial|expiry|small print|fine print|tiny text|this pill|this tablet|the label on)\b/i.test(text)) {
    scores['segment'] = 210
    scores['ocr'] = 190
  }
  if (/\b(cut ?out|remove the background|isolate|segment|just the (object|product|item)|crop to (the|this))\b/i.test(text)) {
    scores['segment'] = 200
  }
  if (/\b(delegate|sub-agent|subagent|multi-agent|plan|steps|roadmap|complex task|workflow)\b/i.test(text)) {
    scores['spawn_agents'] = 200
    scores['sub_agent_runner'] = 180
    scores['scheduler'] = 150
  }
  if (/\b(weather|temperature|forecast|rain|climate)\b/i.test(text)) {
    scores['weather'] = 200
  }
  if (/\b(calc|calculate|sum|multiply|divide|math|percentage|formula)\b/i.test(text)) {
    scores['calculator'] = 200
  }
  if (/\b(translate|french|spanish|german|hindi|japanese|telugu|language)\b/i.test(text)) {
    scores['translate'] = 200
  }
  if (/\b(drug|medicine|medication|fda|dosage|prescription|contraindication|side effect|pill|treatment)\b/i.test(text)) {
    scores['drug_info'] = 200
  }
  if (/\b(crypto|bitcoin|btc|ethereum|eth|solana|sol|token|coin|crypto price|ticker|binance)\b/i.test(text)) {
    scores['crypto_price'] = 200
  }
  if (/\b(chemical|molecule|compound|smiles|pubchem|formula|molecular weight|iupac)\b/i.test(text)) {
    scores['chemical_info'] = 200
  }
  if (/\b(gdp|world bank|population|inflation|economy|macroeconomics|life expectancy|unemployment rate)\b/i.test(text)) {
    scores['world_bank'] = 200
  }
  if (/\b(nobel|nobel prize|laureate|peace prize|nobel winner|physics prize|chemistry prize)\b/i.test(text)) {
    scores['nobel_prize'] = 200
  }
  if (/\b(iss|space station|satellite|orbit|international space station|astronaut)\b/i.test(text)) {
    scores['iss_location'] = 200
  }
  if (/\b(tv show|series|episode|season|tvmaze|netflix|hbo|streaming show|sitcom|drama series)\b/i.test(text)) {
    scores['tv_shows'] = 200
  }
  if (/\b(trivia|quiz|trivia question|test knowledge|flashcard|pub quiz|q&a game)\b/i.test(text)) {
    scores['trivia_quiz'] = 200
  }
  if (/\b(zip code|zipcode|postal code|postcode|pincode|postal lookup|zippopotam)\b/i.test(text)) {
    scores['postal_lookup'] = 200
  }
  if (/\b(apod|nasa|astronomy picture|space photo|galaxy|nebula|cosmic picture)\b/i.test(text)) {
    scores['nasa_apod'] = 200
  }
  if (/\b(song|music|itunes|podcast|track|audio preview|album|artist preview)\b/i.test(text)) {
    scores['itunes_search'] = 200
  }
  if (/\b(art|painting|artwork|museum|monet|van gogh|picasso|exhibit|sculpture)\b/i.test(text)) {
    scores['art_institute'] = 200
  }
  if (/\b(sunrise|sunset|solar noon|golden hour|twilight|day length|dawn|dusk)\b/i.test(text)) {
    scores['solar_times'] = 200
  }
  if (/\b(dns|dns lookup|nslookup|mx record|txt record|cname|nameserver|domain ip)\b/i.test(text)) {
    scores['dns_lookup'] = 200
  }
  if (/\b(bored|boredom|activity idea|what to do|hobby suggestion|weekend plan)\b/i.test(text)) {
    scores['activity_suggest'] = 200
  }
  if (/\b(joke|funny|humor|punchline|make me laugh|pun)\b/i.test(text)) {
    scores['jokes'] = 200
  }
  if (/\b(cat fact|dog breed|feline|canine|animal trivia|puppy|kitten)\b/i.test(text)) {
    scores['animal_facts'] = 200
  }
  if (/\b(recipe|cook|cooking|dish|dinner|cuisine|ingredients|meal idea|bake)\b/i.test(text)) {
    scores['meal_recipe'] = 200
  }
  if (/\b(cocktail|mocktail|drink|bartender|mojito|margarita|liquor|beverage)\b/i.test(text)) {
    scores['cocktail_recipe'] = 200
  }
  if (/\b(executive order|federal register|us regulation|presidential document|federal rule|government notice)\b/i.test(text)) {
    scores['federal_register'] = 200
  }
  if (/\b(wayback|wayback machine|archive\.org|snapshot|archived page|old website|web history)\b/i.test(text)) {
    scores['archive'] = 200
  }
  if (/\b(random user|mock profile|fake persona|test user|user generator|persona)\b/i.test(text)) {
    scores['user_profile_gen'] = 200
  }
  if (/\b(asteroid|comet|near earth|neo|hazardous asteroid|meteor|space rock)\b/i.test(text)) {
    scores['nasa_asteroids'] = 200
  }
  if (/\b(bible|scripture|verse|testament|genesis|psalm|corinthians|john 3:16|gospel)\b/i.test(text)) {
    scores['bible_scripture'] = 200
  }
  if (/\b(on this day|today in history|historical event|history today|wikipedia featured)\b/i.test(text)) {
    scores['wikimedia_feed'] = 200
  }
  if (/\b(score|scores|fixture|fixtures|standings|league table|match result|final score|who won|game schedule|kickoff)\b/i.test(text)) {
    scores['sports_scores'] = 200
  }
  if (/\b(anime|manga|myanimelist|mal|shounen|seinen|isekai|manhwa)\b/i.test(text)) {
    scores['anime_lookup'] = 200
  }
  if (/\b(document|word doc|docx|presentation|slide deck|slides|invoice|billing receipt|certificate|award cert|spreadsheet|doc generator)\b/i.test(text)) {
    scores['document_generator'] = 200
  }
  if (/\b(crew|multi agent|agent pipeline|hierarchical agent|reflexion|crewai|autogen|collaborative agents)\b/i.test(text)) {
    scores['crew_orchestrator'] = 200
  }
  if (/\b(deepsec|security|vulnerability|vuln|cwe|owasp|sast|exploit|penetration|xss|sqli|ssrf|injection|auth bypass|audit code|security review)\b/i.test(text)) {
    scores['deepsec'] = 220
  }
  if (/\b(turbovec|turboquant|vector|vector search|vector database|vector db|rag|embedding|embeddings|similarity search|semantic index|nearest neighbor|knn|ann)\b/i.test(text)) {
    scores['turbovec'] = 220
  }
  if (/\b(fprime|f'|nasa|jpl|flight software|cubesat|smallsat|spacecraft|telemetry|telecommand|fpp|avionics|spaceflight|embedded c\+\+)\b/i.test(text)) {
    scores['fprime'] = 220
  }
  if (/\b(threeui|threejs|three\.js|3d|r3f|react three fiber|webgl|shader|glsl|3d scene|3d hero|3d card|particle wave|torus|canvas 3d)\b/i.test(text)) {
    scores['threeui'] = 220
  }
  if (/\b(numbat|agent security|agent guard|prompt injection|jailbreak|exfiltration|privilege escalation|behavioral security|agent sandbox|trajectory scan|agent audit)\b/i.test(text)) {
    scores['numbat'] = 220
  }
  if (/\b(agent_reach|agent-reach|agent reach|social media|twitter|reddit|bilibili|xiaohongshu|zhihu|douyin|producthunt|platform search|open web reader)\b/i.test(text)) {
    scores['agent_reach'] = 220
  }
  if (/\b(unlimited_ocr|unlimited ocr|baidu ocr|latex formula|math formula|formula extraction|table extraction|document parser|r-swa|sliding window attention|multi-page ocr)\b/i.test(text)) {
    scores['unlimited_ocr'] = 220
  }
  if (/\b(lightpanda|headless browser|fast browser|cdp|web scraper|spa scraper|html to markdown|zig browser|v8 browser|browser automation)\b/i.test(text)) {
    scores['lightpanda'] = 220
  }
  if (/\b(repo_finder|repo finder|github repos|github finder|similar repos|trending repos|open source discovery|find repositories|explore github)\b/i.test(text)) {
    scores['repo_finder'] = 220
  }
  if (/\b(guardrails|rebuff|pii|redact pii|mask pii|canary token|prompt leak|safety guard|schema validation|toxic filter)\b/i.test(text)) {
    scores['guardrails'] = 220
  }
  if (/\b(firecrawl|deep crawl|crawl website|website scraper|sitemap scraper|rag dataset|scrape domain|recursive crawl)\b/i.test(text)) {
    scores['firecrawl'] = 220
  }
  if (/\b(cloudflare_os|cloudflare os|gatekeeper|gadget|cloudflare workers|ai gateway|edge workspace|capability token|sandboxed app)\b/i.test(text)) {
    scores['cloudflare_os'] = 220
  }
  if (/\b(replace_content|multi_replace|replace file|edit file|patch file|modify file|fs_replace|fs_edit)\b/i.test(text)) {
    scores['fs_replace_content'] = 200
    scores['fs_multi_replace'] = 200
    scores['fs_edit'] = 190
  }
  if (/\b(find files|find file|locate file|glob|where is|search files by name|fs_find_files)\b/i.test(text)) {
    scores['fs_find_files'] = 210
    scores['fs_search'] = 190
  }
  // "Learn/understand/explain this codebase" is exactly the instant-whole-repo
  // question the map exists for — score it above fs_find_files/fs_search so a
  // weaker model reaches for the one-call map before starting a blind crawl.
  if (/\b(codebase|repo(sitory)?|project)\b.{0,25}\b(understand|learn|explain|overview|summarize|summarise|structure|map|walkthrough|onboard)\b|\b(understand|learn|explain|map|walk me through)\b.{0,25}\b(codebase|repo(sitory)?|project|folder)\b/i.test(text)) {
    scores['fs_codebase_map'] = 215
    scores['fs_file_tree'] = 150
  }
  // Same idea one level down: "understand/skim/what does THIS FILE do" is the
  // one-file version of the codebase-map question — fs_skim's whole point is
  // seeing a file's shape before a full fs_read, so it should outrank a blind
  // full read the moment the phrasing suggests the model does not yet know
  // which part of the file it needs.
  if (/\b(skim|scan)\b.{0,20}\bfile\b|\bwhat('s| is| does)\b.{0,25}\bfile\b.{0,15}\b(do|contain|look like)\b|\b(understand|shape|structure|outline|overview)\b.{0,20}\bfile\b|\bfile\b.{0,20}\b(structure|shape|outline)\b/i.test(text)) {
    scores['fs_skim'] = 190
    scores['fs_outline'] = 170
  }
  if (/\b(terminal_exec|run terminal|terminal command|execute shell|run command|powershell|bash)\b/i.test(text)) {
    scores['terminal_run'] = 200
  }
  if (/\b(semantica|context graph|decision intelligence|record decision|causal chain|provenance|audit trail|prov-o|decision impact|policy rule)\b/i.test(text)) {
    scores['semantica_record_decision'] = 220
    scores['semantica_trace_causal_chain'] = 220
    scores['semantica_find_precedents'] = 210
    scores['semantica_context_graph'] = 210
    scores['semantica_audit_export'] = 200
  }
  if (/\b(code review|open code review|review diff|review pr|pr review|scan code|defect|security bug|bug risk|code hygiene|line review)\b/i.test(text)) {
    scores['code_review_diff'] = 220
    scores['code_review_scan'] = 220
    scores['code_review_pr'] = 210
  }
  if (/\b(hexstrike|vulnerability scan|security audit|audit headers|attack surface|csp|hsts|cors audit|owasp|cvss|remediation playbook|security posture)\b/i.test(text)) {
    scores['hexstrike_vuln_scan'] = 230
    scores['hexstrike_audit_headers'] = 220
    scores['hexstrike_recon'] = 210
    scores['hexstrike_attack_surface'] = 210
    scores['hexstrike_generate_playbook'] = 200
  }
  if (/\b(ollama|lm studio|lmstudio|vllm|llamacpp|sglang|local model|local inference|benchmark model|gguf|local llm)\b/i.test(text)) {
    scores['local_inference'] = 230
  }
  if (/\b(dspy|prompt compiler|optimize prompt|teleprompter|mipro|few shot compile|prompt signature)\b/i.test(text)) {
    scores['dspy_optimizer'] = 230
  }
  if (/\b(haystack|hybrid rag|hybrid search|bm25|hyde|reciprocal rank|rrf|cross-encoder|rerank)\b/i.test(text)) {
    scores['haystack_rag'] = 230
  }
  if (/\b(aider|continue\.dev|pair programmer|search replace patch|unified diff|conventional commit|code syntax validate)\b/i.test(text)) {
    scores['aider_copilot'] = 230
  }
  if (/\b(langsmith|observability|execution trace|record span|token cost|opentelemetry|waterfall latency)\b/i.test(text)) {
    scores['langsmith_observability'] = 230
  }
  if (/\b(langgraph|state graph|agent graph|multi agent flow|conditional edge|human in the loop|checkpoint)\b/i.test(text)) {
    scores['langgraph_flow'] = 230
  }
  if (/\b(artemis|android automation|adb|pixel test|emulator automation|scrcpy|tap screen|mobile automation|android test)\b/i.test(text)) {
    scores['artemis_android'] = 240
  }
  if (/\b(mcp|model context protocol|connectors?|mcp tool|mcp resource|mcp server|mcp prompt)\b/i.test(text)) {
    scores['mcp_search_tools'] = 220
    scores['mcp_resource'] = 210
    scores['mcp_prompt'] = 200
  }
  if (/\b(kling|seedance|soul cinema|wan video|studio generate|cinematic video|ai video generation|video studio|media studio|generate cinematic)\b/i.test(text)) {
    scores['studio_media_generate'] = 240
  }

  // Dynamic boost for any discovered MCP tool matching user intent words
  for (const s of schemas) {
    const fnName = s.function?.name || s.name || ''
    if (fnName.startsWith('mcp__')) {
      const parts = fnName.split('__')
      const srvName = parts[1] || ''
      const toolSubName = parts.slice(2).join(' ')
      if (srvName && text.includes(srvName.toLowerCase())) {
        scores[fnName] = Math.max(scores[fnName] || 0, 210)
      }
      if (toolSubName && text.includes(toolSubName.toLowerCase())) {
        scores[fnName] = Math.max(scores[fnName] || 0, 230)
      }
    }
  }

  const ranked = [...schemas].sort((a, b) => {
    const nameA = a.function?.name || a.name || ''
    const nameB = b.function?.name || b.name || ''
    const scoreA = scores[nameA] || 0
    const scoreB = scores[nameB] || 0
    return scoreB - scoreA
  })
  return (Number.isFinite(limit) && limit > 0) ? ranked.slice(0, limit) : ranked
}

/** Execute a tool by name */
export async function executeTool(name, args, { signal, ctx } = {}) {
  return withWorkspaceContext(ctx, async () => {
    let cleanName = String(name || '').split('<')[0].split(' ')[0].split(':')[0].trim().toLowerCase()
    // A REGISTERED tool always wins over an alias of the same name. `watch` was
    // both a real tool and an alias for watch_folder: the model read watchTool's
    // description in the schema list, called `watch`, and silently reached a
    // different tool with different actions.
    if (!ALL_TOOLS[cleanName] && TOOL_ALIASES[cleanName]) {
      cleanName = TOOL_ALIASES[cleanName]
    }
    if (isMcpTool(cleanName)) return callMcpTool(cleanName, args)
    const tool = ALL_TOOLS[cleanName]
    if (!tool) return { success: false, error: `Unknown tool: ${name}` }
    if (signal?.aborted) return { success: false, error: 'Stopped' }

    // Gate anything that writes to or runs on the user's machine. Reads pass
    // straight through. A refusal is a normal tool result so the model adapts
    // instead of the turn hanging.
    const repairedArgs = repairToolArguments(cleanName, args, tool.schema)
    const safetyCheck = validateToolSafety(cleanName, repairedArgs || {})
    if (!safetyCheck.safe) {
      return { success: false, error: safetyCheck.reason || 'Operation blocked by tool guardrails', blocked: true, denied: true }
    }

    const verdict = await requestPermission(cleanName, repairedArgs || {}, getWorkspaceCtx(ctx))
    if (!verdict.allowed) return { success: false, error: verdict.reason, denied: true }

    // Makes Stop reach the tool's own network calls (see tools/http.js).
    pushAmbientSignal(signal)
    try {
      return await tool.execute(repairedArgs, { signal, ctx })
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return { success: false, error: 'Stopped' }
      // A thrown string, or an object with no `message`, left error undefined —
      // which the error log then printed as "<tool>: Unknown error".
      return { success: false, error: err?.message || String(err) || `${cleanName} failed` }
    } finally {
      popAmbientSignal(signal)
    }
  })
}

/** List all tool names */
export function getToolNames() {
  return Object.keys(ALL_TOOLS)
}

export {
  ALL_TOOLS,
  artemisAndroidTool,
  executeArtemisAndroid,
  askUserTool,
  setUserQuestionHandler,
  localInferenceTool,
  dspyOptimizerTool,
  haystackRagTool,
  aiderCopilotTool,
  langsmithObservabilityTool,
  langGraphFlowTool,
  appSettingsTool,
  studioMediaGenTool,
}

export default ALL_TOOLS
