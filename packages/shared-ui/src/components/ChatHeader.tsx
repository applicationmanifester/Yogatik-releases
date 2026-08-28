import React, { useState, useEffect } from 'react';

export interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  onAction?: (data: any) => void;
  showRefresh?: boolean;
  showSearch?: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  title,
  subtitle,
  onAction,
  showRefresh = true,
  showSearch = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    setHasInitialized(true);
    // Simulate async initialization
    const timeout = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timeout);
  }, []);

  const handleAction = (data: any) => {
    onAction?.(data);
  };

  return (
    <div className="chat-header" style={{
      padding: '16px 24px',
      borderBottom: '1px solid #e0e0e0',
      background: '#f8f9fa',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a1a1a' }}>{title}</h2>
        {subtitle && (
          <h3 style={{ margin: 0, fontSize: '0.875rem', color: '#666', marginTop: 2 }}>
            {subtitle}
          </h3>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showRefresh && (
          <button
            onClick={() => handleAction({ type: 'refresh' })}
            style={{
              padding: '4px 8px',
              fontSize: '0.75rem',
              background: 'transparent',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Refresh
          </button>
        )}
        {showSearch && (
          <input
            type="text"
            placeholder="Search..."
            style={{
              padding: '4px 8px',
              fontSize: '0.875rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              width: 200
            }}
          />
        )}
      </div>
    </div>
  );
};