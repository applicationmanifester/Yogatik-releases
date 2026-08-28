import React from 'react';
import { 
  MessageSquare, 
  Search, 
  FileText, 
  FolderOpen, 
  CloudOff, 
  WifiOff,
  AlertTriangle,
  RefreshCw,
  Shield,
  Database,
  Zap,
  Sparkles,
  HelpCircle,
  Link,
  Lock,
  User,
  Settings,
  Image,
  Video,
  Music,
  Code,
  Globe,
  Mail,
  Bell,
  Trash2,
  Archive,
  Star,
  Flag,
  Filter,
  Eye,
  EyeOff,
  Copy,
  Download,
  Upload,
  Share2,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
  Plus,
  Minus,
  X,
  Check,
  Loader2,
  Home,
  Menu,
  Sun,
  Moon,
  Monitor,
  Layout,
  Grid,
  List,
  Calendar,
  Clock,
  MapPin,
  Heart,
  Bookmark,
  Tag,
  Layers,
  Box,
  Cube,
  Package,
  Server,
  HardDrive,
  Cpu,
  MemoryStick,
  Wifi,
  Bluetooth,
  Usb,
  Smartphone,
  Tablet,
  Laptop,
  Desktop,
  Printer,
  Camera,
  Mic,
  Speaker,
  Headphones,
  Volume2,
  VolumeX,
  Brightness,
  Contrast,
  Palette,
  Brush,
  PenTool,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Justify,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code as CodeIcon,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  List as ListIcon,
  CheckSquare,
  Square,
  MinusSquare,
  PlusSquare,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CornerUpLeft,
  CornerDownRight,
  Maximize,
  Minimize,
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  Crop,
  ZoomIn,
  ZoomOut,
  Move,
  Resize,
  Select,
  Hand,
  Eraser,
  Eyedropper,
  Fill,
  Gradient,
  Shadow,
  Blur,
  Noise,
  Grain,
  Vignette,
  Frame,
  Border,
  Radius,
  Opacity,
  Blend,
  Mask,
  ClipPath,
  Filter as FilterIcon,
  Adjustments,
  Levels,
  Curves,
  Exposure,
  Contrast as ContrastIcon,
  Saturation,
  Vibrance,
  Temperature,
  Tint,
  Sharpen,
  Blur as BlurIcon,
  Noise as NoiseIcon,
  Grain as GrainIcon,
  Vignette as VignetteIcon,
} from 'lucide-react';

const emptyStateStyles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 24px',
    textAlign: 'center',
    minHeight: '200px',
    width: '100%',
  },
  iconWrapper: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    background: 'var(--accent-bg, #eff6ff)',
    color: 'var(--accent-color, #3b82f6)',
    flexShrink: 0,
  },
  icon: {
    width: '40px',
    height: '40px',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: 'var(--text-primary, #111827)',
    marginBottom: '8px',
    lineHeight: '1.3',
  },
  description: {
    fontSize: '14px',
    color: 'var(--text-secondary, #6b7280)',
    maxWidth: '360px',
    lineHeight: '1.6',
    marginBottom: '24px',
  },
  actionGroup: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--btn-primary-text, #ffffff)',
    background: 'var(--accent-color, #3b82f6)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  secondaryButton: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary, #111827)',
    background: 'var(--bg-input, #ffffff)',
    border: '1px solid var(--border-color, #e5e7eb)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  illustration: {
    width: '160px',
    height: '160px',
    marginBottom: '24px',
    opacity: 0.6,
  },
  compact: {
    padding: '32px 16px',
    minHeight: 'auto',
  },
  compactIcon: {
    width: '56px',
    height: '56px',
    marginBottom: '16px',
  },
  compactTitle: {
    fontSize: '16px',
    marginBottom: '6px',
  },
  compactDesc: {
    fontSize: '13px',
    marginBottom: '16px',
  },
};

const presetIcons = {
  // Chat / Messaging
  noConversations: MessageSquare,
  noMessages: MessageSquare,
  emptyChat: MessageSquare,
  
  // Search / Discovery
  noResults: Search,
  noMatches: Search,
  emptySearch: Search,
  
  // Files / Documents
  noFiles: FileText,
  noDocuments: FileText,
  emptyFolder: FolderOpen,
  noProjects: FolderOpen,
  
  // Network / Connection
  offline: CloudOff,
  noConnection: WifiOff,
  disconnected: WifiOff,
  
  // Errors / Problems
  error: AlertTriangle,
  somethingWrong: AlertTriangle,
  failed: AlertTriangle,
  
  // Data / Storage
  noData: Database,
  emptyDatabase: Database,
  noRecords: Database,
  
  // Security / Auth
  unauthorized: Lock,
  noPermission: Shield,
  locked: Lock,
  
  // User / Account
  noProfile: User,
  notLoggedIn: User,
  anonymous: User,
  
  // Settings / Config
  noSettings: Settings,
  defaultSettings: Settings,
  
  // Media
  noImages: Image,
  noVideos: Video,
  noAudio: Music,
  noCode: Code,
  
  // Communication
  noEmails: Mail,
  noNotifications: Bell,
  noLinks: Link,
  
  // Actions
  deleted: Trash2,
  archived: Archive,
  starred: Star,
  flagged: Flag,
  
  // Views
  filtered: Filter,
  hidden: EyeOff,
  visible: Eye,
  
  // AI / Smart
  noSuggestions: Sparkles,
  noInsights: Zap,
  emptyState: HelpCircle,
  
  // Generic
  empty: HelpCircle,
  loading: Loader2,
  home: Home,
  menu: Menu,
};

const presetConfigs = {
  noConversations: {
    title: 'No conversations yet',
    description: 'Start a new chat to begin your first conversation with the AI assistant.',
    action: { label: 'New Chat', icon: Plus },
  },
  noMessages: {
    title: 'No messages in this conversation',
    description: 'Send a message to start chatting.',
    action: { label: 'Send a message', icon: ArrowRight },
  },
  emptyChat: {
    title: 'Welcome to your new chat',
    description: 'Type a message or use the command palette (⌘K) to get started.',
    action: { label: 'Try a prompt', icon: Sparkles },
  },
  noResults: {
    title: 'No results found',
    description: 'Try adjusting your search terms or filters to find what you\'re looking for.',
    action: { label: 'Clear filters', icon: Filter },
  },
  noMatches: {
    title: 'No matches found',
    description: 'Your search didn\'t match any items. Try different keywords.',
    action: { label: 'Search again', icon: Search },
  },
  emptySearch: {
    title: 'Search your conversations',
    description: 'Type to find messages, files, or topics across all your chats.',
    action: null,
  },
  noFiles: {
    title: 'No files uploaded',
    description: 'Drag and drop files here or click to browse.',
    action: { label: 'Upload files', icon: Upload },
  },
  noDocuments: {
    title: 'No documents yet',
    description: 'Create or import documents to get started.',
    action: { label: 'Create document', icon: Plus },
  },
  emptyFolder: {
    title: 'This folder is empty',
    description: 'Add files or create subfolders to organize your work.',
    action: { label: 'Add files', icon: Plus },
  },
  noProjects: {
    title: 'No projects created',
    description: 'Start a new project to organize your work.',
    action: { label: 'New project', icon: Plus },
  },
  offline: {
    title: 'You\'re offline',
    description: 'Check your internet connection and try again.',
    action: { label: 'Retry', icon: RefreshCw },
  },
  noConnection: {
    title: 'Connection lost',
    description: 'Unable to reach the server. Please check your network.',
    action: { label: 'Reconnect', icon: Wifi },
  },
  disconnected: {
    title: 'Disconnected from server',
    description: 'Real-time features are unavailable. Attempting to reconnect...',
    action: { label: 'Retry now', icon: RefreshCw },
  },
  error: {
    title: 'Something went wrong',
    description: 'An unexpected error occurred. Please try again or contact support.',
    action: { label: 'Try again', icon: RefreshCw },
    secondaryAction: { label: 'Report issue', icon: AlertTriangle },
  },
  somethingWrong: {
    title: 'Something went wrong',
    description: 'We couldn\'t load the data. Please refresh the page.',
    action: { label: 'Refresh', icon: RefreshCw },
  },
  failed: {
    title: 'Operation failed',
    description: 'The requested action could not be completed.',
    action: { label: 'Retry', icon: RefreshCw },
  },
  noData: {
    title: 'No data available',
    description: 'There\'s nothing to display here yet.',
    action: null,
  },
  emptyDatabase: {
    title: 'Database is empty',
    description: 'No records have been created yet.',
    action: { label: 'Add record', icon: Plus },
  },
  noRecords: {
    title: 'No records found',
    description: 'Try adjusting your filters or create a new record.',
    action: { label: 'New record', icon: Plus },
  },
  unauthorized: {
    title: 'Access denied',
    description: 'You don\'t have permission to view this content.',
    action: { label: 'Request access', icon: Lock },
  },
  noPermission: {
    title: 'Insufficient permissions',
    description: 'This feature requires elevated privileges.',
    action: { label: 'Contact admin', icon: Shield },
  },
  locked: {
    title: 'Content is locked',
    description: 'This item is protected and cannot be accessed.',
    action: null,
  },
  noProfile: {
    title: 'No profile found',
    description: 'Complete your profile to personalize your experience.',
    action: { label: 'Edit profile', icon: User },
  },
  notLoggedIn: {
    title: 'Please sign in',
    description: 'Sign in to access your conversations and settings.',
    action: { label: 'Sign in', icon: User },
  },
  anonymous: {
    title: 'Anonymous session',
    description: 'Your data won\'t be saved. Sign in to persist conversations.',
    action: { label: 'Sign in', icon: User },
  },
  noSettings: {
    title: 'No settings configured',
    description: 'Default settings are applied. Customize as needed.',
    action: { label: 'Open settings', icon: Settings },
  },
  defaultSettings: {
    title: 'Using default settings',
    description: 'All settings are at their default values.',
    action: { label: 'Customize', icon: Settings },
  },
  noImages: {
    title: 'No images yet',
    description: 'Upload or generate images to see them here.',
    action: { label: 'Add images', icon: Plus },
  },
  noVideos: {
    title: 'No videos',
    description: 'Add video files to your library.',
    action: { label: 'Upload video', icon: Plus },
  },
  noAudio: {
    title: 'No audio files',
    description: 'Upload music, podcasts, or recordings.',
    action: { label: 'Add audio', icon: Plus },
  },
  noCode: {
    title: 'No code snippets',
    description: 'Save code snippets for quick reference.',
    action: { label: 'Add snippet', icon: Plus },
  },
  noEmails: {
    title: 'No emails',
    description: 'Your inbox is empty. Enjoy the peace!',
    action: null,
  },
  noNotifications: {
    title: 'No notifications',
    description: 'You\'re all caught up!',
    action: null,
  },
  noLinks: {
    title: 'No links saved',
    description: 'Save links to reference later.',
    action: { label: 'Add link', icon: Plus },
  },
  deleted: {
    title: 'Moved to trash',
    description: 'Items in trash will be permanently deleted after 30 days.',
    action: { label: 'View trash', icon: Trash2 },
  },
  archived: {
    title: 'Archived items',
    description: 'Archived content is hidden from your main view.',
    action: { label: 'View archive', icon: Archive },
  },
  starred: {
    title: 'No starred items',
    description: 'Star important conversations to find them quickly.',
    action: null,
  },
  flagged: {
    title: 'No flagged items',
    description: 'Flag items that need your attention.',
    action: null,
  },
  filtered: {
    title: 'No items match your filters',
    description: 'Try clearing or adjusting your filters.',
    action: { label: 'Clear filters', icon: Filter },
  },
  hidden: {
    title: 'Content hidden',
    description: 'This content has been hidden from view.',
    action: { label: 'Show hidden', icon: Eye },
  },
  visible: {
    title: 'All items visible',
    description: 'No filters are currently applied.',
    action: null,
  },
  noSuggestions: {
    title: 'No suggestions available',
    description: 'AI suggestions will appear here based on your activity.',
    action: null,
  },
  noInsights: {
    title: 'No insights yet',
    description: 'Insights will be generated as you use the app.',
    action: null,
  },
  emptyState: {
    title: 'Nothing here yet',
    description: 'Get started by creating something new.',
    action: { label: 'Get started', icon: Plus },
  },
  loading: {
    title: 'Loading...',
    description: 'Please wait while we fetch your data.',
    action: null,
  },
};

function EmptyState({ 
  preset, 
  title, 
  description, 
  icon, 
  iconColor,
  iconBg,
  action, 
  secondaryAction,
  children,
  compact = false,
  className = '',
  style = {},
  illustration,
  illustrationStyle,
}) {
  const config = preset ? presetConfigs[preset] : {};
  const IconComponent = icon || (preset ? presetIcons[preset] : HelpCircle);
  
  const finalTitle = title || config.title || 'Empty';
  const finalDescription = description || config.description || '';
  const finalAction = action || config.action || null;
  const finalSecondaryAction = secondaryAction || config.secondaryAction || null;
  const finalIconColor = iconColor || 'var(--accent-color, #3b82f6)';
  const finalIconBg = iconBg || 'var(--accent-bg, #eff6ff)';

  const containerStyle = {
    ...emptyStateStyles.container,
    ...(compact ? emptyStateStyles.compact : {}),
    ...style,
  };

  const iconWrapperStyle = {
    ...emptyStateStyles.iconWrapper,
    ...(compact ? emptyStateStyles.compactIcon : {}),
    background: finalIconBg,
    color: finalIconColor,
  };

  const titleStyle = {
    ...emptyStateStyles.title,
    ...(compact ? emptyStateStyles.compactTitle : {}),
  };

  const descStyle = {
    ...emptyStateStyles.description,
    ...(compact ? emptyStateStyles.compactDesc : {}),
  };

  if (illustration) {
    return (
      <div style={containerStyle} className={className}>
        <div style={{ ...emptyStateStyles.illustration, ...illustrationStyle }}>
          {typeof illustration === 'string' ? (
            <img src={illustration} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            illustration
          )}
        </div>
        <h3 style={titleStyle}>{finalTitle}</h3>
        {finalDescription && <p style={descStyle}>{finalDescription}</p>}
        {(finalAction || finalSecondaryAction || children) && (
          <div style={emptyStateStyles.actionGroup}>
            {finalSecondaryAction && (
              <button style={emptyStateStyles.secondaryButton} onClick={finalSecondaryAction.onClick}>
                {finalSecondaryAction.icon && <finalSecondaryAction.icon size={16} />}
                {finalSecondaryAction.label}
              </button>
            )}
            {finalAction && (
              <button style={emptyStateStyles.primaryButton} onClick={finalAction.onClick}>
                {finalAction.icon && <finalAction.icon size={16} />}
                {finalAction.label}
              </button>
            )}
            {children}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={containerStyle} className={className}>
      <div style={iconWrapperStyle} aria-hidden="true">
        <IconComponent style={emptyStateStyles.icon} />
      </div>
      <h3 style={titleStyle}>{finalTitle}</h3>
      {finalDescription && <p style={descStyle}>{finalDescription}</p>}
      {(finalAction || finalSecondaryAction || children) && (
        <div style={emptyStateStyles.actionGroup}>
          {finalSecondaryAction && (
            <button style={emptyStateStyles.secondaryButton} onClick={finalSecondaryAction.onClick}>
              {finalSecondaryAction.icon && <finalSecondaryAction.icon size={16} />}
              {finalSecondaryAction.label}
            </button>
          )}
          {finalAction && (
            <button style={emptyStateStyles.primaryButton} onClick={finalAction.onClick}>
              {finalAction.icon && <finalAction.icon size={16} />}
              {finalAction.label}
            </button>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

export { presetConfigs, presetIcons };
export default EmptyState;