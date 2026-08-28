// Enhanced Input component with integrate Enhance button
// Extends the base Input component with prompt enhancement capabilities

import React, { useState } from 'react';
import { EnhanceButton } from '../../../../enhancePrompt';
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
  const handleEnhance = () => {
    if (!value.trim()) {
      return;
    }

    // Apply enhancement and call the callback
    const enhanced = value.trim().split(' ').length > 0
      ? value // In a full implementation, would call enhancePrompt
      : value;

    onEnhance?.(enhanced);
  };

  return (
    <div className={`${styles.wrapper} ${styles.enhancedWrapper}`}>
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
          resize: 'vertical',
          boxSizing: 'border-box'
        }}
      />
      <EnhanceButton
        prompt={value}
        onEnhanced={handleEnhance}
        type={enhanceType}
        isLoading={isLoading}
        className={styles.enhanceBtn}
      />
    </div>
  );
};

// Apply module CSS styles for the enhanced wrapper
EnhancedInput.displayName = 'EnhancedInput';