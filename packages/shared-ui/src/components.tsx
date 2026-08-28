import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline';
}

export const Button: React.FC<ButtonProps> = ({ children, variant = 'primary', className = '', style, ...props }) => {
  return (
    <button className={`btn btn-${variant} ${className}`} style={style} {...props}>
      {children}
    </button>
  );
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export const Card: React.FC<CardProps> = ({ children, className = '', style, ...props }) => {
  return (
    <div className={`card ${className}`} style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', ...style }} {...props}>
      {children}
    </div>
  );
};

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}

export const Heading: React.FC<HeadingProps> = ({ level = 1, children, className = '', style, ...props }) => {
  const Tag = `h${level}` as keyof JSX.IntrinsicElements;
  return React.createElement(Tag, { className: `heading heading-${level} ${className}`, style, ...props }, children);
};

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const Text: React.FC<TextProps> = ({ children, className = '', style, ...props }) => {
  return (
    <p className={`text ${className}`} style={style} {...props}>
      {children}
    </p>
  );
};

// Modal
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
  taskState?: import('./Modal').ModalTaskState;
}

export const Modal: React.FC<ModalProps> = (props) => {
  return import('./components/Modal').then(mod => mod.default(props));
};

// ChatHeader
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

// ChatMessage
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