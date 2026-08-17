/**
 * ToolStatusBadge - Compact status indicator for a single tool
 */

import type { ToolDefinition, ToolStatus } from '@/types/tool';
import styles from './ToolStatusBadge.module.css';

interface ToolStatusBadgeProps {
  tool: ToolDefinition & { status: ToolStatus; error?: any; progress?: number };
  onClick?: () => void;
  showError?: boolean;
  className?: string;
}

const STATUS_LABELS: Record<ToolStatus, string> = {
  ready: 'Ready',
  loading: 'Loading',
  failed: 'Failed',
  unavailable: 'Unavailable',
};

export function ToolStatusBadge({
  tool,
  onClick,
  showError = false,
  className = '',
}: ToolStatusBadgeProps) {
  const status = tool.status;
  const isInteractive = onClick && status === 'failed';

  return (
    <div
      className={`${styles.badge} ${styles[status]} ${className}`}
      onClick={onClick}
      role={isInteractive ? 'button' : 'status'}
      tabIndex={isInteractive ? 0 : -1}
      aria-label={`${tool.name}: ${STATUS_LABELS[status]}`}
      aria-expanded={showError}
      onKeyDown={(e) => {
        if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <span className={styles.icon} aria-hidden="true">
        {status === 'ready' && '✓'}
        {status === 'loading' && '⟳'}
        {status === 'failed' && '✕'}
        {status === 'unavailable' && '○'}
      </span>
      <span className={styles.name}>{tool.name}</span>
      {tool.progress !== undefined && tool.progress > 0 && tool.progress < 100 && (
        <span className={styles.progress} aria-label={`Progress: ${tool.progress}%`}>
          {tool.progress}%
        </span>
      )}
      {showError && tool.error && (
        <div className={styles.errorTooltip} role="tooltip">
          <strong>{tool.error.code}</strong>: {tool.error.message}
        </div>
      )}
    </div>
  );
}