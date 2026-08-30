// Enhanced Input component with integrate Enhance button
// Extends the base Input component with prompt enhancement capabilities

import React from 'react';
import { EnhanceButton } from '../EnhanceButton';
import { enhancePrompt } from '../../enhancePrompt';
import styles from './Input.module.css';

export interface EnhancedInputProps {
  /** Current prompt value */
  value: string;
  /** On change handler */
  onChange: (value: string) => void;
  /** On enhance callback - receives enhanced prompt */
  onEnhance?: (enhanced: string) => void;
  /** Type of enhancement to apply */
  enhanceType?: 'grammar' | 'summarize' | 'professional';
  /** Whether enhance button is disabled */
  isLoading?: boolean;
}

/**
 * EnhancedInput - Input with Enhance button integration
 * 
 * Adds an "Enhance" button next to the input that transforms
 * the current prompt text using the selected enhancement type.
 */
export const EnhancedInput: React.FC<EnhancedInputProps> = ({
  value,
  onChange,
  onEnhance,
  enhanceType = 'grammar',
  isLoading = false
}) => {
  const handleEnhance = async (currentPrompt: string): Promise<string> => {
    if (!currentPrompt.trim()) return currentPrompt;
    const enhanced = enhancePrompt(currentPrompt, enhanceType);
    onChange(enhanced);
    onEnhance?.(enhanced);
    return enhanced;
  };

  return (
    <div className={`${styles.wrapper || ''} ${styles.enhancedWrapper || ''}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a message..."
        className={styles.input}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #ccc',
          borderRadius: '6px',
          fontSize: '0.875rem',
          minHeight: '48px',
          boxSizing: 'border-box'
        }}
      />
      <EnhanceButton
        prompt={value}
        onEnhance={handleEnhance}
        disabled={isLoading}
      />
    </div>
  );
};

EnhancedInput.displayName = 'EnhancedInput';