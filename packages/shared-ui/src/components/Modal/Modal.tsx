import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

export interface ModalTaskState {
  /** Current progress 0-100 */
  progress: number;
  /** Whether task is in progress */
  isLoading: boolean;
  /** Error message if task failed */
  error?: string;
  /** Success message if task completed */
  success?: string;
  /** Callback when task completes */
  onComplete?: (success: boolean) => void;
  /** Optional timeout in ms */
  timeout?: number;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  /** Optional task state for async operations */
  taskState?: ModalTaskState;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = '',
  taskState,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [localTaskState, setLocalTaskState] = useState<ModalTaskState>({
    progress: 0,
    isLoading: false,
  });

  // Merge taskState prop with local state (prop takes precedence when provided)
  const task = taskState || localTaskState;

  const trapFocus = useCallback((e: KeyboardEvent) => {
    const focusableElements = contentRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusableElements?.length) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement?.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement?.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      contentRef.current?.focus();

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEscape) {
          onClose();
        }
        if (e.key === 'Tab') {
          trapFocus(e);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, closeOnEscape, onClose, trapFocus]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === overlayRef.current) {
      onClose();
    }
  };

  // Handle task state updates and auto-close on completion
  useEffect(() => {
    if (!task.isLoading) return;

    // If there's a timeout, set up auto-completion
    let timeoutId: NodeJS.Timeout;
    if (task.timeout && task.timeout > 0) {
      timeoutId = setTimeout(() => {
        setLocalTaskState(prev => ({
          ...prev,
          progress: 100,
          isLoading: false,
          success: 'Task completed automatically',
        }));
      }, task.timeout);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [task.isLoading, task.timeout]);

  useEffect(() => {
    // When task completes (isLoading becomes false with progress 100)
    if (!task.isLoading && task.progress >= 100) {
      const success = !task.error;
      const timer = setTimeout(() => {
        setLocalTaskState({
          progress: 0,
          isLoading: false,
          error: undefined,
          success: success ? 'Task completed successfully' : task.error,
        });
        task.onComplete?.(success);
      }, 0);

      // Auto-close after a brief delay unless user interaction is needed
      const closeTimer = setTimeout(() => {
        onClose();
      }, 1500);

      return () => {
        clearTimeout(timer);
        clearTimeout(closeTimer);
      };
    }
  }, [task.isLoading, task.progress, task.error, task.onComplete, onClose]);

  // Determine if we should show task UI
  const showTaskUI = task.isLoading || task.progress > 0 || task.error || task.success;

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      className={`${styles.overlay} ${styles.open}`}
      onClick={handleOverlayClick}
      role="presentation"
    >
      <div
        ref={contentRef}
        className={`${styles.content} ${styles[size]} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
      >
        {(title || showCloseButton) && (
          <div className={styles.header}>
            {title && <h2 id="modal-title" className={styles.title}>{title}</h2>}
            {showCloseButton && (
              <button
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Close modal"
                type="button"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div className={styles.body}>
          {showTaskUI && (
            <div className={styles.taskIndicator}>
              {task.isLoading && (
                <div className="flex items-center gap-2 mb-2">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>Processing...</span>
                </div>
              )}

              {task.progress > 0 && task.progress < 100 && (
                <div className="w-full bg-gray-200 rounded-h full-h">
                  <div
                    className={`bg-primary rounded-h h-2 rounded transition-all duration-500 ease-in-out`}
                    style={{ width: `${task.progress}%` }}
                  ></div>
                </div>
              )}

              {task.error && (
                <div className="mt-2 p-3 bg-red-100 text-red-800 rounded border border-red-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="18" r="18" />
                    <line x1="18" y1="6" x2="18" y2="6" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="6" y2="6" />
                  </svg>
                  <span>{task.error}</span>
                </div>
              )}

              {task.success && (
                <div className="mt-2 p-3 bg-green-100 text-green-800 rounded border border-green-200">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{task.success}</span>
                </div>
              )}
            </div>
          )}

          <div className={styles.contentInner}>{children}</div>
        </div>

        {task.isLoading && task.progress >= 100 && (
          <div className={styles.footer}>
            <button
              className="btn btn-primary"
              onClick={onClose}
              aria-label="Close"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default Modal;