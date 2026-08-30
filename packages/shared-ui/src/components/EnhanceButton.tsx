import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../useToast';

interface EnhanceButtonProps {
  onEnhance: (prompt: string) => Promise<string>;
  prompt: string;
  disabled?: boolean;
}

export function EnhanceButton({ onEnhance, prompt, disabled = false }: EnhanceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [options, setOptions] = useState({
    context: true,
    clarity: true,
    constraints: false,
  });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { show } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setShowTooltip(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEnhance = async () => {
    if (disabled || isLoading || !prompt.trim()) return;

    setIsLoading(true);
    setShowTooltip(false);

    try {
      const enhanced = await onEnhance(prompt);
      show('Your prompt has been enhanced successfully.', { type: 'success' });
      return enhanced;
    } catch (error) {
      show(error instanceof Error ? error.message : 'Failed to enhance prompt', { type: 'error' });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        onClick={handleEnhance}
        disabled={disabled || isLoading || !prompt.trim()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: disabled || isLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
          opacity: disabled || isLoading || !prompt.trim() ? 0.6 : 1,
          fontSize: '14px',
          fontWeight: 500,
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
        }}
        onMouseEnter={(e) => {
          if (!disabled && !isLoading && prompt.trim()) {
            e.currentTarget.style.backgroundColor = '#2563eb';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#3b82f6';
          e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.3)';
        }}
      >
        {isLoading ? (
          <>
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }} />
            <span>Enhancing...</span>
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3v12M12 3l4 4M12 3l-4 4M8 15h8M8 19h8" />
            </svg>
            Enhance
          </>
        )}
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowTooltip(!showTooltip);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          backgroundColor: 'transparent',
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          cursor: 'pointer',
          color: '#6b7280',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#f3f4f6';
          e.currentTarget.style.borderColor = '#d1d5db';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.borderColor = '#e5e7eb';
        }}
        aria-label="Enhancement options"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>

      {showTooltip && (
        <div
          ref={tooltipRef}
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            padding: '8px',
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
            zIndex: 50,
            minWidth: '200px',
          }}
        >
          <div style={{ padding: '8px', fontSize: '13px', color: '#374151' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', color: '#111827' }}>
              Enhancement Options
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.context}
                  onChange={e => setOptions(prev => ({ ...prev, context: e.target.checked }))}
                />
                <span>Add context & examples</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.clarity}
                  onChange={e => setOptions(prev => ({ ...prev, clarity: e.target.checked }))}
                />
                <span>Improve clarity & structure</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={options.constraints}
                  onChange={e => setOptions(prev => ({ ...prev, constraints: e.target.checked }))}
                />
                <span>Add constraints & requirements</span>
              </label>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}