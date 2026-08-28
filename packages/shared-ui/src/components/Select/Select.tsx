import { forwardRef, type SelectHTMLAttributes, type ForwardRefExoticComponent, type RefAttributes } from 'react';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, fullWidth = false, options, placeholder, className = '', id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
        {label && (
          <label htmlFor={selectId} className={styles.label}>
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`${styles.select} ${error ? styles.error : ''}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : helperText ? `${selectId}-helper` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <span id={`${selectId}-error`} className={styles.errorText} role="alert">
            {error}
          </span>
        )}
        {helperText && !error && (
          <span id={`${selectId}-helper`} className={styles.helperText}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select as ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLSelectElement>>;