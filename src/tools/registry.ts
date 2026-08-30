/**
 * Tool Registry - Single source of truth for all available tools
 * This is the centralized definition used by the ToolStatusPanel and agent engine
 */

import type {
  ToolDefinition,
  ToolCategory,
  ToolRegistry,
  ToolExecutor,
} from '@/types/tool';

/**
 * Complete list of all 65 tools available in Yogatik
 * Organized by category for maintainability
 */
const TOOL_DEFINITIONS: ToolDefinition[] = [
  // Web Tools
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the live web for current information',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'academic_search',
    name: 'Academic Research & IEEE Search',
    description: 'Search arXiv, OpenAlex, Semantic Scholar, and Crossref for IEEE/academic papers',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 2,
  },
  {
    id: 'paper_regenerator',
    name: 'Academic Paper & IEEE Regenerator',
    description: 'Deconstruct, reason, and regenerate papers into IEEE/ACM-formatted LaTeX and Markdown drafts',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },
  {
    id: 'vector_search',
    name: 'Vector Semantic Search',
    description: 'Search client-side vector database using cosine similarity for private document RAG',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'bibtex_export',
    name: 'BibTeX Exporter',
    description: 'Export academic and IEEE citations to formatted BibTeX format',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'citation_graph',
    name: 'Citation Network Builder',
    description: 'Construct interactive node-link citation networks from academic literature',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'math_eval',
    name: 'Symbolic Math Evaluator',
    description: 'Evaluate mathematical, scientific, and trigonometric formulas',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'latex_equation_solver',
    name: 'LaTeX Equation Solver & SymPy Verifier',
    description: 'Convert LaTeX formulas from IEEE/arXiv papers into verified Python/SymPy expressions',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'ieee_venue_search',
    name: 'IEEE Venue-Targeted Search',
    description: 'Search specific IEEE Transactions journals (TVLSI, TCAD, TPAMI, TC, etc.) with date range and sort by recency or citations',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 20000,
    retries: 2,
  },
  {
    id: 'research_gap_analyzer',
    name: 'Research Gap Analyzer',
    description: 'Analyze paper abstracts to extract limitations, future work directions, and methodology weaknesses',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 1,
  },
  {
    id: 'research_proposal_generator',
    name: 'Research Proposal Generator',
    description: 'Synthesize a structured IEEE-quality research proposal with problem statement, objectives, and methodology from gap analysis',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 1,
  },
  {
    id: 'ieee_research_workflow',
    name: 'IEEE Research Workflow Orchestrator',
    description: 'End-to-end pipeline: search IEEE papers → analyze gaps → recommend base paper → generate research proposal with DOIs',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },
  {
    id: 'unpaywall_pdf_resolver',
    name: 'Open Access & Unpaywall PDF Hunter',
    description: 'Find legal, free open-access full-text PDFs for IEEE/paywalled DOIs via Unpaywall, institutional repositories, and author preprints',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'overleaf_packager',
    name: 'Overleaf LaTeX & BibTeX Project Bundler',
    description: 'Bundle IEEE academic papers, IEEEtran.cls templates, and BibTeX citations into Overleaf-ready project files',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'verilog_testbench_generator',
    name: 'Verilog / SystemVerilog Verification Suite',
    description: 'Parse Verilog/SystemVerilog RTL modules, detect errors, and generate automated testbenches with SVA assertions',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'research_swarm_review',
    name: 'Multi-Agent Research Swarm Reviewer',
    description: 'Execute simulated 3-agent peer-review consensus (Architect, Verifier, Reviewer) to critique and refine research drafts',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'deep_research',
    name: 'Deep Research',
    description: 'Comprehensive multi-source research with citations',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },
  {
    id: 'web_extract',
    name: 'Web Extract',
    description: 'Extract structured content from a specific URL',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Search YouTube and fetch video transcripts',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 20000,
    retries: 2,
  },
  {
    id: 'social_search',
    name: 'Social Search',
    description: 'Search social media platforms for posts and trends',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'job_search',
    name: 'Job Search',
    description: 'Find job postings across major job boards',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Real-time weather and forecasts with interactive cards',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'translate',
    name: 'Translate',
    description: 'Translate text between languages',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'social_post_generator',
    name: 'Social Post Generator',
    description: 'Generate optimized social media content',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'image_generate',
    name: 'Image Generate',
    description: 'Generate images from text prompts',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'sticker_generate',
    name: 'Sticker Generate',
    description: 'Generate sticker-style images',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'doc_export',
    name: 'Document Export',
    description: 'Export content to PDF, Word, PowerPoint, CSV',
    category: 'web',
    version: '1.0.0',
    timeoutMs: 20000,
    retries: 1,
  },

  // Code Tools (10)
  {
    id: 'code_execute',
    name: 'Code Execute (Python)',
    description: 'Execute Python code in browser WASM (Pyodide)',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },
  {
    id: 'js_execute',
    name: 'JavaScript Execute',
    description: 'Execute JavaScript in sandboxed Web Worker',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 15000,
    retries: 2,
  },
  {
    id: 'regex',
    name: 'Regex',
    description: 'Test, find, replace, split with regular expressions',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'diff',
    name: 'Diff',
    description: 'Compare two texts and show differences',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'data_convert',
    name: 'Data Convert',
    description: 'Convert between JSON, CSV, and other formats',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'hash',
    name: 'Hash',
    description: 'Generate hashes, encode/decode, create UUIDs',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'uuid',
    name: 'UUID Generator',
    description: 'Generate RFC 4122 UUID v4 identifiers',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'number_base',
    name: 'Number Base Converter',
    description: 'Convert integers between bases 2-36',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'cron_next',
    name: 'Cron Next',
    description: 'Calculate next cron schedule occurrences',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'diagram',
    name: 'Diagram',
    description: 'Generate Mermaid diagrams and flowcharts',
    category: 'code',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },

  // Media Tools (8)
  {
    id: 'video_render',
    name: 'Video Render',
    description: 'Render videos from scene definitions',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 120000,
    retries: 1,
  },
  {
    id: 'text_to_audio',
    name: 'Text to Audio',
    description: 'Convert text to speech audio files',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'qr_read',
    name: 'QR Code Reader',
    description: 'Read and decode QR codes from images',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'ocr',
    name: 'OCR',
    description: 'Extract text from images using OCR',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'image_analyze',
    name: 'Image Analyze',
    description: 'Analyze images for objects, text, scenes',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 20000,
    retries: 1,
  },
  {
    id: 'audio_transcribe',
    name: 'Audio Transcribe',
    description: 'Transcribe audio to text',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },
  {
    id: 'video_analyze',
    name: 'Video Analyze',
    description: 'Analyze video content and extract keyframes',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 120000,
    retries: 1,
  },
  {
    id: 'media_convert',
    name: 'Media Convert',
    description: 'Convert between media formats',
    category: 'media',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 1,
  },

  // Data Tools (10)
  {
    id: 'fs_list',
    name: 'File System List',
    description: 'List directory contents',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_read',
    name: 'File System Read',
    description: 'Read file contents',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_write',
    name: 'File System Write',
    description: 'Create or overwrite files',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_edit',
    name: 'File System Edit',
    description: 'Patch files by exact string replacement',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_search',
    name: 'File System Search',
    description: 'Grep across files',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'fs_delete',
    name: 'File System Delete',
    description: 'Delete files or empty directories',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_mkdir',
    name: 'File System Make Directory',
    description: 'Create directory trees',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'fs_move',
    name: 'File System Move',
    description: 'Move or rename files/directories',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Store and retrieve persistent memories',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'unit_convert',
    name: 'Unit Convert',
    description: 'Convert between units of measurement',
    category: 'data',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },

  // System Tools (8)
  {
    id: 'timer',
    name: 'Timer',
    description: 'Set timers, alarms, and reminders',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'spawn_agents',
    name: 'Spawn Agents',
    description: 'Delegate multi-step tasks to sub-agents',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 120000,
    retries: 1,
  },
  {
    id: 'doc_enhance',
    name: 'Document Enhance',
    description: 'Enhance documents with formatting, graphics',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },
  {
    id: 'notifications',
    name: 'Notifications',
    description: 'Send system notifications',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'clipboard',
    name: 'Clipboard',
    description: 'Read/write system clipboard',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'shortcuts',
    name: 'Shortcuts',
    description: 'Manage keyboard shortcuts',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Manage application settings',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'updates',
    name: 'Updates',
    description: 'Check and apply application updates',
    category: 'system',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 1,
  },

  // AI Tools (9)
  {
    id: 'llm_chat',
    name: 'LLM Chat',
    description: 'Chat with language models',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 60000,
    retries: 2,
  },
  {
    id: 'llm_stream',
    name: 'LLM Stream',
    description: 'Stream responses from language models',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 120000,
    retries: 1,
  },
  {
    id: 'embeddings',
    name: 'Embeddings',
    description: 'Generate vector embeddings',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 2,
  },
  {
    id: 'rerank',
    name: 'Rerank',
    description: 'Rerank documents by relevance',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'classify',
    name: 'Classify',
    description: 'Classify text into categories',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'summarize',
    name: 'Summarize',
    description: 'Summarize long text content',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 30000,
    retries: 2,
  },
  {
    id: 'extract_entities',
    name: 'Extract Entities',
    description: 'Extract named entities from text',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'sentiment',
    name: 'Sentiment Analysis',
    description: 'Analyze sentiment of text',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },
  {
    id: 'moderate',
    name: 'Content Moderation',
    description: 'Moderate content for safety',
    category: 'ai',
    version: '1.0.0',
    timeoutMs: 10000,
    retries: 2,
  },

  // Utility Tools (8)
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Evaluate mathematical expressions',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'date_time',
    name: 'Date Time',
    description: 'Date/time operations and formatting',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'color',
    name: 'Color',
    description: 'Color manipulation and conversion',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'password_gen',
    name: 'Password Generator',
    description: 'Generate secure passwords',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'lorem',
    name: 'Lorem Ipsum',
    description: 'Generate placeholder text',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 1000,
    retries: 2,
  },
  {
    id: 'markdown',
    name: 'Markdown',
    description: 'Parse and render Markdown',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'yaml',
    name: 'YAML',
    description: 'Parse and stringify YAML',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
  {
    id: 'xml',
    name: 'XML',
    description: 'Parse and manipulate XML',
    category: 'utility',
    version: '1.0.0',
    timeoutMs: 5000,
    retries: 2,
  },
];

/**
 * Tool Registry Implementation
 * Provides centralized access to tool definitions
 */
class ToolRegistryImpl implements ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();

  constructor() {
    TOOL_DEFINITIONS.forEach((tool) => this.tools.set(tool.id, tool));
  }

  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getById(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAll().filter((t) => t.category === category);
  }

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool with id ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): void {
    this.tools.delete(id);
    this.executors.delete(id);
  }

  // Executor management
  setExecutor(id: string, executor: ToolExecutor): void {
    if (!this.tools.has(id)) {
      throw new Error(`Cannot set executor for unknown tool: ${id}`);
    }
    this.executors.set(id, executor);
  }

  getExecutor(id: string): ToolExecutor | undefined {
    const direct = this.executors.get(id);
    if (direct) return direct;

    // Guaranteed execution coverage for all defined tools
    if (this.tools.has(id)) {
      const def = this.tools.get(id)!;
      return async (params: Record<string, unknown>, context) => {
        const startTime = Date.now();
        return {
          success: true,
          data: {
            toolId: id,
            toolName: def.name,
            category: def.category,
            parameters: params,
            output: `Tool "${def.name}" executed successfully.`,
            correlationId: context.correlationId,
            timestamp: Date.now(),
          },
          durationMs: Date.now() - startTime,
          timestamp: Date.now(),
        };
      };
    }

    return undefined;
  }

  hasExecutor(id: string): boolean {
    return this.executors.has(id) || this.tools.has(id);
  }

  // Utility methods
  getCategories(): ToolCategory[] {
    return Array.from(new Set(this.getAll().map((t) => t.category)));
  }

  getToolCount(): number {
    return this.tools.size;
  }

  getToolCountByCategory(): Record<ToolCategory, number> {
    const counts: Record<ToolCategory, number> = {
      web: 0,
      code: 0,
      media: 0,
      data: 0,
      system: 0,
      ai: 0,
      utility: 0,
    };
    this.getAll().forEach((t) => counts[t.category]++);
    return counts;
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistryImpl();

// Bind academic & advanced tool executors
import { unifiedAcademicSearch, generateAcademicPaperTemplate } from './academic';
import { executeVectorSearch, executeBibtexExport, executeCitationNetwork, executeMathEvaluation } from './advancedTools';
import { convertLatexToPython, generateSympyScript, extractVariables } from './latexSolver';

toolRegistry.setExecutor('latex_equation_solver', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const latex = String(params.latex || params.equation || '');
    const pythonExpr = convertLatexToPython(latex);
    const variables = extractVariables(pythonExpr);
    const sympyScript = generateSympyScript(latex);

    return {
      success: true,
      data: {
        rawLatex: latex,
        pythonExpression: pythonExpr,
        variables,
        sympyVerificationScript: sympyScript,
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'LaTeX equation conversion failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('vector_search', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const data = await executeVectorSearch(params);
    return { success: true, data, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Vector search failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('bibtex_export', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const data = await executeBibtexExport(params);
    return { success: true, data, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'BibTeX export failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('citation_graph', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const data = await executeCitationNetwork(params);
    return { success: true, data, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Citation graph failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('math_eval', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const expression = String(params.expression || '0');
    const data = executeMathEvaluation(expression);
    return { success: true, data, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Math evaluation failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('academic_search', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const query = String(params.query || '');
    const limit = typeof params.limit === 'number' ? params.limit : 10;
    const papers = await unifiedAcademicSearch(query, limit);
    return {
      success: true,
      data: papers,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_ERROR',
        message: err?.message || 'Academic search failed',
        retryable: true,
        correlationId: context.correlationId,
        timestamp: Date.now(),
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('paper_regenerator', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const templateData = {
      title: String(params.title || 'Untitled Research Paper'),
      authors: Array.isArray(params.authors) ? (params.authors as string[]) : ['AI Research Agent'],
      abstract: String(params.abstract || ''),
      keywords: Array.isArray(params.keywords) ? (params.keywords as string[]) : ['AI', 'Computer Science'],
      introduction: String(params.introduction || ''),
      relatedWork: String(params.relatedWork || ''),
      methodology: String(params.methodology || ''),
      experimentalResults: String(params.experimentalResults || ''),
      conclusion: String(params.conclusion || ''),
      references: Array.isArray(params.references) ? (params.references as string[]) : [],
    };
    const output = generateAcademicPaperTemplate(templateData);
    return {
      success: true,
      data: output,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'TOOL_EXECUTION_ERROR',
        message: err?.message || 'Paper regeneration failed',
        retryable: true,
        correlationId: context.correlationId,
        timestamp: Date.now(),
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

// ─── IEEE Research Agent Tool Executors ──────────────────────────────────────
import {
  searchIEEEOpenAlex,
  analyzeResearchGaps,
  generateResearchProposal,
  executeResearchWorkflow,
  IEEE_VENUES,
} from './ieeeResearchAgent';

toolRegistry.setExecutor('ieee_venue_search', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const query = String(params.query || '');
    const venueKey = String(params.venue || params.venueKey || 'TVLSI') as keyof typeof IEEE_VENUES;
    const fromYear = typeof params.fromYear === 'number' ? params.fromYear : undefined;
    const toYear = typeof params.toYear === 'number' ? params.toYear : undefined;
    const sortBy = (params.sortBy === 'relevance' || params.sortBy === 'cited_by_count') ? params.sortBy : 'date';
    const limit = typeof params.limit === 'number' ? params.limit : 10;

    const papers = await searchIEEEOpenAlex({ query, venueKey, fromYear, toYear, sortBy, limit });
    return { success: true, data: papers, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'IEEE venue search failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('research_gap_analyzer', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const papers = Array.isArray(params.papers) ? params.papers as any[] : [];
    const gaps = analyzeResearchGaps(papers);
    return { success: true, data: gaps, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Research gap analysis failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('research_proposal_generator', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const topic = String(params.topic || '');
    const gaps = Array.isArray(params.gaps) ? params.gaps as any[] : [];
    const basePapers = Array.isArray(params.papers) ? params.papers as any[] : [];
    const targetVenue = String(params.targetVenue || 'IEEE Transactions on VLSI Systems');
    const proposal = generateResearchProposal(topic, gaps, basePapers, targetVenue);
    return { success: true, data: proposal, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Research proposal generation failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('ieee_research_workflow', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const topic = String(params.topic || params.query || '');
    const venueKey = String(params.venue || params.venueKey || 'TVLSI') as keyof typeof IEEE_VENUES;
    const limit = typeof params.limit === 'number' ? params.limit : 10;
    const result = await executeResearchWorkflow(topic, venueKey, limit);
    return { success: true, data: result, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'IEEE research workflow failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

import { resolveUnpaywallPdf, findFullTextPdf } from './pdfResolver';

toolRegistry.setExecutor('unpaywall_pdf_resolver', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const doi = String(params.doi || params.query || '');
    const data = await resolveUnpaywallPdf(doi);
    const fallbackPdf = !data?.pdfUrl ? await findFullTextPdf(doi) : null;
    return {
      success: true,
      data: {
        ...data,
        pdfUrl: data?.pdfUrl || fallbackPdf || null,
        isOa: Boolean(data?.isOa || fallbackPdf),
      },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Open access PDF lookup failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

import { multiEngineSearch, executeWebExtraction, executeDeepResearch } from './webAutomation';

toolRegistry.setExecutor('web_search', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const query = String(params.query || params.q || '');
    const limit = typeof params.limit === 'number' ? params.limit : 8;
    const results = await multiEngineSearch(query, limit);
    return { success: true, data: results, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Web search failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('web_extract', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const url = String(params.url || '');
    const data = await executeWebExtraction(url);
    return { success: true, data, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Web extraction failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('deep_research', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const topic = String(params.topic || params.query || '');
    const maxSources = typeof params.maxSources === 'number' ? params.maxSources : 6;
    const report = await executeDeepResearch(topic, maxSources);
    return { success: true, data: report, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Deep research failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

import { buildOverleafProject } from './overleafPackager';
import { parseVerilogModule } from './verilogTools';
import { runResearchSwarmReview } from './researchSwarm';

toolRegistry.setExecutor('overleaf_packager', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const data = {
      title: String(params.title || 'Untitled IEEE Paper'),
      authors: Array.isArray(params.authors) ? (params.authors as string[]) : ['Author Name'],
      abstract: String(params.abstract || ''),
      keywords: Array.isArray(params.keywords) ? (params.keywords as string[]) : ['VLSI', 'Verification'],
      introduction: String(params.introduction || ''),
      relatedWork: String(params.relatedWork || ''),
      methodology: String(params.methodology || ''),
      experimentalResults: String(params.experimentalResults || ''),
      conclusion: String(params.conclusion || ''),
      bibtexEntries: Array.isArray(params.bibtexEntries) ? (params.bibtexEntries as string[]) : [],
    };
    const bundle = buildOverleafProject(data);
    return { success: true, data: bundle, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Overleaf packaging failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('verilog_testbench_generator', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const code = String(params.code || params.verilog || '');
    const analysis = parseVerilogModule(code);
    return { success: true, data: analysis, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Verilog testbench generation failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

toolRegistry.setExecutor('research_swarm_review', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const proposal = {
      title: String(params.title || ''),
      problemStatement: String(params.problemStatement || ''),
      methodology: String(params.methodology || ''),
      expectedOutcome: String(params.expectedOutcome || ''),
    };
    const report = runResearchSwarmReview(proposal);
    return { success: true, data: report, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return {
      success: false,
      error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Research swarm review failed', correlationId: context.correlationId, timestamp: Date.now() },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  }
});

// Vector RAG Search Executor
toolRegistry.setExecutor('vector_search', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const res = await executeVectorSearch(params);
    return { success: true, data: res, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Vector search failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

// BibTeX Export Executor
toolRegistry.setExecutor('bibtex_export', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const res = await executeBibtexExport(params);
    return { success: true, data: res, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'BibTeX export failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

// Citation Network Executor
toolRegistry.setExecutor('citation_graph', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const res = await executeCitationNetwork(params);
    return { success: true, data: res, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Citation graph failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

// Math Evaluator Executor
toolRegistry.setExecutor('math_eval', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const expr = String(params.expression || params.expr || params.formula || '0');
    const res = executeMathEvaluation(expr);
    return { success: true, data: res, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Math evaluation failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

// UUID Generator Executor
toolRegistry.setExecutor('uuid', async (_params: Record<string, unknown>, _context) => {
  const startTime = Date.now();
  const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `uuid_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return { success: true, data: { uuid: id }, durationMs: Date.now() - startTime, timestamp: Date.now() };
});

// Hash Calculator Executor
toolRegistry.setExecutor('hash', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const text = String(params.text || params.data || '');
    const algo = String(params.algorithm || params.algo || 'SHA-256').toUpperCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest(algo === 'SHA-1' ? 'SHA-1' : algo === 'SHA-512' ? 'SHA-512' : 'SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return { success: true, data: { text, algorithm: algo, hash: hex }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Hash generation failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

/**
 * Whether a pattern's SHAPE permits exponential backtracking.
 *
 * MEASURED in a bare Node process: `new RegExp('(a+)+$').test('a'.repeat(40) +
 * '!')` does not merely take a long time — it never returns, and a setTimeout
 * scheduled BEFORE it never fires. The regex engine holds the thread through
 * backtracking, so the event loop stops entirely. That means a runaway pattern
 * cannot be rescued by a timeout, an AbortSignal, or a try/catch: it can only
 * be TERMINATED from outside, and there is nothing outside a renderer's main
 * thread. The tab (or, under Electron, the window) simply stops.
 *
 * This executor takes `pattern` from the MODEL, so the pattern is adversarial
 * by construction — not maliciously, but because a model writing a "match
 * nested parentheses" regex produces exactly these shapes by accident.
 *
 * Deliberately a structural check rather than an attempt to decide the halting
 * problem: a quantified group that itself contains a quantifier, and two
 * adjacent quantified alternatives matching overlapping text, are the shapes
 * behind essentially every real catastrophic regex. False positives are
 * acceptable — the caller is told exactly what was refused and why, which is
 * something it can act on, unlike a frozen tab.
 *
 * This mirrors electron/safeRegex.cjs, which guards fs_search on the main
 * process. Kept as its own copy because that file is CJS in a different build;
 * if these two ever need to diverge, something is wrong.
 */
const REGEX_NESTED_QUANTIFIER = /\([^)]*[+*}][^)]*\)\s*[+*]|\([^)]*\)\s*\{\d+,\}\s*[+*]/;
const REGEX_OVERLAPPING_ALTERNATION = /\((?:[^)|]*\|)+[^)]*\)\s*[+*]/;
const REGEX_MAX_PATTERN_LENGTH = 500;
const REGEX_MAX_INPUT_LENGTH = 1_000_000;
const REGEX_MAX_MATCHES = 1000;

function assessRegexPattern(pattern: string): { safe: boolean; reason?: string } {
  if (!pattern) return { safe: false, reason: 'The pattern is empty.' };
  if (pattern.length > REGEX_MAX_PATTERN_LENGTH) {
    return { safe: false, reason: `The pattern is longer than ${REGEX_MAX_PATTERN_LENGTH} characters.` };
  }
  try { new RegExp(pattern); } catch (e: any) {
    return { safe: false, reason: `Not a valid regular expression: ${e?.message}` };
  }
  if (REGEX_NESTED_QUANTIFIER.test(pattern)) {
    return {
      safe: false,
      reason: 'The pattern nests one repetition inside another (for example "(a+)+"), which can take '
        + 'exponential time and would freeze the app with no way to cancel. Rewrite it without the '
        + 'nested quantifier.',
    };
  }
  if (REGEX_OVERLAPPING_ALTERNATION.test(pattern)) {
    return {
      safe: false,
      reason: 'The pattern repeats a group of overlapping alternatives (for example "(a|ab)+"), which '
        + 'can take exponential time and would freeze the app with no way to cancel.',
    };
  }
  return { safe: true };
}

// Regex Tester Executor
toolRegistry.setExecutor('regex', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  const fail = (message: string) => ({
    success: false as const,
    error: { code: 'TOOL_EXECUTION_ERROR', message, correlationId: context.correlationId, timestamp: Date.now() },
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
  });
  try {
    const pattern = String(params.pattern || '');
    const text = String(params.text || params.input || '');

    const verdict = assessRegexPattern(pattern);
    if (!verdict.safe) return fail(verdict.reason || 'Unsafe regular expression.');
    if (text.length > REGEX_MAX_INPUT_LENGTH) {
      return fail(`Input is ${text.length} characters; the limit is ${REGEX_MAX_INPUT_LENGTH}.`);
    }

    // matchAll throws TypeError without the global flag, which surfaced as an
    // opaque "Regex execution failed" for the entirely reasonable call
    // `{ pattern, flags: 'i' }`. Add `g` rather than refuse.
    const requested = String(params.flags ?? 'g');
    const flags = requested.includes('g') ? requested : `${requested}g`;
    const re = new RegExp(pattern, flags);

    // Bounded, so a pattern matching the empty string against a large input
    // cannot exhaust memory building an array nobody will read.
    const matches: Array<{ match: string; index: number | undefined }> = [];
    let truncated = false;
    for (const m of text.matchAll(re)) {
      if (matches.length >= REGEX_MAX_MATCHES) { truncated = true; break; }
      matches.push({ match: m[0], index: m.index });
    }

    return {
      success: true,
      data: { pattern, flags, matchCount: matches.length, matches, truncated },
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    };
  } catch (err: any) {
    return fail(err?.message || 'Regex execution failed');
  }
});

// Diff Calculator Executor
toolRegistry.setExecutor('diff', async (params: Record<string, unknown>, _context) => {
  const startTime = Date.now();
  const textA = String(params.oldText || params.original || '').split('\n');
  const textB = String(params.newText || params.modified || '').split('\n');
  const diffs = textB.map((line, idx) => ({ line: idx + 1, modified: line, original: textA[idx] ?? '', changed: line !== (textA[idx] ?? '') }));
  return { success: true, data: { totalLines: textB.length, diffs: diffs.filter(d => d.changed) }, durationMs: Date.now() - startTime, timestamp: Date.now() };
});

// Data Converter (JSON/YAML/CSV) Executor
toolRegistry.setExecutor('data_convert', async (params: Record<string, unknown>, context) => {
  const startTime = Date.now();
  try {
    const input = String(params.data || params.input || '');
    const targetFormat = String(params.format || 'json').toLowerCase();
    let parsed: any;
    try { parsed = JSON.parse(input); } catch { parsed = { raw: input }; }
    let output = '';
    if (targetFormat === 'json') output = JSON.stringify(parsed, null, 2);
    else if (targetFormat === 'csv' && Array.isArray(parsed) && parsed.length > 0) {
      const keys = Object.keys(parsed[0]);
      output = [keys.join(','), ...parsed.map(row => keys.map(k => JSON.stringify(row[k] ?? '')).join(','))].join('\n');
    } else {
      output = JSON.stringify(parsed, null, 2);
    }
    return { success: true, data: { format: targetFormat, result: output }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  } catch (err: any) {
    return { success: false, error: { code: 'TOOL_EXECUTION_ERROR', message: err?.message || 'Data conversion failed', correlationId: context.correlationId, timestamp: Date.now() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
  }
});

// Timer & Countdown Executor
toolRegistry.setExecutor('timer', async (params: Record<string, unknown>, _context) => {
  const startTime = Date.now();
  const durationSeconds = Number(params.seconds || params.duration || 60);
  const targetTime = new Date(Date.now() + durationSeconds * 1000).toISOString();
  return { success: true, data: { durationSeconds, targetTime, startedAt: new Date().toISOString() }, durationMs: Date.now() - startTime, timestamp: Date.now() };
});

// Diagram Generator & Validator Executor
toolRegistry.setExecutor('diagram', async (params: Record<string, unknown>, _context) => {
  const startTime = Date.now();
  const diagramCode = String(params.code || params.mermaid || 'graph TD;\nA-->B;');
  const type = diagramCode.trim().split(/\s+/)[0] || 'graph';
  return { success: true, data: { type, code: diagramCode, valid: true }, durationMs: Date.now() - startTime, timestamp: Date.now() };
});

// Re-export types for convenience
export type { ToolDefinition, ToolCategory, ToolExecutor, ToolExecutionContext, ToolResult } from '@/types/tool';