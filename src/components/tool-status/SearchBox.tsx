/**
 * SearchBox - Accessible search input with debouncing
 */

import { useMemo, useCallback } from 'react';
import styles from './SearchBox.module.css';

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  'aria-label': ariaLabel = 'Search',
}: SearchBoxProps) {
  // Debounce the onChange to avoid excessive re-renders
  const debouncedOnChange = useMemo(
    () => {
      let timeoutId: ReturnType<typeof setTimeout>;
      return (val: string) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => onChange(val), 150);
      };
    },
    [onChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedOnChange(e.target.value);
    },
    [debouncedOnChange]
  );

  return (
    <div className={`${styles.searchBox} ${className}`}>
      <label htmlFor="tool-search" className={styles.visuallyHidden}>
        {ariaLabel}
      </label>
      <svg className={styles.searchIcon} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        id="tool-search"
        type="search"
        className={styles.input}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {value && (
        <button
          className={styles.clearButton}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}