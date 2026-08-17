import React, { useEffect, useRef } from 'react';
import type { ToolError } from '@/types/tool';
import './ToolErrorDetails.css';

interface ToolErrorDetailsProps {
  error: ToolError;
  onDismiss: () => void;
  onRetry?: () => void;
}

export const ToolErrorDetails: React.FC<ToolErrorDetailsProps> = ({
  error,
  onDismiss,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    containerRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
      if (e.key === 'Tab') {
        const focusableElements = containerRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusableElements || focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          if (last) last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          if (first) first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    };
  }, [onDismiss]);

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const copyError = () => {
    const errorText = `
Error: ${error.code}
Message: ${error.message}
Timestamp: ${formatTimestamp(error.timestamp)}
Recoverable: ${error.recoverable ? 'Yes' : 'No'}
Correlation ID: ${error.correlationId ?? 'N/A'}
Details: ${JSON.stringify(error.details, null, 2)}
    `.trim();
    navigator.clipboard.writeText(errorText);
  };

  return (
    <div
      ref={containerRef}
      className="tool-error-details"
      role="alertdialog"
      aria-labelledby="error-title"
      aria-describedby="error-message"
      tabIndex={-1}
    >
      <div className="error-header">
        <h3 id="error-title" className="error-title">
          <span className="error-icon" aria-hidden="true">⚠</span>
          Tool Error: {error.code}
        </h3>
        <button
          className="error-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ×
        </button>
      </div>

      <div id="error-message" className="error-body">
        <p className="error-message">{error.message}</p>

        <dl className="error-meta">
          <dt>Timestamp</dt>
          <dd>{formatTimestamp(error.timestamp)}</dd>

          <dt>Recoverable</dt>
          <dd className={error.recoverable ? 'recoverable' : 'not-recoverable'}>
            {error.recoverable ? 'Yes' : 'No'}
          </dd>

          {error.correlationId && (
            <>
              <dt>Correlation ID</dt>
              <dd className="correlation-id">{error.correlationId}</dd>
            </>
          )}

          {error.details && Object.keys(error.details).length > 0 && (
            <>
              <dt>Details</dt>
              <dd>
                <pre className="error-details">{JSON.stringify(error.details, null, 2)}</pre>
              </dd>
            </>
          )}
        </dl>
      </div>

      <div className="error-actions">
        <button className="btn-copy" onClick={copyError}>
          Copy Error
        </button>
        {onRetry && error.recoverable && (
          <button className="btn-retry" onClick={onRetry}>
            Retry
          </button>
        )}
        <button className="btn-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
};