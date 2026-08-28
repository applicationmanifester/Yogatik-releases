/**
 * Tool Contract & Type-Safe Interface Specification
 *
 * Defines the standard contract for all Yogatik tools with runtime schema validation,
 * observability telemetry, retry policies, and sandboxing bounds.
 */

import { z } from 'zod'

export interface ToolContext {
  userId?: string
  correlationId: string
  signal?: AbortSignal
  tokenBudget?: number
  log: (level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void
}

export interface ToolPolicy {
  maxRetries: number
  timeoutMs: number
  fallbackTool?: string
  rateLimitPerMin?: number
  deprecated?: boolean
  deprecationMessage?: string
}

export interface ToolManifestItem {
  name: string
  version: string
  description: string
  category: 'academic' | 'document' | 'hardware' | 'web' | 'code' | 'ai' | 'utility'
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  policy: ToolPolicy
}

export interface ToolContract<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string
  version: string
  description: string
  category: 'academic' | 'document' | 'hardware' | 'web' | 'code' | 'ai' | 'utility'
  inputSchema: z.ZodType<TInput>
  outputSchema: z.ZodType<TOutput>
  policy?: Partial<ToolPolicy>
  validate?: (input: unknown) => { valid: boolean; errors?: string[] }
  execute: (input: TInput, ctx: ToolContext) => Promise<TOutput>
}

export interface ToolExecutionTelemetry {
  toolName: string
  version: string
  correlationId: string
  startTime: number
  endTime: number
  durationMs: number
  success: boolean
  error?: string
  retryCount: number
  inputSize: number
  outputSize: number
}
