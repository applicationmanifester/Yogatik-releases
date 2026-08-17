/**
 * Core tool system types for Yogatik
 * Defines the contract between the agent engine and tool implementations
 */

export type ToolStatus = 'ready' | 'loading' | 'failed' | 'unavailable';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  requiresAuth?: boolean;
  timeoutMs?: number;
  retries?: number;
}

export type ToolCategory =
  | 'web'
  | 'code'
  | 'media'
  | 'data'
  | 'system'
  | 'ai'
  | 'utility';

export interface ToolInvocation {
  id: string;
  toolId: string;
  params: Record<string, unknown>;
  timestamp: number;
  correlationId: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: ToolError;
  durationMs: number;
  timestamp: number;
}

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  correlationId: string;
}

export type ToolErrorCode =
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'TOOL_EXECUTION_ERROR'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'UNKNOWN_ERROR';

export interface ToolStatusUpdate {
  toolId: string;
  status: ToolStatus;
  error?: ToolError;
  progress?: number; // 0-100 for long-running tools
}

export interface ToolRegistry {
  getAll(): ToolDefinition[];
  getById(id: string): ToolDefinition | undefined;
  getByCategory(category: ToolCategory): ToolDefinition[];
  register(tool: ToolDefinition): void;
  unregister(id: string): void;
}

export type ToolExecutor<TParams = Record<string, unknown>, TResult = unknown> = (
  params: TParams,
  context: ToolExecutionContext
) => Promise<ToolResult<TResult>>;

export interface ToolExecutionContext {
  correlationId: string;
  userId?: string;
  sessionId?: string;
  signal: AbortSignal;
  onProgress?: (progress: number) => void;
}