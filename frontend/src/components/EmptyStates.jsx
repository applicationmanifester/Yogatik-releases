import React from 'react';
import { 
  MessageSquare, 
  Search, 
  FileText, 
  Settings, 
  WifiOff, 
  AlertCircle,
  Loader2,
  Smile,
  Zap,
  Sparkles
} from 'lucide-react';

const emptyStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    textAlign: 'center',
    minHeight: '300px',
  },
  illustration: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    position: 'relative',
  },
  illustrationBg: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    opacity: 0.15,
  },
  icon: {
    width: '56px',
    height: '56px',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: '22px',
    fontWeight: 600,
    color: 'var(--text-primary, #111827)',
    marginBottom: '8px',
  },
  description: {
    fontSize: '15px',
    color: 'var(--text-secondary, #6b7280)',
    maxWidth: '360px',
    lineHeight: 1.6,
    marginBottom: '28px',
  },
  actionGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '12px 24px',
    background: 'var(--accent-color, #3b82f6)',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.15s',
  },
  secondaryButton: {
    padding: '12px 24px',
    background: 'var(--bg-input, #ffffff)',
    color: 'var(--text-primary, #111827)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.15s',
  },
  secondaryContent: {
    marginTop: '24px',
    paddingTop: '24px',
    borderTop: '1px solid var(--border-color, #e5e7eb)',
    width: '100%',
    maxWidth: '360px',
  },
  suggestionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-muted, #9ca3af)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '12px',
  },
  suggestionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '8px',
  },
  suggestionCard: {
    padding: '14px 16px',
    background: 'var(--bg-subtle, #f9fafb)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    textAlign: 'left',
  },
  suggestionIcon: {
    width: '20px',
    height: '20px',
    color: 'var(--accent-color, #3b82f6)',
    marginBottom: '8px',
  },
  suggestionLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--text-primary, #111827)',
  },
  suggestionDesc: {
    fontSize: '11px',
    color: 'var(--text-secondary, #6b7280)',
    marginTop: '4px',
  },
  animatedBlob: {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(60px)',
    opacity: 0.4,
    animation: 'float 6s ease-in-out infinite',
  },
};

const EmptyStatePresets = {
  noChats: {
    title: 'No conversations yet',
    description: 'Start a new chat to begin your journey. Ask questions, brainstorm ideas, or just explore.',
    illustration: <MessageSquare size={56} />,
    bgColor: 'var(--accent-color, #3b82f6)',
    primaryAction: { label: 'New Chat', icon: <MessageSquare size={16} />, onClick: () => {} },
    secondaryAction: { label: 'View Examples', icon: <Sparkles size={16} />, onClick: () => {} },
    suggestions: [
      { icon: <Zap size={20} />, label: 'Explain a concept', desc: 'Learn something new' },
      { icon: <FileText size={20} />, label: 'Write code', desc: 'Generate snippets' },
      { icon: <Smile size={20} />, label: 'Creative writing', desc: 'Stories, poems, emails' },
      { icon: <Settings size={20} />, label: 'Plan & organize', desc: 'Tasks, schedules, ideas' },
    ],
  },
  noResults: {
    title: 'No results found',
    description: 'Your search didn\'t match any conversations. Try different keywords or clear filters.',
    illustration: <Search size={56} />,
    bgColor: 'var(--warning-color, #f59e0b)',
    primaryAction: { label: 'Clear Filters', icon: <Search size={16} />, onClick: () => {} },
    secondaryAction: { label: 'New Search', icon: <Sparkles size={16} />, onClick: () => {} },
    suggestions: [
      { icon: <MessageSquare size={20} />, label: 'Recent chats', desc: 'Last 5 conversations' },
      { icon: <FileText size={20} />, label: 'By date', desc: 'Filter by time range' },
      { icon: <Settings size={20} />, label: 'By model', desc: 'Filter by AI model' },
    ],
  },
  noMessages: {
    title: 'Empty conversation',
    description: 'This chat has no messages yet. Send your first message to get started.',
    illustration: <MessageSquare size={56} />,
    bgColor: 'var(--accent-color, #3b82f6)',
    primaryAction: { label: 'Send Message', icon: <Zap size={16} />, onClick: () => {} },
    suggestions: [
      { icon: <Zap size={20} />, label: 'Ask a question', desc: 'Get instant answers' },
      { icon: <FileText size={20} />, label: 'Analyze text', desc: 'Summarize, edit, improve' },
      { icon: <Smile size={20} />, label: 'Brainstorm ideas', desc: 'Creative collaboration' },
    ],
  },
  offline: {
    title: 'You\'re offline',
    description: 'No internet connection detected. Some features may be unavailable until you\'re back online.',
    illustration: <WifiOff size={56} />,
    bgColor: 'var(--error-color, #ef4444)',
    primaryAction: { label: 'Retry Connection', icon: <Loader2 size={16} />, onClick: () => {} },
    suggestions: [
      { icon: <FileText size={20} />, label: 'View cached chats', desc: 'Access offline history' },
      { icon: <Settings size={20} />, label: 'Manage offline data', desc: 'Storage settings' },
    ],
  },
  error: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    illustration: <AlertCircle size={56} />,
    bgColor: 'var(--error-color, #ef4444)',
    primaryAction: { label: 'Try Again', icon: <Loader2 size={16} />, onClick: () => {} },
    secondaryAction: { label: 'Report Issue', icon: <Settings size={16} />, onClick: () => {} },
  },
  loading: {
    title: 'Loading...',
    description: 'Please wait while we fetch your data.',
    illustration: <Loader2 size={56} />,
    bgColor: 'var(--accent-color, #3b82f6)',
    animated: true,
  },
};

function EmptyState({ 
  preset, 
  title, 
  description, 
  illustration, 
  bgColor,
  primaryAction, 
  secondaryAction, 
  suggestions = [],
  className = '',
  style = {},
  animated = false,
  ...props 
}) {
  const config = preset ? EmptyStatePresets[preset] : {};
  
  const finalTitle = title || config.title;
  const finalDescription = description || config.description;
  const finalIllustration = illustration || config.illustration;
  const finalBgColor = bgColor || config.bgColor;
  const finalPrimaryAction = primaryAction || config.primaryAction;
  const finalSecondaryAction = secondaryAction || config.secondaryAction;
  const finalSuggestions = suggestions.length > 0 ? suggestions : (config.suggestions || []);
  const finalAnimated = animated || config.animated;

  return (
    <div 
      className={className}
      style={{ ...emptyStyles.container, ...style }}
      {...props}
    >
      <div style={emptyStyles.illustration}>
        {finalAnimated && (
          <>
            <div style={{ ...emptyStyles.animatedBlob, width: '200px', height: '200px', background: finalBgColor, top: '-40px', left: '-40px', animationDelay: '0s' }} />
            <div style={{ ...emptyStyles.animatedBlob, width: '150px', height: '150px', background: finalBgColor, bottom: '-30px', right: '-30px', animationDelay: '-2s' }} />
            <div style={{ ...emptyStyles.animatedBlob, width: '100px', height: '100px', background: finalBgColor, top: '20px', right: '-20px', animationDelay: '-4s' }} />
          </>
        )}
        <div style={{ ...emptyStyles.illustrationBg, background: finalBgColor }} />
        <div style={{ ...emptyStyles.icon, color: finalBgColor }}>
          {finalIllustration}
        </div>
      </div>

      {finalTitle && <h3 style={emptyStyles.title}>{finalTitle}</h3>}
      {finalDescription && <p style={emptyStyles.description}>{finalDescription}</p>}

      {(finalPrimaryAction || finalSecondaryAction) && (
        <div style={emptyStyles.actionGroup}>
          {finalSecondaryAction && (
            <button
              style={emptyStyles.secondaryButton}
              onClick={finalSecondaryAction.onClick}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-subtle, #f9fafb)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-input, #ffffff)'}
            >
              {finalSecondaryAction.icon}
              {finalSecondaryAction.label}
            </button>
          )}
          {finalPrimaryAction && (
            <button
              style={emptyStyles.primaryButton}
              onClick={finalPrimaryAction.onClick}
              onMouseEnter={(e) => e.currentTarget.style.opacity = 0.9}
              onMouseLeave={(e) => e.currentTarget.style.opacity = 1}
            >
              {finalPrimaryAction.icon}
              {finalPrimaryAction.label}
            </button>
          )}
        </div>
      )}

      {finalSuggestions.length > 0 && (
        <div style={emptyStyles.secondaryContent}>
          <div style={emptyStyles.suggestionTitle}>Try asking</div>
          <div style={emptyStyles.suggestionGrid}>
            {finalSuggestions.map((s, i) => (
              <button
                key={i}
                style={emptyStyles.suggestionCard}
                onClick={s.onClick}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--bg-input, #ffffff)';
                  e.currentTarget.style.borderColor = 'var(--accent-color, #3b82f6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-subtle, #f9fafb)';
                  e.currentTarget.style.borderColor = 'var(--border-color, #e5e7eb)';
                }}
              >
                <div style={emptyStyles.suggestionIcon}>{s.icon}</div>
                <div style={emptyStyles.suggestionLabel}>{s.label}</div>
                {s.desc && <div style={emptyStyles.suggestionDesc}>{s.desc}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { EmptyState, EmptyStatePresets };
export default EmptyState;