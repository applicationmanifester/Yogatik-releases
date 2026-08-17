/**
 * CategoryFilter - Filter tools by category with counts
 */

import type { ToolCategory } from '@/types/tool';
import styles from './CategoryFilter.module.css';

interface CategoryFilterProps {
  selected: ToolCategory | 'all';
  onChange: (category: ToolCategory | 'all') => void;
  counts: Record<string, { total: number; ready: number; loading: number; failed: number }>;
  className?: string;
}

const CATEGORIES: (ToolCategory | 'all')[] = [
  'all',
  'web',
  'code',
  'media',
  'data',
  'system',
  'ai',
  'utility',
];

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  web: 'Web',
  code: 'Code',
  media: 'Media',
  data: 'Data',
  system: 'System',
  ai: 'AI',
  utility: 'Utility',
};

const CATEGORY_ICONS: Record<string, string> = {
  all: '📦',
  web: '🌐',
  code: '💻',
  media: '🎬',
  data: '📊',
  system: '⚙️',
  ai: '🤖',
  utility: '🔧',
};

export function CategoryFilter({
  selected,
  onChange,
  counts,
  className = '',
}: CategoryFilterProps) {
  return (
    <div className={`${styles.filter} ${className}`} role="group" aria-label="Filter by category">
      {CATEGORIES.map((cat) => {
        const count = counts[cat] || { total: 0, ready: 0, loading: 0, failed: 0 };
        const isSelected = selected === cat;

        return (
          <button
            key={cat}
            className={`${styles.categoryButton} ${isSelected ? styles.selected : ''}`}
            onClick={() => onChange(cat)}
            aria-pressed={isSelected}
            aria-label={`${CATEGORY_LABELS[cat]} (${count.ready}/${count.total} ready)`}
          >
            <span className={styles.icon} aria-hidden="true">
              {CATEGORY_ICONS[cat]}
            </span>
            <span className={styles.label}>{CATEGORY_LABELS[cat]}</span>
            <span className={styles.count}>
              {count.ready}/{count.total}
            </span>
            {count.failed > 0 && (
              <span className={`${styles.badge} ${styles.failed}`} aria-label={`${count.failed} failed`}>
                {count.failed}
              </span>
            )}
            {count.loading > 0 && (
              <span className={`${styles.badge} ${styles.loading}`} aria-label={`${count.loading} loading`}>
                {count.loading}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}