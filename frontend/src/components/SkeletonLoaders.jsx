import React from 'react';

const skeletonStyles = {
  base: {
    background: 'linear-gradient(90deg, var(--bg-tertiary, #f3f4f6) 25%, var(--bg-subtle, #e5e7eb) 50%, var(--bg-tertiary, #f3f4f6) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: '6px',
  },
  circle: {
    borderRadius: '50%',
  },
  rounded: {
    borderRadius: '10px',
  },
  card: {
    borderRadius: '14px',
    background: 'var(--bg-elevated, #ffffff)',
    border: '1px solid var(--border-color, #e5e7eb)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    overflow: 'hidden',
  },
  textLine: {
    height: '16px',
    marginBottom: '8px',
  },
  textLineShort: {
    width: '60%',
  },
  textLineMedium: {
    width: '85%',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
  },
  avatarLarge: {
    width: '56px',
    height: '56px',
    borderRadius: '50%',
  },
  messageBubble: {
    maxWidth: '75%',
    borderRadius: '18px',
    padding: '12px 16px',
  },
  messageBubbleUser: {
    marginLeft: 'auto',
    borderBottomRightRadius: '4px',
  },
  messageBubbleAssistant: {
    marginRight: 'auto',
    borderBottomLeftRadius: '4px',
  },
  inputField: {
    height: '48px',
    borderRadius: '12px',
    width: '100%',
  },
  button: {
    height: '40px',
    borderRadius: '10px',
    width: '120px',
  },
  sidebarItem: {
    height: '44px',
    borderRadius: '10px',
    marginBottom: '4px',
  },
  chatItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    borderRadius: '10px',
  },
  chatAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
  },
  chatText: {
    flex: 1,
  },
  settingsSection: {
    padding: '20px',
    borderBottom: '1px solid var(--border-color, #e5e7eb)',
  },
  settingsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 0',
  },
  settingsLabel: {
    width: '180px',
    height: '16px',
  },
  settingsControl: {
    width: '120px',
    height: '36px',
    borderRadius: '8px',
  },
  markdownHeading: {
    height: '28px',
    marginBottom: '16px',
    marginTop: '24px',
  },
  markdownParagraph: {
    height: '16px',
    marginBottom: '10px',
  },
  markdownCodeBlock: {
    height: '120px',
    borderRadius: '8px',
    marginBottom: '16px',
    background: 'var(--bg-code, #1e1e1e)',
  },
  markdownListItem: {
    height: '16px',
    marginBottom: '6px',
    paddingLeft: '20px',
  },
  imagePlaceholder: {
    aspectRatio: '16/9',
    borderRadius: '12px',
    background: 'var(--bg-tertiary, #f3f4f6)',
  },
};

function Skeleton({ 
  variant = 'text', 
  width, 
  height, 
  className = '', 
  style = {},
  count = 1,
  ...props 
}) {
  const baseStyle = { ...skeletonStyles.base };
  
  const variantStyles = {
    text: skeletonStyles.textLine,
    textShort: { ...skeletonStyles.textLine, ...skeletonStyles.textLineShort },
    textMedium: { ...skeletonStyles.textLine, ...skeletonStyles.textLineMedium },
    circle: skeletonStyles.circle,
    rounded: skeletonStyles.rounded,
    card: skeletonStyles.card,
    avatar: skeletonStyles.avatar,
    avatarLarge: skeletonStyles.avatarLarge,
    messageBubble: skeletonStyles.messageBubble,
    messageBubbleUser: { ...skeletonStyles.messageBubble, ...skeletonStyles.messageBubbleUser },
    messageBubbleAssistant: { ...skeletonStyles.messageBubble, ...skeletonStyles.messageBubbleAssistant },
    inputField: skeletonStyles.inputField,
    button: skeletonStyles.button,
    sidebarItem: skeletonStyles.sidebarItem,
    markdownHeading: skeletonStyles.markdownHeading,
    markdownParagraph: skeletonStyles.markdownParagraph,
    markdownCodeBlock: skeletonStyles.markdownCodeBlock,
    markdownListItem: skeletonStyles.markdownListItem,
    imagePlaceholder: skeletonStyles.imagePlaceholder,
  };

  const skeletons = Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      className={className}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        width: width || (variantStyles[variant].width || '100%'),
        height: height || variantStyles[variant].height,
        ...style,
      }}
      {...props}
    />
  ));

  return count === 1 ? skeletons[0] : <>{skeletons}</>;
}

function MessageSkeleton({ isUser = false, lines = 3, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...props }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {!isUser && (
          <Skeleton variant="avatar" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Skeleton variant={isUser ? 'messageBubbleUser' : 'messageBubbleAssistant'} count={lines} />
        </div>
        {isUser && (
          <Skeleton variant="avatar" />
        )}
      </div>
    </div>
  );
}

function ChatListSkeleton({ count = 5, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...props }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={skeletonStyles.chatItem}>
          <Skeleton variant="chatAvatar" />
          <div style={skeletonStyles.chatText}>
            <Skeleton variant="textMedium" />
            <Skeleton variant="textShort" style={{ marginTop: '6px', height: '13px', color: 'var(--text-muted, #9ca3af)' }} />
          </div>
          <Skeleton variant="circle" width="10px" height="10px" style={{ background: 'var(--accent-color, #3b82f6)' }} />
        </div>
      ))}
    </div>
  );
}

function SettingsSkeleton({ sections = 3, rowsPerSection = 4, ...props }) {
  return (
    <div style={{ ...skeletonStyles.card, ...props }}>
      {Array.from({ length: sections }, (_, s) => (
        <div key={s} style={skeletonStyles.settingsSection}>
          <Skeleton variant="text" width="200px" style={{ marginBottom: '16px' }} />
          {Array.from({ length: rowsPerSection }, (_, r) => (
            <div key={r} style={skeletonStyles.settingsRow}>
              <Skeleton variant="text" style={skeletonStyles.settingsLabel} />
              <Skeleton variant="rounded" style={skeletonStyles.settingsControl} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function MarkdownContentSkeleton({ 
  headings = 2, 
  paragraphsPerHeading = 3, 
  codeBlocks = 1,
  lists = 1,
  listItems = 4,
  ...props 
}) {
  return (
    <div style={{ ...props }}>
      {Array.from({ length: headings }, (_, h) => (
        <React.Fragment key={h}>
          <Skeleton variant="markdownHeading" width={h === 0 ? '30%' : '40%'} />
          {Array.from({ length: paragraphsPerHeading }, (_, p) => (
            <Skeleton key={p} variant="markdownParagraph" width={p === paragraphsPerHeading - 1 ? '70%' : '100%'} />
          ))}
          {h < codeBlocks && (
            <Skeleton variant="markdownCodeBlock" />
          )}
          {h < lists && (
            <div style={{ marginBottom: '16px', paddingLeft: '16px' }}>
              {Array.from({ length: listItems }, (_, l) => (
                <Skeleton key={l} variant="markdownListItem" width='90%' />
              ))}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ChatInterfaceSkeleton({ messageCount = 4, showInput = true, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', ...props }}>
      <MessageSkeleton isUser={false} lines={3} />
      <MessageSkeleton isUser={true} lines={2} />
      <MessageSkeleton isUser={false} lines={4} />
      <MessageSkeleton isUser={true} lines={1} />
      {Array.from({ length: Math.max(0, messageCount - 4) }, (_, i) => (
        <MessageSkeleton key={i} isUser={i % 2 === 0} lines={2 + (i % 3)} />
      ))}
      {showInput && (
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          paddingTop: '16px', 
          borderTop: '1px solid var(--border-color, #e5e7eb)',
          marginTop: 'auto'
        }}>
          <Skeleton variant="inputField" style={{ flex: 1 }} />
          <Skeleton variant="button" />
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton({ ...props }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', padding: '24px', ...props }}>
      <Skeleton variant="card" style={{ padding: '24px', gridColumn: 'span 2' }}>
        <Skeleton variant="text" width="40%" style={{ marginBottom: '16px' }} />
        <Skeleton variant="textMedium" />
        <Skeleton variant="textShort" style={{ marginTop: '12px' }} />
      </Skeleton>
      <Skeleton variant="card" style={{ padding: '24px' }}>
        <Skeleton variant="text" width="50%" style={{ marginBottom: '12px' }} />
        <Skeleton variant="circle" width="80px" height="80px" style={{ margin: '0 auto' }} />
      </Skeleton>
      <Skeleton variant="card" style={{ padding: '24px' }}>
        <Skeleton variant="text" width="50%" style={{ marginBottom: '12px' }} />
        <Skeleton variant="rounded" height="100px" />
      </Skeleton>
      <Skeleton variant="card" style={{ padding: '24px', gridColumn: 'span 2' }}>
        <Skeleton variant="text" width="30%" style={{ marginBottom: '16px' }} />
        <ChatListSkeleton count={4} />
      </Skeleton>
    </div>
  );
}

export { 
  Skeleton, 
  MessageSkeleton, 
  ChatListSkeleton, 
  SettingsSkeleton, 
  MarkdownContentSkeleton,
  ChatInterfaceSkeleton,
  DashboardSkeleton
};
export default Skeleton;