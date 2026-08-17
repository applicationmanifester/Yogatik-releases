/**
 * ToolStatusCard - Detailed card view for a single tool
 */

import { useState } from 'react';
import type { ToolDefinition, ToolStatus, ToolError } from '@/types/tool';
import { ToolStatusBadge } from './ToolStatusBadge';
import styles from './ToolStatusCard.module.css';

interface ToolStatusCardProps {
  tool: ToolDefinition & { status: ToolStatus; error?: ToolError; progress?: number };
  onRetry: (toolId: string, e: React.MouseEvent) => void;
  onErrorClick: (toolId: string) => void;
  showError: boolean;
}

const STATUS_LABELS: Record<ToolStatus, string> = {
  ready: 'Ready',
  loading: 'Loading',
  failed: 'Failed',
  unavailable: 'Unavailable',
};

const CATEGORY_ICONS: Record<string, string> = {
  web: '🌐',
  code: '💻',
  media: '🎬',
  data: '📊',
  system: '⚙️',
  ai: '🤖',
  utility: '🔧',
};

export function ToolStatusCard({
  tool,
  onRetry,
  onErrorClick,
  showError,
}: ToolStatusCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const status = tool.status;
  const categoryIcon = CATEGORY_ICONS[tool.category] || '📦';

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRetry(tool.id, e);
  };

  const handleCardClick = () => {
    if (status === 'failed') {
      onErrorClick(tool.id);
    }
  };

  return (
    <article
      className={`${styles.card} ${styles[status]} ${isHovered ? styles.hovered : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleCardClick}
      tabIndex={status === 'failed' ? 0 : -1}
      onKeyDown={(e) => {
        if (status === 'failed' && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onErrorClick(tool.id);
        }
      }}
      role={status === 'failed' ? 'button' : 'article'}
      aria-label={`${tool.name}: ${STATUS_LABELS[status]}`}
      aria-expanded={showError}
    >
      <div className={styles.cardHeader}>
        <span className={styles.categoryIcon} aria-hidden="true">
          {categoryIcon}
        </span>
        <div className={styles.toolInfo}>
          <h3 className={styles.toolName}>{tool.name}</h3>
          <p className={styles.toolDescription}>{tool.description}</p>
        </div>
        <ToolStatusBadge tool={tool} />
      </div>

      <div className={styles.cardDetails}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>ID</span>
          <code className={styles.detailValue}>{tool.id}</code>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Category</span>
          <span className={styles.detailValue}>{tool.category}</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Version</span>
          <span className={styles.detailValue}>{tool.version}</span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Timeout</span>
          <span className={styles.detailValue}>
            {Math.round((tool.timeoutMs ?? 0) / 1000)}s
          </span>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Retries</span>
          <span className={styles.detailValue}>{tool.retries ?? 0}</span>
        </div>
        {tool.requiresAuth && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Auth</span>
            <span className={styles.detailValue}>Required</span>
          </div>
        )}
      </div>

      {status === 'loading' && tool.progress !== undefined && (
        <div className={styles.progressContainer} role="progressbar" aria-valuenow={tool.progress} aria-valuemin={0} aria-valuemax={100}>
          <div
            className={styles.progressBar}
            style={{ width: `${tool.progress}%` }}
            aria-hidden="true"
          />
          <span className={styles.progressText}>{tool.progress}%</span>
        </div>
      )}

      {status === 'failed' && tool.error && (
        <div className={styles.errorSection}>
          <button
            className={styles.errorToggle}
            onClick={(e) => {
              e.stopPropagation();
              onErrorClick(tool.id);
            }}
            aria-expanded={showError}
            aria-controls={`error-details-${tool.id}`}
          >
            <span className={styles.errorIcon}>⚠</span>
            <span className={styles.errorCode}>{tool.error.code}</span>
            <span className={styles.errorMessage}>{tool.error.message}</span>
            <span className={`${styles.chevron} ${showError ? styles.expanded : ''}`} aria-hidden="true">
              ▼
            </span>
          </button>
          {showError && (
            <div id={`error-details-${tool.id}`} className={styles.errorDetails} role="region" aria-label="Error details">
              <pre className={styles.errorStack}>{JSON.stringify(tool.error.details, null, 2)}</pre>
              <div className={styles.errorActions}>
                <button
                  className={styles.retryButton}
                  onClick={(e) => handleRetryClick(e)}
                  disabled={!tool.error.retryable}
                >
                  {tool.error.retryable ? 'Retry' : 'Not retryable'}
                </button>
                <button
                  className={styles.copyErrorButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(
                      JSON.stringify(tool.error, null, 2)
                    );
                  }}
                >
                  Copy Error
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'unavailable' && (
        <div className={styles.unavailableNotice}>
          <span>Executor not registered</span>
        </div>
      )}
    </article>
  );
}