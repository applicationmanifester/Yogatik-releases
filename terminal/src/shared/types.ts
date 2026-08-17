export interface TerminalProfile {
  id: string;
  name: string;
  shell: ShellOverride | 'auto';
  env: Record<string, string>;
  cwd: string | 'home' | 'project';
  cols: number;
  rows: number;
  scrollbackLines: number;
  font: FontConfig;
  theme: ThemeConfig;
  bell: BellConfig;
  cursor: CursorConfig;
  mouse: MouseConfig;
  keybindings: Keybinding[];
  allowlist?: string[];
  denylist?: string[];
  startupCommands?: string[];
  icon?: string;
  colorScheme?: 'dark' | 'light' | 'system';
}

export interface ShellOverride {
  path: string;
  args: string[];
  name: string;
}

export interface FontConfig {
  family: string;
  size: number;
  lineHeight: number;
  letterSpacing: number;
  ligatures: boolean;
  fallbackFamilies: string[];
}

export interface ThemeConfig {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selection: string;
  ansi: AnsiColors;
  ansiBright: AnsiColors;
  extended?: Record<number, string>;
}

export interface AnsiColors {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

export interface BellConfig {
  enabled: boolean;
  sound: 'system' | 'none' | string;
  visual: boolean;
  flashDuration: number;
}

export interface CursorConfig {
  style: 'block' | 'underline' | 'bar';
  blink: boolean;
  blinkRate: number;
}

export interface MouseConfig {
  enabled: boolean;
  protocol: 'x10' | 'utf8' | 'sgr';
  hideWhenTyping: boolean;
}

export interface Keybinding {
  key: string;
  action: TerminalAction;
  when?: KeybindingContext;
  args?: Record<string, any>;
}

export type TerminalAction =
  | 'newTab'
  | 'closeTab'
  | 'nextTab'
  | 'prevTab'
  | 'moveTabLeft'
  | 'moveTabRight'
  | 'splitHorizontal'
  | 'splitVertical'
  | 'focusPaneLeft'
  | 'focusPaneRight'
  | 'focusPaneUp'
  | 'focusPaneDown'
  | 'resizePaneLeft'
  | 'resizePaneRight'
  | 'resizePaneUp'
  | 'resizePaneDown'
  | 'copy'
  | 'paste'
  | 'pasteFromClipboard'
  | 'selectAll'
  | 'clearScrollback'
  | 'find'
  | 'findNext'
  | 'findPrev'
  | 'scrollUp'
  | 'scrollDown'
  | 'scrollPageUp'
  | 'scrollPageDown'
  | 'scrollTop'
  | 'scrollBottom'
  | 'increaseFontSize'
  | 'decreaseFontSize'
  | 'resetFontSize'
  | 'toggleFullscreen'
  | 'toggleMaximized'
  | 'sendEscape'
  | 'sendHex'
  | 'openConfig';

export interface KeybindingContext {
  terminalFocus: boolean;
  searchActive: boolean;
  selectionActive: boolean;
  altScreen: boolean;
  platform: 'win32' | 'darwin' | 'linux';
}

export interface TerminalSession {
  id: string;
  profileId: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  shell: ShellInfo;
  state: SessionState;
  exitCode?: number;
  createdAt: number;
  lastActivityAt: number;
  title: string;
  icon?: string;
  marks: ShellMark[];
  search?: SearchState;
  recording?: SessionRecording;
}

export interface ShellInfo {
  path: string;
  name: 'bash' | 'zsh' | 'fish' | 'nu' | 'pwsh' | 'cmd' | 'powershell' | 'custom';
  args: string[];
  version?: string;
  features: ShellFeatures;
}

export interface ShellFeatures {
  osc7: boolean;
  osc133: boolean;
  bracketPaste: boolean;
  promptMarkers: boolean;
}

export type SessionState = 'starting' | 'running' | 'exited' | 'error';

export interface ShellMark {
  id: string;
  type: 'prompt' | 'command-start' | 'command-end' | 'output';
  line: number;
  timestamp: number;
  exitCode?: number;
  command?: string;
}

export interface SearchState {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentMatchIndex: number;
}

export interface SearchMatch {
  line: number;
  col: number;
  length: number;
}

export interface SessionRecording {
  id: string;
  startedAt: number;
  frames: RecordingFrame[];
}

export interface RecordingFrame {
  timestamp: number;
  data: Uint8Array;
}

export interface TabState {
  id: string;
  sessionId: string;
  title: string;
  userTitle?: string;
  icon?: string;
  isActive: boolean;
  isModified: boolean;
  badge?: string;
  order: number;
}

export interface SplitPane {
  id: string;
  sessionId: string;
  bounds: { x: number; y: number; w: number; h: number };
  isActive: boolean;
}

export interface PtySpawnOptions {
  profileId: string;
  cols: number;
  rows: number;
  cwd: string;
  env: Record<string, string>;
  shell: string;
  args: string[];
}

export interface PtyDataEvent {
  sessionId: string;
  data: Uint8Array;
}

export interface PtyExitEvent {
  sessionId: string;
  exitCode: number;
  signal?: number;
}

export interface PtyErrorEvent {
  sessionId: string;
  error: string;
}

export interface CoreConfig {
  defaultProfile: string;
  confirmClose: boolean;
  confirmMultipleTabs: boolean;
  startupMode: 'new' | 'restore' | 'last';
  checkUpdates: boolean;
  rendering: RenderingConfig;
  performance: PerformanceConfig;
  profiles: Record<string, TerminalProfile>;
  keybindings: Record<string, TerminalAction>;
  shellIntegration: ShellIntegrationConfig;
  security: SecurityConfig;
  advanced: AdvancedConfig;
}

export interface RenderingConfig {
  renderer: 'webgl' | 'canvas' | 'auto';
  gpuAcceleration: boolean;
  vsync: boolean;
  maxFps: number;
}

export interface PerformanceConfig {
  scrollbackLines: number;
  altScrollbackLines: number;
  repaintThrottleMs: number;
  dirtyRowThreshold: number;
}

export interface ShellIntegrationConfig {
  enabled: boolean;
  autoInject: boolean;
  osc7: boolean;
  osc133: boolean;
  bracketPaste: boolean;
}

export interface SecurityConfig {
  ptySandbox: boolean;
  osc52WriteRequiresGesture: boolean;
  denyFileUris: boolean;
  deniedSequences: string[];
}

export interface AdvancedConfig {
  experimentalKittyGraphics: boolean;
  experimentalSixel: boolean;
  logPtyTraffic: boolean;
  auditLog: boolean;
}