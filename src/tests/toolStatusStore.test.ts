import { describe, it, expect, beforeEach } from 'vitest';
import { useToolStatusStore, selectAllToolsWithStatus, selectCategoryCounts } from '../stores/toolStatusStore';
import { toolRegistry } from '../tools/registry';

describe('ToolStatusStore Refactoring & Robustness', () => {
  beforeEach(() => {
    useToolStatusStore.getState().reset();
  });

  it('initializes tools as unavailable rather than false ready', () => {
    useToolStatusStore.getState().initialize();
    const store = useToolStatusStore.getState();

    expect(store.isInitialized).toBe(true);
    expect(store.registeredExecutors.size).toBe(0);

    const allStatuses = store.getAllStatuses();
    const statusValues = Object.values(allStatuses);
    expect(statusValues.length).toBeGreaterThan(0);
    // Every single tool should start as unavailable until executor registration/verification
    expect(statusValues.every((s) => s === 'unavailable')).toBe(true);
  });

  it('transitions tool to ready when registerExecutor is called', () => {
    useToolStatusStore.getState().initialize();

    const sampleTool = toolRegistry.getAll()[0];
    expect(sampleTool).toBeDefined();

    expect(useToolStatusStore.getState().getStatus(sampleTool.id)).toBe('unavailable');

    useToolStatusStore.getState().registerExecutor(sampleTool.id);
    expect(useToolStatusStore.getState().registeredExecutors.has(sampleTool.id)).toBe(true);
    expect(useToolStatusStore.getState().getStatus(sampleTool.id)).toBe('ready');
  });

  it('handles retryTool with test parameters and fails gracefully for unregistered tools', async () => {
    useToolStatusStore.getState().initialize();

    const unregisteredId = 'non_existent_tool_xyz';
    await useToolStatusStore.getState().retryTool(unregisteredId, { query: 'test' });

    const currentStatus = useToolStatusStore.getState().getStatus(unregisteredId);
    const error = useToolStatusStore.getState().getError(unregisteredId);

    expect(currentStatus).toBe('failed');
    expect(error).toBeDefined();
    expect(error?.code).toBe('UNAVAILABLE');
    expect(error?.retryable).toBe(false);
  });

  it('executes retryTool with test parameters for registered tools', async () => {
    useToolStatusStore.getState().initialize();

    // research_swarm_review has an executor registered in registry.ts
    const toolId = 'research_swarm_review';
    await useToolStatusStore.getState().retryTool(toolId, {
      title: 'Neural Architecture Search',
      methodology: 'RL',
    });

    const status = useToolStatusStore.getState().getStatus(toolId);
    expect(status).toBe('ready');
  });

  it('provides single-pass memoized category counts', () => {
    useToolStatusStore.getState().initialize();

    const counts = selectCategoryCounts();
    expect(counts.web).toBeDefined();
    expect(counts.code).toBeDefined();
    expect(counts.web.total).toBeGreaterThan(0);
    expect(counts.web.unavailable).toBe(counts.web.total);
  });
});
