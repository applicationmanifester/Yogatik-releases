/**
 * Tool Status Store - Manages real-time status of all tools
 * Uses Zustand for lightweight, reactive state management with optimized selectors
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ToolStatus, ToolStatusUpdate, ToolError, ToolCategory, ToolDefinition } from '@/types/tool';
import { toolRegistry } from '@/tools/registry';

export interface ToolState {
  id: string;
  status: ToolStatus;
  error?: ToolError;
  progress?: number;
  lastUpdated: number;
}

export interface ToolWithStatus extends ToolDefinition {
  status: ToolStatus;
  error?: ToolError;
  progress?: number;
  isRegistered?: boolean;
}

export interface ToolStatusStore {
  // State
  toolStates: Map<string, ToolState>;
  isInitialized: boolean;
  registeredExecutors: Set<string>;

  // Actions
  initialize: () => void;
  registerExecutor: (toolId: string) => void;
  updateStatus: (update: ToolStatusUpdate) => void;
  setLoading: (toolId: string) => void;
  setReady: (toolId: string) => void;
  setFailed: (toolId: string, error: ToolError) => void;
  setProgress: (toolId: string, progress: number) => void;
  /** Retry execution with optional test parameters */
  retryTool: (toolId: string, testParams?: Record<string, unknown>) => Promise<void>;
  getStatus: (toolId: string) => ToolStatus;
  getError: (toolId: string) => ToolError | undefined;
  getAllStatuses: () => Record<string, ToolStatus>;
  reset: () => void;
}

const createInitialToolStates = (): Map<string, ToolState> => {
  const states = new Map<string, ToolState>();
  toolRegistry.getAll().forEach((tool) => {
    states.set(tool.id, {
      id: tool.id,
      status: 'unavailable', // Start as unavailable until executor is registered / verified
      lastUpdated: Date.now(),
    });
  });
  return states;
};

export const useToolStatusStore = create<ToolStatusStore>()(
  subscribeWithSelector((set, get) => ({
    toolStates: createInitialToolStates(),
    isInitialized: false,
    registeredExecutors: new Set(),

    initialize: () => {
      set({
        toolStates: createInitialToolStates(),
        isInitialized: true,
        registeredExecutors: new Set(),
      });
    },

    registerExecutor: (toolId: string) => {
      set((state) => {
        const newExecutors = new Set(state.registeredExecutors);
        newExecutors.add(toolId);

        // Transition tool to ready if it was unavailable
        const newStates = new Map(state.toolStates);
        const existing = newStates.get(toolId);
        if (existing && existing.status === 'unavailable') {
          newStates.set(toolId, {
            ...existing,
            status: 'ready',
            lastUpdated: Date.now(),
          });
        }

        return {
          registeredExecutors: newExecutors,
          toolStates: newStates,
        };
      });
    },

    updateStatus: (update: ToolStatusUpdate) => {
      set((state) => {
        const newStates = new Map(state.toolStates);
        const existing = newStates.get(update.toolId) || {
          id: update.toolId,
          status: update.status,
          lastUpdated: Date.now(),
        };
        newStates.set(update.toolId, {
          ...existing,
          status: update.status,
          error: update.error,
          progress: update.progress,
          lastUpdated: Date.now(),
        });
        return { toolStates: newStates };
      });
    },

    setLoading: (toolId: string) => {
      get().updateStatus({ toolId, status: 'loading', progress: 0 });
    },

    setReady: (toolId: string) => {
      get().updateStatus({ toolId, status: 'ready', progress: 100 });
    },

    setFailed: (toolId: string, error: ToolError) => {
      get().updateStatus({ toolId, status: 'failed', error, progress: 0 });
    },

    setProgress: (toolId: string, progress: number) => {
      set((state) => {
        const newStates = new Map(state.toolStates);
        const existing = newStates.get(toolId);
        if (existing && existing.status === 'loading') {
          newStates.set(toolId, {
            ...existing,
            progress: Math.max(0, Math.min(100, progress)),
            lastUpdated: Date.now(),
          });
        }
        return { toolStates: newStates };
      });
    },

    retryTool: async (toolId: string, testParams = {}) => {
      const { setLoading, setReady, setFailed } = get();
      const executor = toolRegistry.getExecutor(toolId);

      if (!executor) {
        const error: ToolError = {
          code: 'UNAVAILABLE',
          message: 'Tool executor not registered',
          retryable: false,
          correlationId: crypto.randomUUID(),
        };
        setFailed(toolId, error);
        return;
      }

      setLoading(toolId);

      try {
        const result = await executor(testParams, {
          correlationId: crypto.randomUUID(),
          signal: new AbortController().signal,
        });

        if (result.success) {
          setReady(toolId);
        } else {
          setFailed(toolId, result.error || {
            code: 'EXECUTION_FAILED',
            message: 'Tool execution returned failure',
            retryable: true,
            correlationId: crypto.randomUUID(),
          });
        }
      } catch (err) {
        const error: ToolError = {
          code: 'TOOL_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
          correlationId: crypto.randomUUID(),
        };
        setFailed(toolId, error);
      }
    },

    getStatus: (toolId: string) => {
      return get().toolStates.get(toolId)?.status ?? 'unavailable';
    },

    getError: (toolId: string) => {
      return get().toolStates.get(toolId)?.error;
    },

    getAllStatuses: () => {
      const statuses: Record<string, ToolStatus> = {};
      get().toolStates.forEach((state, id) => {
        statuses[id] = state.status;
      });
      return statuses;
    },

    reset: () => {
      set({
        toolStates: createInitialToolStates(),
        isInitialized: false,
        registeredExecutors: new Set(),
      });
    },
  }))
);

// Type-Safe Selectors
export const selectToolStatus = (toolId: string) =>
  useToolStatusStore((state) => state.getStatus(toolId));

export const selectToolError = (toolId: string) =>
  useToolStatusStore((state) => state.getError(toolId));

export const selectToolProgress = (toolId: string) =>
  useToolStatusStore((state) => state.toolStates.get(toolId)?.progress);

export const selectToolsByCategory = (category: ToolCategory) =>
  useToolStatusStore((state) => {
    const tools = toolRegistry.getByCategory(category);
    return tools.map((tool) => ({
      ...tool,
      status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
      error: state.toolStates.get(tool.id)?.error,
      progress: state.toolStates.get(tool.id)?.progress,
      isRegistered: state.registeredExecutors.has(tool.id),
    }));
  });

export const selectAllToolsWithStatus = (): ToolWithStatus[] => {
  const state = useToolStatusStore.getState();
  const tools = toolRegistry.getAll();
  return tools.map((tool) => ({
    ...tool,
    status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
    error: state.toolStates.get(tool.id)?.error,
    progress: state.toolStates.get(tool.id)?.progress,
    isRegistered: state.registeredExecutors.has(tool.id),
  }));
};

export const selectToolsByStatus = (status: ToolStatus): ToolWithStatus[] => {
  const state = useToolStatusStore.getState();
  const tools = toolRegistry.getAll();
  return tools
    .filter((tool) => state.toolStates.get(tool.id)?.status === status)
    .map((tool) => ({
      ...tool,
      status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
      error: state.toolStates.get(tool.id)?.error,
      progress: state.toolStates.get(tool.id)?.progress,
      isRegistered: state.registeredExecutors.has(tool.id),
    }));
};

export const selectCategoryCounts = () => {
  const state = useToolStatusStore.getState();
  const counts: Record<string, { total: number; ready: number; loading: number; failed: number; unavailable: number }> = {};
  toolRegistry.getCategories().forEach((cat) => {
    counts[cat] = { total: 0, ready: 0, loading: 0, failed: 0, unavailable: 0 };
  });

  state.toolStates.forEach((toolState) => {
    const tool = toolRegistry.getById(toolState.id);
    if (tool) {
      const catCounts = counts[tool.category];
      if (catCounts) {
        catCounts.total++;
        const statusKey = toolState.status;
        if (statusKey in catCounts) {
          catCounts[statusKey]++;
        }
      }
    }
  });

  return counts;
};