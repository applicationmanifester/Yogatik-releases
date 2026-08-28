import React from 'react';

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: {
    processingTime?: number;
    model?: string;
    tokens?: number;
  };
  className?: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  role,
  content,
  timestamp = new Date(),
  metadata,
  className
}) => {
  const isUser = role === 'user';
  const timestampStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`chat-message ${isUser ? 'user-message' : 'assistant-message'} ${className || ''}`} style={{
      maxWidth: isUser ? '75%' : '85%',
      marginBottom: '12px',
      padding: '12px 16px',
      borderRadius: '16px',
      fontSize: '0.875rem',
      lineHeight: '1.5',
      position: 'relative',
      wordBreak: 'break-word'
    }}>
      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>
        {role.charAt(0).toUpperCase() + role.slice(1)} • {timestampStr}
      </div>
      <div dangerouslySetInnerHTML={{ __html: content }} />
      {metadata && (
        <div style={{
          marginTop: '4px',
          fontSize: '0.65rem',
          color: '#888',
          display: 'flex',
          gap: '8px'
        }}>
          {metadata.processingTime && (
            <span>• {metadata.processingTime}ms processing</span>
          )}
          {metadata.model && (
            <span>• {metadata.model}</span>
          )}
          {metadata.tokens && (
            <span>• {metadata.tokens} tokens</span>
          )}
        </div>
      )}
    </div>
  );
};