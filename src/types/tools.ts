/**
 * Core type definitions for Yogatik
 */

export type ToolStatus = 'ready' | 'loading' | 'failed' | 'unavailable';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  version: string;
  requiresAuth: boolean;
  timeout: number; // milliseconds
  retryable: boolean;
  maxRetries: number;
  parameters: ToolParameter[];
  returns: ToolReturnType;
  tags: string[];
}

export type ToolCategory =
  | 'search'
  | 'compute'
  | 'media'
  | 'data'
  | 'utility'
  | 'development'
  | 'communication'
  | 'system';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
  schema?: Record<string, unknown>; // JSON Schema for complex types
}

export interface ToolReturnType {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'stream';
  description: string;
  schema?: Record<string, unknown>;
}

export interface ToolInvocation {
  id: string;
  toolId: string;
  parameters: Record<string, unknown>;
  timestamp: number;
  correlationId: string;
}

export interface ToolResult<T = unknown> {
  id: string;
  toolId: string;
  success: boolean;
  data?: T;
  error?: ToolError;
  duration: number;
  timestamp: number;
  correlationId: string;
}

export interface ToolError {
  code: ToolErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  correlationId: string;
}

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'TOOL_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'USER_CANCELLED'
  | 'QUOTA_EXCEEDED';

export interface ToolStatusInfo {
  toolId: string;
  status: ToolStatus;
  lastChecked: number;
  lastError?: ToolError;
  loadProgress?: number; // 0-100 for loading state
}

export type ToolExecutor<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> = (
  params: TParams,
  context: ToolExecutionContext
) => Promise<ToolResult<TResult>>;

export interface ToolExecutionContext {
  correlationId: string;
  signal: AbortSignal;
  userId?: string;
  sessionId: string;
  reportProgress: (progress: number) => void;
  getSecret: (key: string) => Promise<string | null>;
}

export interface ToolRegistry {
  register(tool: ToolDefinition, executor: ToolExecutor): void;
  unregister(toolId: string): void;
  get(toolId: string): ToolDefinition | undefined;
  getAll(): ToolDefinition[];
  getByCategory(category: ToolCategory): ToolDefinition[];
  getStatus(toolId: string): ToolStatusInfo | undefined;
  setStatus(toolId: string, status: ToolStatusInfo): void;
}

export interface ToolInvocationRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  options?: {
    timeout?: number;
    retries?: number;
    signal?: AbortSignal;
  };
}

export interface ToolInvocationResponse<T = unknown> {
  result: ToolResult<T>;
  status: ToolStatusInfo;
}