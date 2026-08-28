/**
 * Core Agent Framework
 * Provides base abstractions for autonomous agents with tool access, memory, and communication.
 */

import { z } from 'zod';

// ─── Core Types ────────────────────────────────────────────────────────────────

export interface AgentContext {
  sessionId: string;
  userId?: string;
  traceId: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}

export interface AgentMemory {
  shortTerm: Map<string, unknown>;      // In-context, cleared per task
  longTerm: Map<string, unknown>;       // Persisted across sessions (vector store)
  episodic: Episode[];                  // Past task executions with outcomes
  semantic: Map<string, SemanticFact>;  // Extracted knowledge facts
}

export interface Episode {
  id: string;
  task: string;
  input: unknown;
  output: unknown;
  success: boolean;
  durationMs: number;
  toolsUsed: string[];
  timestamp: number;
  reflections?: string[];
}

export interface SemanticFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  timestamp: number;
}

export interface ToolCall {
  toolId: string;
  args: unknown;
  result?: unknown;
  error?: string;
  durationMs: number;
  timestamp: number;
}

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  outputSchema: z.ZodSchema<any>;
  requiredTools: string[];
  costEstimate: 'low' | 'medium' | 'high';
}

// ─── Base Agent Class ──────────────────────────────────────────────────────────

export abstract class BaseAgent<TInput = any, TOutput = any> {
  public readonly id: string;
  public readonly name: string;
  public readonly description: string;
  public readonly version: string;
  public readonly capabilities: AgentCapability[];
  public readonly requiredTools: string[];

  protected memory: AgentMemory;
  protected context: AgentContext;
  protected toolRegistry: Map<string, ToolExecutor>;
  protected llmClient: LLMClient;
  protected eventBus: AgentEventBus;

  constructor(
    config: AgentConfig,
    dependencies: AgentDependencies
  ) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.version = config.version || '1.0.0';
    this.capabilities = config.capabilities || [];
    this.requiredTools = config.requiredTools || [];
    
    this.memory = dependencies.memory || this.createDefaultMemory();
    this.context = dependencies.context;
    this.toolRegistry = dependencies.toolRegistry || new Map();
    this.llmClient = dependencies.llmClient;
    this.eventBus = dependencies.eventBus;
  }

  protected createDefaultMemory(): AgentMemory {
    return {
      shortTerm: new Map(),
      longTerm: new Map(),
      episodic: [],
      semantic: new Map(),
    };
  }

  // Main execution entry point
  abstract execute(input: TInput, options?: ExecutionOptions): Promise<AgentResult<TOutput>>;

  // Lifecycle hooks
  async onInitialize(): Promise<void> {}
  async onShutdown(): Promise<void> {}
  async onError(error: Error, input: TInput): Promise<void> {
    this.emit('agent:error', { agentId: this.id, error: error.message, input });
  }

  // Tool execution with tracking
  protected async callTool<TArgs, TResult>(
    toolId: string,
    args: TArgs,
    options: { timeoutMs?: number; retries?: number } = {}
  ): Promise<TResult> {
    const executor = this.toolRegistry.get(toolId);
    if (!executor) throw new Error(`Tool not found: ${toolId}`);

    const start = Date.now();
    try {
      const result = await executor.execute(args, this.context);
      this.recordToolCall(toolId, args, result, Date.now() - start);
      return result as TResult;
    } catch (error) {
      this.recordToolCall(toolId, args, undefined, Date.now() - start, error.message);
      throw error;
    }
  }

  protected recordToolCall(
    toolId: string,
    args: unknown,
    result: unknown,
    durationMs: number,
    error?: string
  ): void {
    const call: ToolCall = { toolId, args, result, error, durationMs, timestamp: Date.now() };
    this.memory.shortTerm.set(`toolCall:${Date.now()}`, call);
    this.emit('agent:toolCall', { agentId: this.id, call });
  }

  // Memory operations
  protected remember(key: string, value: unknown, persistent = false): void {
    if (persistent) this.memory.longTerm.set(key, value);
    else this.memory.shortTerm.set(key, value);
  }

  protected recall(key: string): unknown {
    return this.memory.shortTerm.get(key) ?? this.memory.longTerm.get(key);
  }

  protected recordEpisode(episode: Episode): void {
    this.memory.episodic.push(episode);
    if (this.memory.episodic.length > 100) this.memory.episodic.shift();
  }

  protected extractFact(fact: Omit<SemanticFact, 'timestamp'>): void {
    const key = `${fact.subject}|${fact.predicate}|${fact.object}`;
    this.memory.semantic.set(key, { ...fact, timestamp: Date.now() });
  }

  // LLM interaction with structured output
  protected async llmComplete<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    const response = await this.llmClient.complete(prompt, { schema });
    return schema.parse(response);
  }

  protected async llmStream(prompt: string, onChunk: (chunk: string) => void): Promise<string> {
    return this.llmClient.stream(prompt, onChunk);
  }

  // Event emission
  protected emit(event: string, data: unknown): void {
    this.eventBus.emit(`${this.id}:${event}`, data);
  }

  protected on(event: string, handler: (data: unknown) => void): void {
    this.eventBus.on(`${this.id}:${event}`, handler);
  }

  // Reflection & learning
  protected async reflect(episode: Episode): Promise<string[]> {
    const prompt = `Analyze this task execution and identify 3-5 key learnings:
Task: ${episode.task}
Success: ${episode.success}
Duration: ${episode.durationMs}ms
Tools: ${episode.toolsUsed.join(', ')}
Output: ${JSON.stringify(episode.output).slice(0, 500)}

Return JSON array of reflection strings.`;
    return this.llmComplete(prompt, z.array(z.string()));
  }
}

// ─── Supporting Types ──────────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  version?: string;
  capabilities?: AgentCapability[];
  requiredTools?: string[];
  systemPrompt?: string;
}

export interface AgentDependencies {
  memory?: AgentMemory;
  context: AgentContext;
  toolRegistry?: Map<string, ToolExecutor>;
  llmClient: LLMClient;
  eventBus: AgentEventBus;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  maxRetries?: number;
  stream?: boolean;
  onProgress?: (progress: AgentProgress) => void;
}

export interface AgentProgress {
  stage: string;
  progress: number; // 0-100
  message: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T> {
  success: boolean;
  output?: T;
  error?: string;
  metadata: {
    durationMs: number;
    toolsUsed: string[];
    tokensUsed?: number;
    confidence?: number;
    reflections?: string[];
  };
}

export interface ToolExecutor {
  execute(args: unknown, context: AgentContext): Promise<unknown>;
  schema: { input: z.ZodSchema<any>; output: z.ZodSchema<any> };
}

export interface LLMClient {
  complete<T>(prompt: string, options: { schema: z.ZodSchema<T> }): Promise<T>;
  stream(prompt: string, onChunk: (chunk: string) => void): Promise<string>;
}

export class AgentEventBus {
  private handlers: Map<string, Set<(data: unknown) => void>> = new Map();

  emit(event: string, data: unknown): void {
    this.handlers.get(event)?.forEach(h => h(data));
    this.handlers.get('*')?.forEach(h => h({ event, data }));
  }

  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }
}

// ─── Agent Registry ────────────────────────────────────────────────────────────

export class AgentRegistry {
  private agents: Map<string, BaseAgent> = new Map();
  private factories: Map<string, AgentFactory<any, any>> = new Map();

  register(agent: BaseAgent): void {
    this.agents.set(agent.id, agent);
  }

  registerFactory<TIn, TOut>(factory: AgentFactory<TIn, TOut>): void {
    this.factories.set(factory.agentId, factory);
  }

  get<TIn, TOut>(id: string): BaseAgent<TIn, TOut> | undefined {
    return this.agents.get(id) as BaseAgent<TIn, TOut> | undefined;
  }

  async create<TIn, TOut>(id: string, deps: AgentDependencies): Promise<BaseAgent<TIn, TOut>> {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Agent factory not found: ${id}`);
    const agent = factory.create(deps);
    await agent.onInitialize();
    this.agents.set(id, agent);
    return agent;
  }

  list(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  getByCapability(capabilityId: string): BaseAgent[] {
    return Array.from(this.agents.values()).filter(a => 
      a.capabilities.some(c => c.id === capabilityId)
    );
  }
}

export interface AgentFactory<TIn, TOut> {
  agentId: string;
  create(deps: AgentDependencies): BaseAgent<TIn, TOut>;
}

// ─── Multi-Agent Orchestration ────────────────────────────────────────────────

export interface SwarmConfig {
  agents: string[];                    // Agent IDs to include
  topology: 'sequential' | 'parallel' | 'hierarchical' | 'debate';
  maxRounds?: number;
  consensusThreshold?: number;
  aggregator?: 'vote' | 'weighted' | 'llm';
}

export interface SwarmResult<T> {
  consensus: T;
  individualOutputs: Map<string, unknown>;
  rounds: SwarmRound[];
  metadata: {
    totalDurationMs: number;
    totalTokens: number;
    agreementScore: number;
  };
}

export interface SwarmRound {
  round: number;
  outputs: Map<string, unknown>;
  critiques?: Map<string, string>;
  consensus?: unknown;
}

export class AgentSwarm {
  constructor(
    private registry: AgentRegistry,
    private eventBus: AgentEventBus
  ) {}

  async execute<TInput, TOutput>(
    input: TInput,
    config: SwarmConfig,
    context: AgentContext
  ): Promise<SwarmResult<TOutput>> {
    const startTime = Date.now();
    const rounds: SwarmRound[] = [];
    let currentInput = input;
    let consensus: TOutput | undefined;

    const agents = await Promise.all(
      config.agents.map(id => this.registry.get(id) || this.registry.create(id, { context } as any))
    );

    for (let round = 1; round <= (config.maxRounds || 3); round++) {
      const roundStart = Date.now();
      const outputs = new Map<string, unknown>();
      const critiques = new Map<string, string>();

      // Execute agents based on topology
      if (config.topology === 'parallel') {
        await Promise.all(agents.map(async (agent) => {
          const result = await agent.execute(currentInput);
          outputs.set(agent.id, result.output);
        }));
      } else if (config.topology === 'sequential') {
        for (const agent of agents) {
          const result = await agent.execute(currentInput);
          outputs.set(agent.id, result.output);
          currentInput = result.output as TInput; // Pass to next agent
        }
      } else if (config.topology === 'debate') {
        // First round: all agents produce initial output
        await Promise.all(agents.map(async (agent) => {
          const result = await agent.execute(currentInput);
          outputs.set(agent.id, result.output);
        }));

        // Subsequent rounds: agents critique each other
        if (round < (config.maxRounds || 3)) {
          for (const agent of agents) {
            const critiquePrompt = this.buildCritiquePrompt(agent, outputs, currentInput);
            const critique = await agent.llmComplete(critiquePrompt, z.string());
            critiques.set(agent.id, critique);
          }
          // Feed critiques back as context for next round
          currentInput = { ...currentInput as object, critiques: Object.fromEntries(critiques) } as TInput;
        }
      }

      rounds.push({ round, outputs, critiques, consensus });

      // Check for consensus
      if (config.topology !== 'sequential') {
        consensus = await this.aggregateOutputs(outputs, config.aggregator || 'vote');
        const agreement = this.calculateAgreement(outputs);
        
        if (agreement >= (config.consensusThreshold || 0.8)) break;
      }
    }

    return {
      consensus: consensus as TOutput,
      individualOutputs: rounds[rounds.length - 1].outputs,
      rounds,
      metadata: {
        totalDurationMs: Date.now() - startTime,
        totalTokens: 0, // TODO: track from LLM client
        agreementScore: this.calculateAgreement(rounds[rounds.length - 1].outputs),
      },
    };
  }

  private buildCritiquePrompt(agent: BaseAgent, outputs: Map<string, unknown>, input: unknown): string {
    return `You are ${agent.name}. Review these peer outputs for the task:
Input: ${JSON.stringify(input).slice(0, 1000)}

Peer Outputs:
${Array.from(outputs.entries()).map(([id, out]) => `--- ${id} ---\n${JSON.stringify(out).slice(0, 500)}`).join('\n\n')}

Provide a concise critique (max 300 words) focusing on: correctness, completeness, novel insights, and disagreements.`;
  }

  private async aggregateOutputs<T>(outputs: Map<string, unknown>, method: string): Promise<T> {
    if (method === 'vote') {
      // Simple majority for discrete outputs, average for numeric
      const values = Array.from(outputs.values());
      if (typeof values[0] === 'number') {
        return (values.reduce((a, b) => a + (b as number), 0) / values.length) as T;
      }
      return values[0] as T; // First as fallback
    }
    if (method === 'llm') {
      // Would use LLM to synthesize - placeholder
      return Array.from(outputs.values())[0] as T;
    }
    return Array.from(outputs.values())[0] as T;
  }

  private calculateAgreement(outputs: Map<string, unknown>): number {
    const values = Array.from(outputs.values());
    if (values.length < 2) return 1;
    
    // Simple string similarity for now
    const first = JSON.stringify(values[0]);
    let matches = 0;
    for (let i = 1; i < values.length; i++) {
      const sim = this.stringSimilarity(first, JSON.stringify(values[i]));
      if (sim > 0.7) matches++;
    }
    return matches / (values.length - 1);
  }

  private stringSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    const distance = this.levenshtein(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private levenshtein(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        matrix[j][i] = a[i-1] === b[j-1] ? matrix[j-1][i-1] : 
          1 + Math.min(matrix[j-1][i], matrix[j][i-1], matrix[j-1][i-1]);
      }
    }
    return matrix[b.length][a.length];
  }
}