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
    return this.executors.get(id);
  }

  hasExecutor(id: string): boolean {
    return this.executors.has(id);
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

// Bind academic tool executors
import { unifiedAcademicSearch, generateAcademicPaperTemplate } from './academic';

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

// Re-export types for convenience
export type { ToolDefinition, ToolCategory, ToolExecutor, ToolExecutionContext, ToolResult } from '@/types/tool';