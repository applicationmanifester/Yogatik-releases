/**
 * Type definitions for the agent system
 * Provides clear interfaces for all agent components
 */

/**
 * Agent execution state
 */
export class AgentState {
  constructor() {
    this.isComplete = false
    this.needsClarification = false
    this.messages = []
    this.toolHistory = []
    this.safetyViolations = []
    this.rounds = 0
    this.maxRounds = 20
    this.fullContent = ''
    this.roundContent = ''
    this.toolResults = {}
    this.sources = []
    this.seenCalls = new Map()
    this.hadFileAccessThisTurn = false
    this.executionTracker = null
    this.forcedFinal = false
    this.toolCallsToProcess = []
    this.toolMode = 'native'
    this.tools = null
    this.canaryToken = ''
    this.systemBase = ''
    this.traceRef = []
    this.reflexCache = new Map()
    this.reflexTrack = null
    this.lastTelemetry = null
    this.streamingReported = false
    this.promptedRepairTried = false
    this.toolFailureCounts = new Map()
    this.watchdogRegens = 0
    this.watchdogConts = 0
    this.watchdogEscalate = false
  }
}

/**
 * Tool execution result
 */
export class ToolResult {
  constructor(name, args, result, error = null) {
    this.name = name
    this.args = args
    this.result = result
    this.error = error
    this.timestamp = Date.now()
    this.success = !error
  }
}

/**
 * Memory block for context injection
 */
export class MemoryBlock {
  constructor(structured = '', flat = '') {
    this.structured = structured
    this.flat = flat
  }
}

/**
 * Execution tracker for relentless mode
 */
export class ExecutionTracker {
  constructor() {
    this.history = []
  }
}

/**
 * Query type detectors result
 */
export class QueryType {
  constructor() {
    this.isResearch = false
    this.isPresentation = false
    this.isDocument = false
    this.isSpreadsheet = false
    this.isPdf = false
    this.isMarkdown = false
    this.isSocial = false
  }
}

/**
 * Agent configuration options
 */
export class AgentConfig {
  constructor(options = {}) {
    this.provider = options.provider
    this.apiKey = options.apiKey
    this.model = options.model
    this.history = options.history || []
    this.userMessage = options.userMessage
    this.userImage = options.userImage || null
    this.toolsEnabled = options.toolsEnabled !== false
    this.webEnabled = options.webEnabled !== false
    this.disabledTools = options.disabledTools || []
    this.persona = options.persona || null
    this.temperature = options.temperature ?? 0.7
    this.maxTokens = options.maxTokens || null
    this.signal = options.signal || null
    this.conversationId = options.conversationId || null
    this.projectId = options.projectId || null
    this.modelCanSee = options.modelCanSee || false
    this.localVisionEnabled = options.localVisionEnabled !== false
    this.maxRounds = options.maxRounds || null
    this.onToken = options.onToken || (() => {})
    this.onStatus = options.onStatus || (() => {})
    this.onToolStart = options.onToolStart || (() => {})
    this.onToolResult = options.onToolResult || (() => {})
    this.onDone = options.onDone || (() => {})
    this.onError = options.onError || (() => {})
    this.onSources = options.onSources || (() => {})
    this.initialToolMode = options.initialToolMode || null
    this.onToolModeChange = options.onToolModeChange || (() => {})
    this.agentOverride = options.agentOverride || null
    this.onSafety = options.onSafety || (() => {})
    this.providerOptions = options.providerOptions || null
    this.responseFormat = options.responseFormat || null
    this.relentlessMode = options.relentlessMode || false
    this.resumeCheckpoint = options.resumeCheckpoint || null
    this.onCheckpoint = options.onCheckpoint || (() => {})
  }
}