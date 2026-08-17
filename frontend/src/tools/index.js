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
  isDesktop, fsAddFolderTool, fsListTool, fsReadTool, fsWriteTool, fsEditTool, fsSearchTool,
  fsDeleteTool, fsMkdirTool, fsMoveTool, fsBatchReadTool, fsFileTreeTool,
  fsUndoTool, getWorkspaceCtx,
} from './localFs'
import { requestPermission } from '../permissions'
import { terminalRunTool } from './terminalRun'
import { mcpResourceTool, mcpPromptTool } from './mcpResources'
import { computerControlTool } from './computerControl'
import { clipboardAccessTool } from './clipboardAccess'
import { watchFolderTool } from './watchFolder'
import { systemStateTool } from './systemState'
import { processManagerTool } from './processManager'
import { fileDialogTool } from './fileDialog'
import { todoTool } from './todo'
import { financeTool } from './finance'
import { marketDataTool } from './marketData'
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
import { subAgentRunnerTool } from './subAgentRunner'
import { documentGeneratorTool } from './docGenerator'
import { crewOrchestratorTool } from './crewRunner'
import {
  drugInfoTool, cryptoPriceTool, chemicalInfoTool, worldBankTool,
  nobelPrizeTool, issLocationTool, tvShowTool, triviaQuizTool, postalLookupTool,
  nasaApodTool, itunesSearchTool, artInstituteTool, solarTimesTool,
  dnsLookupTool, activitySuggestTool, jokesTool, animalFactsTool,
  mealRecipeTool, cocktailRecipeTool, federalRegisterTool, waybackArchiveTool,
  userProfileGenTool, nasaAsteroidsTool, bibleScriptureTool, wikimediaFeedTool,
} from './openApis'
import {
  executeScreenInspect,
  executeDesktopAction,
  executeBrowserAutopilot,
} from './desktopCompanion'

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

export const browserAutopilotTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_autopilot',
      description: 'Autonomous browser worker that navigates to a URL, extracts structured content, evaluates web elements, or monitors page updates (like Strawberry Browser).',
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
  // Social Media & Career Intelligence Tools
  social_search: socialSearchTool,
  job_search: jobSearchTool,
  social_post_generator: socialPostTool,
  // Desktop-only local filesystem tools (Tauri shell). Present in every build;
  // in the browser they return an honest "desktop only" note.
  fs_add_folder: fsAddFolderTool,
  fs_list: fsListTool,
  fs_read: fsReadTool,
  fs_write: fsWriteTool,
  fs_edit: fsEditTool,
  fs_search: fsSearchTool,
  fs_delete: fsDeleteTool,
  fs_mkdir: fsMkdirTool,
  fs_move: fsMoveTool,
  fs_batch_read: fsBatchReadTool,
  fs_file_tree: fsFileTreeTool,
  fs_undo: fsUndoTool,
  terminal_run: terminalRunTool,
  todo: todoTool,
  finance_analytics: financeTool,
  market_data: marketDataTool,
  // MCP: use resources & prompt templates published by connected servers.
  mcp_resource: mcpResourceTool,
  mcp_prompt: mcpPromptTool,
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
  // Sub-Agent Runner (isolated processes + Python RPC)
  sub_agent_runner: subAgentRunnerTool,
  // Multi-agent delegation: hand focused sub-tasks to specialist sub-agents.
  spawn_agents: spawnAgentsTool,
  // OS-Level Screen Monitoring, Cross-App Computer Use & Browser Autopilot
  screen_inspect: screenInspectTool,
  desktop_action: desktopActionTool,
  computer_control: computerControlTool,
  browser_autopilot: browserAutopilotTool,
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
  meal_recipe: mealRecipeTool,
  cocktail_recipe: cocktailRecipeTool,
  federal_register: federalRegisterTool,
  wayback_archive: waybackArchiveTool,
  user_profile_gen: userProfileGenTool,
  nasa_asteroids: nasaAsteroidsTool,
  bible_scripture: bibleScriptureTool,
  wikimedia_feed: wikimediaFeedTool,
  document_generator: documentGeneratorTool,
  crew_orchestrator: crewOrchestratorTool,
}

/** Common LLM hallucinated tool names mapped to their canonical Yogatik tool */
const TOOL_ALIASES = {
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
  // Desktop-native capability aliases
  clipboard: 'clipboard_access',
  read_clipboard: 'clipboard_access',
  get_clipboard: 'clipboard_access',
  clipboard_history: 'clipboard_access',
  paste: 'clipboard_access',
  watch: 'watch_folder',
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
  search: 'web_search',
  google: 'web_search',
  bing: 'web_search',
  duckduckgo: 'web_search',
  websearch: 'web_search',
  internet_search: 'web_search',
  online_search: 'web_search',
  generate_image: 'image_generate',
  create_image: 'image_generate',
  text_to_image: 'image_generate',
  dalle: 'image_generate',
  imagegen: 'image_generate',
  generate_sticker: 'sticker_generate',
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
  wayback: 'wayback_archive',
  wayback_machine: 'wayback_archive',
  archive_url: 'wayback_archive',
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

/** Rank and prioritize tools based on the active user query context */
export function prioritizeToolSchemas(schemas = [], userMessage = '') {
  if (!Array.isArray(schemas) || schemas.length === 0) return []
  if (!userMessage || typeof userMessage !== 'string') return schemas

  const text = userMessage.toLowerCase()

  const scores = {
    web_search: 25,
    calculator: 20,
    doc_export: 20,
    code_execute: 15,
    timer: 15,
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
  if (/\b(ppt|pptx|powerpoint|slides?|presentation|document|doc|docx|csv|pdf|export|download)\b/i.test(text)) {
    scores['doc_export'] = 200
    scores['doc_enhance'] = 180
    scores['pdf_extract'] = 120
    scores['data_convert'] = 100
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
    scores['code_format'] = 150
    scores['diff'] = 140
    scores['terminal_run'] = 120
  }
  if (/\b(image|picture|photo|draw|illustration|sticker|logo|banner|qr|chart|diagram|render)\b/i.test(text)) {
    scores['image_generate'] = 200
    scores['sticker_generate'] = 180
    scores['diagram_render'] = 160
    scores['chart'] = 150
    scores['qr_generate'] = 140
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
    scores['wayback_archive'] = 200
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
  if (/\b(document|word doc|docx|presentation|slide deck|slides|invoice|billing receipt|certificate|award cert|spreadsheet|doc generator)\b/i.test(text)) {
    scores['document_generator'] = 200
  }
  if (/\b(crew|multi agent|agent pipeline|hierarchical agent|reflexion|crewai|autogen|collaborative agents)\b/i.test(text)) {
    scores['crew_orchestrator'] = 200
  }

  return [...schemas].sort((a, b) => {
    const nameA = a.function?.name || a.name || ''
    const nameB = b.function?.name || b.name || ''
    const scoreA = scores[nameA] || 0
    const scoreB = scores[nameB] || 0
    return scoreB - scoreA
  })
}

/** Execute a tool by name */
export async function executeTool(name, args, { signal } = {}) {
  let cleanName = String(name || '').split('<')[0].split(' ')[0].split(':')[0].trim().toLowerCase()
  if (TOOL_ALIASES[cleanName]) {
    cleanName = TOOL_ALIASES[cleanName]
  }
  if (isMcpTool(cleanName)) return callMcpTool(cleanName, args)
  const tool = ALL_TOOLS[cleanName]
  if (!tool) return { success: false, error: `Unknown tool: ${name}` }
  if (signal?.aborted) return { success: false, error: 'Stopped' }

  // Gate anything that writes to or runs on the user's machine. Reads pass
  // straight through. A refusal is a normal tool result so the model adapts
  // instead of the turn hanging.
  const verdict = await requestPermission(cleanName, args || {}, getWorkspaceCtx())
  if (!verdict.allowed) return { success: false, error: verdict.reason, denied: true }

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
