/**
 * ToolStatusPanel - Main component displaying status of all 65 tools
 * Features: real-time updates, category filtering, retry functionality, search
 */

import { useMemo, useState, useCallback } from 'react';
import { useToolStatusStore, selectAllToolsWithStatus, selectCategoryCounts } from '@/stores/toolStatusStore';
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
  const tools = useToolStatusStore(selectAllToolsWithStatus);
  const categoryCounts = useToolStatusStore(selectCategoryCounts);
  const [selectedCategory, setSelectedCategory] = useState<ToolCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedError, setExpandedError] = useState<string | null>(null);

  // Get the error for the expanded tool
  const expandedErrorData = useMemo(() => {
    if (!expandedError) return null;
    return tools.find(t => t.id === expandedError)?.error ?? null;
  }, [tools, expandedError]);

  // Filter tools based on category and search
  const filteredTools = useMemo(() => {
    return tools.filter((tool) => {
      const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
      const matchesSearch =
        searchQuery === '' ||
        tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tool.id.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [tools, selectedCategory, searchQuery]);

  // Group tools by category
  const toolsByCategory = useMemo(() => {
    const grouped: Record<ToolCategory, typeof filteredTools> = {
      web: [],
      code: [],
      media: [],
      data: [],
      system: [],
      ai: [],
      utility: [],
    };
    filteredTools.forEach((tool) => {
      grouped[tool.category].push(tool);
    });
    return grouped;
  }, [filteredTools]);

  const handleRetry = useCallback(
    (toolId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onRetry?.(toolId);
      useToolStatusStore.getState().retryTool(toolId);
    },
    [onRetry]
  );

  const handleErrorClick = useCallback((toolId: string) => {
    setExpandedError((prev) => (prev === toolId ? null : toolId));
  }, []);

  const getStatusCounts = useCallback(
    (toolList: typeof filteredTools) => {
      return toolList.reduce(
        (acc, tool) => {
          acc[tool.status]++;
          return acc;
        },
        { ready: 0, loading: 0, failed: 0, unavailable: 0 } as Record<ToolStatus, number>
      );
    },
    []
  );

  const totalCounts = getStatusCounts(tools);
  const filteredCounts = getStatusCounts(filteredTools);

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
        {totalCounts.failed > 0 && (
          <div className={styles.compactErrors}>
            {tools
              .filter((t) => t.status === 'failed')
              .slice(0, 3)
              .map((tool) => (
                <ToolStatusBadge
                  key={tool.id}
                  tool={tool}
                  onClick={() => handleErrorClick(tool.id)}
                  showError={expandedError === tool.id}
                />
              ))}
            {tools.filter((t) => t.status === 'failed').length > 3 && (
              <span className={styles.moreErrors}>
                +{tools.filter((t) => t.status === 'failed').length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

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
          <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search tools..." />
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
            total: 0,
            ready: 0,
            loading: 0,
            failed: 0,
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
                    onRetry={handleRetry}
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
      {expandedErrorData && (
        <ToolErrorDetails
          error={expandedErrorData}
          onDismiss={() => setExpandedError(null)}
          onRetry={() => expandedError && handleRetry(expandedError, { stopPropagation: () => {} } as React.MouseEvent)}
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