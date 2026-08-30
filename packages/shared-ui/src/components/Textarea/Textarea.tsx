import { useState, forwardRef, type TextareaHTMLAttributes, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  minRows?: number;
  maxRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, fullWidth = false, minRows = 3, maxRows = 10, className = '', id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    const [rows, setRows] = useState(minRows);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const lines = e.target.value.split('\n').length;
      setRows(Math.min(Math.max(lines, minRows), maxRows));
      props.onChange?.(e);
    };

    return (
      <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
        {label && (
          <label htmlFor={textareaId} className={styles.label}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`${styles.textarea} ${error ? styles.error : ''}`}
          rows={rows}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          onChange={handleChange}
          {...props}
        />
        {error && (
          <span id={`${textareaId}-error`} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${textareaId}-helper`} className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea as ForwardRefExoticComponent<TextareaProps & RefAttributes<HTMLTextAreaElement>>;