/**
 * Tool Status Store - Manages real-time status of all tools
 * Uses Zustand for lightweight, reactive state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { ToolStatus, ToolStatusUpdate, ToolError } from '@/types/tool';
import { toolRegistry } from '@/tools/registry';

interface ToolState {
  id: string;
  status: ToolStatus;
  error?: ToolError;
  progress?: number;
  lastUpdated: number;
}

interface ToolStatusStore {
  // State
  toolStates: Map<string, ToolState>;
  isInitialized: boolean;

  // Actions
  initialize: () => void;
  updateStatus: (update: ToolStatusUpdate) => void;
  setLoading: (toolId: string) => void;
  setReady: (toolId: string) => void;
  setFailed: (toolId: string, error: ToolError) => void;
  setProgress: (toolId: string, progress: number) => void;
  retryTool: (toolId: string) => Promise<void>;
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
      status: 'unavailable',
      lastUpdated: Date.now(),
    });
  });
  return states;
};

export const useToolStatusStore = create<ToolStatusStore>()(
  subscribeWithSelector((set, get) => ({
    toolStates: createInitialToolStates(),
    isInitialized: false,

    initialize: () => {
      const states = createInitialToolStates();
      // Mark all tools as ready initially (they'll be updated when executors are registered)
      states.forEach((state) => {
        state.status = 'ready';
      });
      set({ toolStates: states, isInitialized: true });
    },

    updateStatus: (update: ToolStatusUpdate) => {
      set((state) => {
        const newStates = new Map(state.toolStates);
        const existing = newStates.get(update.toolId);
        if (existing) {
          newStates.set(update.toolId, {
            ...existing,
            status: update.status,
            error: update.error,
            progress: update.progress,
            lastUpdated: Date.now(),
          });
        }
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

    retryTool: async (toolId: string) => {
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
        // Execute with empty params to test connectivity
        const result = await executor({} as Record<string, unknown>, {
          correlationId: crypto.randomUUID(),
          signal: new AbortController().signal,
        });

        if (result.success) {
          setReady(toolId);
        } else {
          setFailed(toolId, result.error!);
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
      set({ toolStates: createInitialToolStates(), isInitialized: false });
    },
  }))
);

// Selectors for common use cases
export const selectToolStatus = (toolId: string) =>
  useToolStatusStore((state) => state.getStatus(toolId));

export const selectToolError = (toolId: string) =>
  useToolStatusStore((state) => state.getError(toolId));

export const selectToolProgress = (toolId: string) =>
  useToolStatusStore((state) => state.toolStates.get(toolId)?.progress);

export const selectToolsByCategory = (category: string) =>
  useToolStatusStore((state) => {
    const tools = toolRegistry.getByCategory(category as any);
    return tools.map((tool) => ({
      ...tool,
      status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
      error: state.toolStates.get(tool.id)?.error,
      progress: state.toolStates.get(tool.id)?.progress,
    }));
  });

export const selectAllToolsWithStatus = () =>
  useToolStatusStore((state) => {
    const tools = toolRegistry.getAll();
    return tools.map((tool) => ({
      ...tool,
      status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
      error: state.toolStates.get(tool.id)?.error,
      progress: state.toolStates.get(tool.id)?.progress,
    }));
  });

export const selectToolsByStatus = (status: ToolStatus) =>
  useToolStatusStore((state) => {
    const tools = toolRegistry.getAll();
    return tools
      .filter((tool) => state.toolStates.get(tool.id)?.status === status)
      .map((tool) => ({
        ...tool,
        status: state.toolStates.get(tool.id)?.status ?? 'unavailable',
        error: state.toolStates.get(tool.id)?.error,
        progress: state.toolStates.get(tool.id)?.progress,
      }));
  });

export const selectCategoryCounts = () =>
  useToolStatusStore((state) => {
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
          // Use a type-safe way to increment the status count
          const statusKey = toolState.status as keyof typeof catCounts;
          if (statusKey in catCounts) {
            (catCounts as Record<string, number>)[statusKey]++;
          }
        }
      }
    });

    return counts;
  });