/**
 * ToolStatusPanel - Main component displaying status of all tools
 * Features: real-time updates, combined selectors, category filtering, retry functionality, search, compact mode
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useToolStatusStore, type ToolWithStatus } from '@/stores/toolStatusStore';
import { toolRegistry } from '@/tools/registry';
import type { ToolCategory, ToolStatus } from '@/types/tool';
import { ToolStatusBadge } from './ToolStatusBadge';
import { ToolStatusCard } from './ToolStatusCard';
import { ToolErrorDetails } from './ToolErrorDetails';
import { CategoryFilter } from './CategoryFilter';
import { SearchBox } from './SearchBox';
import styles from './ToolStatusPanel.module.css';

interface ToolStatusPanelProps {
  /** Whether to show the panel in compact mode */
  compact?: boolean;
  /** Callback when a tool retry is initiated */
  onRetry?: (toolId: string) => void;
  /** Custom className */
  className?: string;
}

export function ToolStatusPanel({
  compact = false,
  onRetry,
  className = '',
}: ToolStatusPanelProps) {
  // Subscribe to toolStates and registeredExecutors in a single unified hook
  const { toolStates, registeredExecutors } = useToolStatusStore((state) => ({
    toolStates: state.toolStates,
    registeredExecutors: state.registeredExecutors,
  }));

  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [showAllFailedModal, setShowAllFailedModal] = useState(false);

  // Derive all tools with their live status in a memoized pass
  const tools: ToolWithStatus[] = useMemo(() => {
    const allDefs = toolRegistry.getAll();
    return allDefs.map((def) => {
      const state = toolStates.get(def.id);
      return {
        ...def,
        status: state?.status ?? 'unavailable',
        error: state?.error,
        progress: state?.progress,
        isRegistered: registeredExecutors.has(def.id),
      };
    });
  }, [toolStates, registeredExecutors]);

  // Derive category counts in a memoized pass
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { total: number; ready: number; loading: number; failed: number; unavailable: number }> = {};
    toolRegistry.getCategories().forEach((cat) => {
      counts[cat] = { total: 0, ready: 0, loading: 0, failed: 0, unavailable: 0 };
    });

    tools.forEach((tool) => {
      const catCounts = counts[tool.category];
      if (catCounts) {
        catCounts.total++;
        if (tool.status in catCounts) {
          catCounts[tool.status]++;
        }
      }
    });

    return counts;
  }, [tools]);

  // Filter tools based on category and search query
  const filteredTools = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tools.filter((tool) => {
      const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
      const matchesSearch =
        query === '' ||
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query) ||
        tool.id.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [tools, selectedCategory, searchQuery]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped: Record<ToolCategory, ToolWithStatus[]> = {
      web: [],
      code: [],
      media: [],
      data: [],
      system: [],
      ai: [],
      utility: [],
    };
    filteredTools.forEach((tool) => {
      if (grouped[tool.category]) {
        grouped[tool.category].push(tool);
      }
    });
    return grouped;
  }, [filteredTools]);

  const handleRetry = useCallback(
    (toolId: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      onRetry?.(toolId);
      useToolStatusStore.getState().retryTool(toolId);
    },
    [onRetry]
  );

  const handleErrorClick = useCallback((toolId: string) => {
    setExpandedError((prev) => (prev === toolId ? null : toolId));
  }, []);

  const getStatusCounts = useCallback((toolList: ToolWithStatus[]) => {
    return toolList.reduce(
      (acc, tool) => {
        acc[tool.status] = (acc[tool.status] || 0) + 1;
        return acc;
      },
      { ready: 0, loading: 0, failed: 0, unavailable: 0 } as Record<ToolStatus, number>
    );
  }, []);

  const totalCounts = useMemo(() => getStatusCounts(tools), [tools, getStatusCounts]);
  const filteredCounts = useMemo(() => getStatusCounts(filteredTools), [filteredTools, getStatusCounts]);

  const failedTools = useMemo(() => tools.filter((t) => t.status === 'failed'), [tools]);

  // Compact Mode
  if (compact) {
    return (
      <div className={`${styles.compactPanel} ${className}`} role="region" aria-label="Tool status summary">
        <div className={styles.compactHeader}>
          <span className={styles.compactTitle}>Tools</span>
          <div className={styles.compactCounts}>
            <span className={`${styles.count} ${styles.ready}`} title="Ready">
              {totalCounts.ready}
            </span>
            <span className={`${styles.count} ${styles.loading}`} title="Loading">
              {totalCounts.loading}
            </span>
            <span className={`${styles.count} ${styles.failed}`} title="Failed">
              {totalCounts.failed}
            </span>
          </div>
        </div>

        {failedTools.length > 0 && (
          <div className={styles.compactErrors}>
            {failedTools.slice(0, 3).map((tool) => (
              <ToolStatusBadge
                key={tool.id}
                tool={tool}
                onClick={() => handleErrorClick(tool.id)}
                showError={expandedError === tool.id}
              />
            ))}
            {failedTools.length > 3 && (
              <span className={styles.moreErrors}>
                +{failedTools.length - 3} more{' '}
                <button
                  className={styles.showAllButton}
                  onClick={() => setShowAllFailedModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-color, #38bdf8)',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: 11,
                    padding: 0,
                  }}
                >
                  Show all
                </button>
              </span>
            )}
          </div>
        )}

        {/* Failed Tools Modal in Compact Mode */}
        {showAllFailedModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAllFailedModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>Failed Tools ({failedTools.length})</h3>
                <button className={styles.closeBtn} onClick={() => setShowAllFailedModal(false)}>×</button>
              </div>
              <div className={styles.failedList} style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, padding: 12 }}>
                {failedTools.map((tool) => (
                  <div key={tool.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: 6 }}>
                    <div>
                      <strong>{tool.name}</strong>
                      <div style={{ fontSize: 11, color: '#f87171' }}>{tool.error?.message || 'Execution error'}</div>
                    </div>
                    <button
                      onClick={() => handleRetry(tool.id)}
                      style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                    >
                      Retry
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {expandedError && (
          <ToolErrorDetails
            error={tools.find((t) => t.id === expandedError)?.error || {
              code: 'UNKNOWN',
              message: 'Error details not found',
              correlationId: 'N/A',
            }}
            onDismiss={() => setExpandedError(null)}
            onRetry={() => handleRetry(expandedError)}
          />
        )}
      </div>
    );
  }

  // Full Mode
  return (
    <div className={`${styles.panel} ${className}`} role="region" aria-label="Tool status panel">
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>Tool Status</h2>
          <div className={styles.summaryCounts}>
            <span className={`${styles.count} ${styles.ready}`} title="Ready">
              {filteredCounts.ready}/{tools.length}
            </span>
            <span className={`${styles.count} ${styles.loading}`} title="Loading">
              {filteredCounts.loading}
            </span>
            <span className={`${styles.count} ${styles.failed}`} title="Failed">
              {filteredCounts.failed}
            </span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <SearchBox
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tools..."
          />
          <CategoryFilter
            selected={selectedCategory}
            onChange={setSelectedCategory}
            counts={categoryCounts}
          />
        </div>
      </header>

      {/* Tool Grid */}
      <div className={styles.grid}>
        {Object.entries(toolsByCategory).map(([category, categoryTools]) => {
          if (categoryTools.length === 0) return null;
          const catCounts = categoryCounts[category as ToolCategory] || {
            ready: 0,
            loading: 0,
            failed: 0,
            unavailable: 0,
            total: 0,
          };

          return (
            <section key={category} className={styles.categorySection}>
              <header className={styles.categoryHeader}>
                <span className={styles.categoryName}>{category}</span>
                <span className={styles.categoryCount}>
                  {catCounts.ready}/{catCounts.total} ready
                </span>
              </header>
              <div className={styles.categoryTools}>
                {categoryTools.map((tool) => (
                  <ToolStatusCard
                    key={tool.id}
                    tool={tool}
                    onRetry={(id, e) => handleRetry(id, e)}
                    onErrorClick={handleErrorClick}
                    showError={expandedError === tool.id}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Error Details Modal */}
      {expandedError && (
        <ToolErrorDetails
          error={tools.find((t) => t.id === expandedError)?.error || {
            code: 'UNKNOWN',
            message: 'Error details not found',
            correlationId: 'N/A',
          }}
          onDismiss={() => setExpandedError(null)}
          onRetry={() => handleRetry(expandedError)}
        />
      )}

      {/* Empty State */}
      {filteredTools.length === 0 && (
        <div className={styles.emptyState}>
          <p>No tools match your filters.</p>
          <button
            className={styles.resetButton}
            onClick={() => {
              setSelectedCategory('all');
              setSearchQuery('');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}