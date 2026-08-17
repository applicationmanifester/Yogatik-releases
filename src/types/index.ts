/**
 * Core type definitions for Yogatik
 * Single source of truth for all domain types
 */

// ============================================================================
// Tool System Types
// ============================================================================

export type ToolStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'initializing' | 'unavailable';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  requiresNetwork: boolean;
  requiresWorker: boolean;
  timeoutMs: number;
  retryConfig: RetryConfig;
  parameters: ToolParameter[];
  returns: ToolReturnType;
  tags: string[];
}

export type ToolCategory =
  | 'web'
  | 'code'
  | 'data'
  | 'media'
  | 'system'
  | 'ai'
  | 'utility';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface ToolReturnType {
  type: 'string' | 'object' | 'array' | 'stream' | 'void';
  description: string;
  schema?: Record<string, unknown>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface ToolInvocation {
  id: string;
  toolId: string;
  parameters: Record<string, unknown>;
  status: ToolInvocationStatus;
  startedAt: number;
  completedAt?: number;
  result?: unknown;
  error?: ToolError;
  progress?: number;
}

export type ToolInvocationStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlationId: string;
  timestamp: number;
  retryable: boolean;
}

export interface ToolRegistry {
  tools: Map<string, ToolDefinition>;
  getTool(id: string): ToolDefinition | undefined;
  getToolsByCategory(category: ToolCategory): ToolDefinition[];
  getAllTools(): ToolDefinition[];
  registerTool(tool: ToolDefinition): void;
  unregisterTool(id: string): void;
}

// ============================================================================
// Agent System Types
// ============================================================================

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolInvocations?: ToolInvocation[];
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  messages: AgentMessage[];
  currentToolInvocations: Map<string, ToolInvocation>;
  isProcessing: boolean;
  error?: ToolError;
}

export interface AgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  enabledTools: string[];
  toolTimeoutMs: number;
}

// ============================================================================
// Chat/Session Types
// ============================================================================

export interface ChatSession {
  id: string;
  title: string;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  reducedMotion: boolean;
  language: string;
  enabledTools: string[];
  notifications: boolean;
  autoSave: boolean;
}

// ============================================================================
// Error Taxonomy
// ============================================================================

type CorrelationId = `${string}-${string}-${string}-${string}-${string}`;

function generateCorrelationId(): CorrelationId {
  return crypto.randomUUID() as CorrelationId;
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | undefined,
    public readonly retryable: boolean,
    public readonly correlationId: CorrelationId
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NetworkError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: CorrelationId) {
    super('NETWORK_ERROR', message, details, true, correlationId ?? generateCorrelationId());
    this.name = 'NetworkError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: CorrelationId) {
    super('AUTH_ERROR', message, details, false, correlationId ?? generateCorrelationId());
    this.name = 'AuthError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: CorrelationId) {
    super('VALIDATION_ERROR', message, details, false, correlationId ?? generateCorrelationId());
    this.name = 'ValidationError';
  }
}

export class ToolExecutionError extends AppError {
  constructor(
    message: string,
    public readonly toolId: string,
    details?: Record<string, unknown>,
    correlationId?: CorrelationId
  ) {
    super('TOOL_EXECUTION_ERROR', message, details, true, correlationId ?? generateCorrelationId());
    this.name = 'ToolExecutionError';
  }
}

export class TimeoutError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, correlationId?: CorrelationId) {
    super('TIMEOUT_ERROR', message, details, true, correlationId ?? generateCorrelationId());
    this.name = 'TimeoutError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, public readonly retryAfterMs: number, details?: Record<string, unknown>, correlationId?: CorrelationId) {
    super('RATE_LIMIT_ERROR', message, details, true, correlationId ?? generateCorrelationId());
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: AppError;
  correlationId: CorrelationId;
}