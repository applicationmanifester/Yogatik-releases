# Terminal Emulator Technical Specification

**Version**: 1.0  
**Target**: Cross-platform desktop application (Electron + TypeScript/React)  
**Status**: Design Phase  

---

## 1. Architecture Decision Record (ADR-001): PTY Backend Selection

### Decision: **xterm-pty + node-pty (Electron) / portable-pty (Tauri)**

| Backend | Platform Support | Performance | Maintenance | License | Verdict |
|---------|-----------------|-------------|-------------|---------|---------|
| **node-pty** | Win/macOS/Linux | Excellent | Active | MIT | ✅ Primary (Electron) |
| **portable-pty** | Win/macOS/Linux | Excellent | Active (Microsoft) | MIT | ✅ Primary (Tauri) |
| **libvterm** (via FFI) | All | Excellent | Active | MIT | ⚠️ Complex FFI |
| **vte-rs** | All | Excellent | Active | MIT/LGPL | ⚠️ Rust-only |
| **wezterm-core** | All | Excellent | Active | MIT | ⚠️ Large dep |
| **pty.js (legacy)** | Limited | Poor | Unmaintained | MIT | ❌ |

### Rationale
- **node-pty**: Battle-tested in VS Code, Hyper, Terminus. Native C++ bindings per platform. Handles Windows ConPTY, macOS/Linux forkpty correctly.
- **portable-pty**: Microsoft's abstraction over ConPTY (Win), forkpty (Unix). Used in Windows Terminal. Better for Tauri/Rust.
- Both provide: PTY spawn, resize, signal delivery, exit codes, raw byte streams.

### Integration Strategy
```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process (React)                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ TerminalTab │  │ TerminalTab │  │   TerminalTab       │  │
│  │  (xterm.js) │  │  (xterm.js) │  │    (xterm.js)       │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │            │
│         └────────────────┼─────────────────────┘            │
│                          ▼                                  │
│              ┌─────────────────────┐                        │
│              │  TerminalManager    │  (session state,      │
│              │  (tabs, splits,     │   profiles, config)   │
│              │   keybindings)      │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │ IPC (structured clone / ArrayBuffer)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     Main Process (Node)                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              PtyHost (singleton per session)        │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐   │    │
│  │  │ node-pty     │  │ Shell Detector│  │ Signal   │   │    │
│  │  │ Spawn/Resize │  │ + Env Builder │  │ Manager  │   │    │
│  │  └──────────────┘  └──────────────┘  └──────────┘   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Structures

### 2.1 Terminal Session (`TerminalSession`)

```typescript
interface TerminalSession {
  id: string;                          // UUID v4
  profileId: string;                   // Reference to Profile
  pty: PtyProcess;                     // node-pty instance (main only)
  cols: number;                        // Current columns
  rows: number;                        // Current rows
  cwd: string;                         // Current working directory
  env: Record<string, string>;         // Resolved environment
  shell: ShellInfo;                    // Detected/configured shell
  state: SessionState;                 // 'starting' | 'running' | 'exited' | 'error'
  exitCode?: number;                   // Set on exit
  createdAt: number;                   // Unix ms
  lastActivityAt: number;              // For idle detection
  scrollback: ScrollbackBuffer;        // Ring buffer
  cursor: CursorState;                 // Position, shape, visibility
  title: string;                       // Window/tab title (OSC 0/2)
  icon?: string;                       // Optional icon (OSC 1337)
  marks: ShellMark[];                  // Prompt/command markers
  search?: SearchState;                // Active find-in-terminal
  recording?: SessionRecording;        // Optional: session replay
}

interface ShellInfo {
  path: string;                        // Absolute path to shell binary
  name: 'bash' | 'zsh' | 'fish' | 'nu' | 'pwsh' | 'cmd' | 'powershell' | 'custom';
  args: string[];                      // Login flags, etc.
  version?: string;
  features: ShellFeatures;             // Prompt detection, OSC support
}

interface ShellFeatures {
  osc7: boolean;                       // Working directory reporting
  osc133: boolean;                     // Shell integration (prompt marks)
  bracketPaste: boolean;               // OSC 200/201
  promptMarkers: boolean;              // Custom PS1 with markers
}
```

### 2.2 Profile System (`TerminalProfile`)

```typescript
interface TerminalProfile {
  id: string;                          // UUID
  name: string;                        // User-visible
  shell: ShellOverride | 'auto';       // Override or auto-detect
  env: Record<string, string>;         // Additional env vars
  cwd: string | 'home' | 'project';    // Starting directory
  cols: number;                        // Default columns (80)
  rows: number;                        // Default rows (24)
  scrollbackLines: number;             // 10000 default
  font: FontConfig;
  theme: ThemeConfig;
  bell: BellConfig;
  cursor: CursorConfig;
  mouse: MouseConfig;
  keybindings: Keybinding[];           // Profile-specific overrides
  allowlist?: string[];                // Optional command allowlist
  denylist?: string[];                 // Optional command denylist
  startupCommands?: string[];          // Commands to run on spawn
  icon?: string;                       // Tab icon
  colorScheme?: 'dark' | 'light' | 'system';
}

interface FontConfig {
  family: string;                      // 'JetBrains Mono', 'Fira Code', etc.
  size: number;                        // px (12-24)
  lineHeight: number;                  // 1.0-2.0
  letterSpacing: number;               // px (-0.5 to 1)
  ligatures: boolean;                  // Enable font ligatures
  fallbackFamilies: string[];          // For missing glyphs
}

interface ThemeConfig {
  background: string;                  // #hex or 'transparent'
  foreground: string;
  cursor: string;
  cursorAccent: string;                // Text color over cursor
  selection: string;                   // Selection background
  ansi: AnsiColors;                    // 16 base colors
  ansiBright: AnsiColors;              // Bright variants
  extended?: Record<number, string>;   // 256-color palette overrides
}

interface AnsiColors {
  black: string; red: string; green: string; yellow: string;
  blue: string; magenta: string; cyan: string; white: string;
}
```

### 2.3 PTY Process Abstraction (`PtyProcess`)

```typescript
interface PtyProcess {
  pid: number;
  cols: number;
  rows: number;
  
  // Data flow
  onData: (data: Uint8Array) => void;  // Raw bytes from PTY
  onExit: (code: number, signal?: number) => void;
  onError: (error: Error) => void;
  
  // Control
  write(data: Uint8Array): void;       // Send input to PTY
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;         // SIGTERM, SIGKILL, SIGINT
  
  // Platform-specific
  getWinSize(): { cols: number; rows: number; width: number; height: number };
  processGroupId?: number;             // For signal forwarding
}
```

---

## 3. ANSI Parser & Renderer (xterm.js Integration)

### 3.1 Parser Architecture

```
Raw Bytes (Uint8Array)
       │
       ▼
┌──────────────────┐
│  UTF-8 Decoder   │  (handles split sequences across chunks)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  State Machine   │  ECMA-48 / VT520 compliant
│  (CSI, OSC,      │  States: Ground, Escape, CSI-Entry,
│   DCS, SOS,      │  CSI-Param, CSI-Intermediate, CSI-Param,
│   PM, APC)       │  CSI-Ignore, OSC-String, DCS-Entry...
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Action Handlers │  Dispatch to:
│  ──────────────  │  • Cursor movement
│  • print(char)   │  • Line/char insertion/deletion
│  • execute(ctrl) │  • Scrolling (index, reverse index)
│  • csi(params)   │  • SGR (colors, styles, RGB)
│  • osc(ps, pt)   │  • DEC private modes (DECCKM, DECOM...)
│  • dcs(...)      │  • OSC handlers (title, clipboard, links)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Buffer Updates  │  Line/Cell mutations
│  (dirty tracking)│  Mark affected rows for render
└────────┬─────────┘
```

### 3.2 Rendering Pipeline (GPU-Accelerated)

```
┌────────────────────────────────────────────────────────────┐
│                     Frame Loop (60fps)                     │
├────────────────────────────────────────────────────────────┤
│  1. Collect dirty rows from parser (Set<number>)           │
│  2. For each dirty row:                                    │
│     a. Convert cells → glyph atlas positions               │
│     b. Batch by: font, color, style (bold/italic/underline)│
│     c. Submit to WebGL/Canvas2D command buffer             │
│  3. Compose:                                               │
│     - Background (theme)                                   │
│     - Text layer (glyph quads)                             │
│     - Cursor (blinking, shape)                             │
│     - Selection overlay                                    │
│     - Search highlights                                    │
│     - Hyperlink underlays (OSC 8)                          │
│  4. Present (requestAnimationFrame)                        │
└────────────────────────────────────────────────────────────┘

Optimization: Glyph Atlas + Instanced Rendering
- Single texture atlas per font (dynamic glyph packing)
- One draw call per style run (color + font style)
- 60fps at 10k lines scrollback: ~2ms/frame typical
```

### 3.3 Scrollback Buffer

```typescript
class ScrollbackBuffer {
  private lines: CircularBuffer<BufferLine>;  // Ring buffer
  private maxLines: number;                    // Configurable (default 10000)
  private altBuffer: BufferLine[] | null;      // For alt screen (vim, less)
  private inAltScreen: boolean;
  
  // O(1) append, O(1) random access via index mapping
  // Search: Boyer-Moore on rendered text (with regex option)
  // Memory: ~10k lines × 200 cols × 4 bytes ≈ 8MB
}
```

---

## 4. Shell Integration & Detection

### 4.1 Shell Detection Algorithm

```typescript
async function detectShell(): Promise<ShellInfo> {
  const platform = process.platform;
  
  // 1. Check $SHELL env var
  if (process.env.SHELL) {
    const shell = await probeShell(process.env.SHELL);
    if (shell) return shell;
  }
  
  // 2. Platform defaults with fallback chain
  const chains: Record<string, string[]> = {
    win32: [
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Windows\\System32\\cmd.exe',
      // Git Bash, WSL
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Windows\\System32\\wsl.exe',
    ],
    darwin: [
      '/bin/zsh', '/bin/bash', '/bin/fish',
      '/opt/homebrew/bin/zsh', '/opt/homebrew/bin/bash',
      '/usr/local/bin/zsh', '/usr/local/bin/fish',
    ],
    linux: [
      '/bin/zsh', '/bin/bash', '/bin/fish', '/bin/nu',
      '/usr/bin/zsh', '/usr/bin/bash', '/usr/bin/fish',
    ],
  };
  
  for (const path of chains[platform] || chains.linux) {
    const shell = await probeShell(path);
    if (shell) return shell;
  }
  
  // 3. Ultimate fallback
  return { path: '/bin/sh', name: 'bash', args: [], features: baseFeatures };
}

async function probeShell(path: string): Promise<ShellInfo | null> {
  try {
    const { stdout } = await spawn(path, ['-c', 'echo $BASH_VERSION$ZSH_VERSION$FISH_VERSION'], { timeout: 2000 });
    // Parse version, determine name, test features
    return { path, name: detectName(stdout), args: getLoginArgs(name), features: await testFeatures(path) };
  } catch { return null; }
}
```

### 4.2 Shell Integration Markers (OSC 133 / Custom)

```typescript
// Inject into shell RC files (bash/zsh/fish) for prompt tracking
const SHELL_INTEGRATION = {
  bash: `
    __yogatik_prompt_start() { printf '\033]133;A\033\\'; }
    __yogatik_prompt_end() { printf '\033]133;B;%s\033\\' "$?"; }
    __yogatik_cwd() { printf '\033]7;file://%s%s\033\\' "$HOSTNAME" "$PWD"; }
    PROMPT_COMMAND="__yogatik_cwd; __yogatik_prompt_end; ${PROMPT_COMMAND}"
    PS1="\\[\\033]133;A\\033\\\\\\]${PS1}\\[\\033]133;B\\033\\\\\\]"
  `,
  zsh: `
    function __yogatik_precmd() { print -Pn '\033]133;A\033\\' }
    function __yogatik_preexec() { print -Pn '\033]133;B;%?\033\\' }
    function __yogatik_cwd() { print -Pn '\033]7;file://%M%~\033\\' }
    precmd_functions+=(__yogatik_precmd __yogatik_cwd)
    preexec_functions+=(__yogatik_preexec)
  `,
  fish: `
    function __yogatik_prompt_start --on-event fish_prompt
      printf '\033]133;A\033\\'
    end
    function __yogatik_prompt_end --on-event fish_postexec
      printf '\033]133;B;%d\033\\' $status
    end
    function __yogatik_cwd --on-event fish_prompt
      printf '\033]7;file://%s%s\033\\' (hostname) (pwd)
    end
  `,
};
```

### 4.3 Working Directory Sync

```
Shell (OSC 7)          Terminal              App UI
    │                    │                    │
    ├─ OSC 7;file://   ──►│ Parse URI         │
    │                    │ Update session.cwd │
    │                    │                    ├─► Update file tree
    │                    │                    ├─► Tab badge
    │                    │                    └─► Status bar
    │                    │                    │
    │◄──── CWD change ──┤ (user clicks)      │
    │   (cd /path)      │                    │
```

---

## 5. Input Handling System

### 5.1 Keybinding Manager

```typescript
interface Keybinding {
  key: string;                         // 'Ctrl+Shift+T', 'Cmd+W', 'Alt+Right'
  action: TerminalAction;              // See action catalog
  when?: KeybindingContext;            // Conditional: 'terminalFocus', '!searchActive'
  args?: Record<string, any>;          // Action parameters
}

type TerminalAction = 
  | 'newTab' | 'closeTab' | 'nextTab' | 'prevTab' | 'moveTabLeft' | 'moveTabRight'
  | 'splitHorizontal' | 'splitVertical' | 'focusPaneLeft' | 'focusPaneRight' | 'focusPaneUp' | 'focusPaneDown'
  | 'resizePaneLeft' | 'resizePaneRight' | 'resizePaneUp' | 'resizePaneDown'
  | 'copy' | 'paste' | 'pasteFromClipboard' | 'selectAll' | 'clearScrollback'
  | 'find' | 'findNext' | 'findPrev' | 'scrollUp' | 'scrollDown' | 'scrollPageUp' | 'scrollPageDown'
  | 'scrollTop' | 'scrollBottom' | 'increaseFontSize' | 'decreaseFontSize' | 'resetFontSize'
  | 'toggleFullscreen' | 'toggleMaximized' | 'sendEscape' | 'sendHex' | 'openConfig';

interface KeybindingContext {
  terminalFocus: boolean;
  searchActive: boolean;
  selectionActive: boolean;
  altScreen: boolean;
  platform: 'win32' | 'darwin' | 'linux';
}
```

### 5.2 Input Processing Flow

```
Keyboard Event (React)
       │
       ▼
┌──────────────────┐
│  Keybinding      │  Match against profile + global bindings
│  Resolver        │  Priority: profile > global > default
└────────┬─────────┘
         │ Matched?
         ├─Yes──► Execute Action (may send to PTY)
         │
         ▼ No
┌──────────────────┐
│  Raw Mode Check  │  Is terminal in raw mode? (vim, etc.)
└────────┬─────────┘
         │ Yes
         ▼
┌──────────────────┐
│  Encode to       │  Convert to bytes per encoding (UTF-8)
│  Bytes + Send    │  Handle: modifiers, special keys, IME
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  PTY.write()     │  Main process IPC
└──────────────────┘
```

### 5.3 Mouse Reporting

```typescript
// Supported modes (DECSET/DECRSET)
// ?1000 - X10 (press/release)
// ?1002 - Button-event (motion)
// ?1003 - Any-event (motion always)
// ?1006 - SGR encoding (extended coords, >223 cols/rows)
// ?1015 - UTF-8 encoding (legacy)

interface MouseEvent {
  type: 'press' | 'release' | 'drag' | 'wheel' | 'move';
  button: 1 | 2 | 3 | 4 | 5;        // 1=left, 2=middle, 3=right, 4=wheel up, 5=wheel down
  x: number;                         // 1-based column
  y: number;                         // 1-based row
  mods: KeyModifiers;                // Shift, Alt, Ctrl
  encoding: 'x10' | 'sgr' | 'utf8';
}
```

---

## 6. UI/UX Specification

### 6.1 Tab System

```typescript
interface TabState {
  id: string;
  sessionId: string;
  title: string;                       // From OSC 0/2 or shell
  userTitle?: string;                  // User-renamed
  icon?: string;
  isActive: boolean;
  isModified: boolean;                 // Unread output bell
  badge?: string;                      // Exit code, background job count
  order: number;                       // For drag-reorder
}

interface SplitPane {
  id: string;
  sessionId: string;
  bounds: { x: number; y: number; w: number; h: number };  // Relative 0-1
  isActive: boolean;
}
```

### 6.2 Default Keybindings (Cross-Platform)

| Action | Windows/Linux | macOS | Context |
|--------|---------------|-------|---------|
| New Tab | `Ctrl+Shift+T` | `Cmd+T` | Global |
| Close Tab | `Ctrl+Shift+W` | `Cmd+W` | Tab focused |
| Next Tab | `Ctrl+Tab` | `Ctrl+Tab` | Global |
| Prev Tab | `Ctrl+Shift+Tab` | `Ctrl+Shift+Tab` | Global |
| Split Horizontal | `Ctrl+Shift+D` | `Cmd+D` | Terminal focused |
| Split Vertical | `Ctrl+Shift+E` | `Cmd+Shift+D` | Terminal focused |
| Focus Next Pane | `Alt+Right` | `Alt+Right` | Terminal focused |
| Copy | `Ctrl+Shift+C` | `Cmd+C` | Selection |
| Paste | `Ctrl+Shift+V` | `Cmd+V` | Terminal focused |
| Find | `Ctrl+Shift+F` | `Cmd+F` | Terminal focused |
| Scroll Up | `Shift+PageUp` | `Shift+PageUp` | Terminal focused |
| Increase Font | `Ctrl++` | `Cmd++` | Global |
| Decrease Font | `Ctrl+-` | `Cmd+-` | Global |
| Reset Font | `Ctrl+0` | `Cmd+0` | Global |

---

## 7. Security Model

### 7.1 PTY Isolation

```typescript
// Electron: node-pty runs in main process (privileged)
// Sandbox options per platform:

// Windows: AppContainer + Job Object
const windowsSandbox = {
  appContainer: true,                    // Low integrity
  jobObject: {                           // Resource limits
    memoryLimit: 512 * 1024 * 1024,      // 512MB
    processLimit: 64,
    cpuRate: 10000,                      // 100% of one core
  },
  denyFileSystem: ['C:\\Windows', 'C:\\Program Files'],
};

// macOS: Seatbelt (sandbox-exec)
const macosSandbox = `
  (version 1)
  (deny default (with no-log))
  (allow process-exec (with no-sandbox))
  (allow file-read* (regex #"^/Users/[^/]+/.*"))
  (allow network-outbound)
  (deny file-write* (regex #"^/etc/.*"))
  (deny file-write* (regex #"^/private/.*"))
`;

// Linux: systemd-run + namespaces
const linuxSandbox = {
  namespaces: ['pid', 'mount', 'network', 'uts', 'ipc'],
  seccomp: 'default',                    // Block dangerous syscalls
  capabilities: ['CAP_DAC_OVERRIDE'],    // Minimal
  readonlyPaths: ['/etc', '/usr', '/boot'],
  tmpfs: ['/tmp', '/run/user/1000'],
};
```

### 7.2 OSC Security Gates

```typescript
const OSC_HANDLERS: Record<number, OscHandler> = {
  0: (pt) => { setTitle(pt); },                    // Window title - ALWAYS
  1: (pt) => { setIcon(pt); },                     // Icon - SAFE
  2: (pt) => { setTitle(pt); },                    // Window title - ALWAYS
  7: (pt) => { handleCwd(pt); },                   // CWD - SAFE (file:// only)
  8: (pt) => { handleHyperlink(pt); },             // Hyperlink - VALIDATE URL
  9: (pt) => { /* Non-standard */ },               // IGNORE
  10: (pt) => { /* Foreground color */ },          // IGNORE (deprecated)
  11: (pt) => { /* Background color */ },          // IGNORE (deprecated)
  12: (pt) => { /* Cursor color */ },              // IGNORE (deprecated)
  52: (pt) => { handleClipboardWrite(pt); },       // CLIPBOARD - GATED
  133: (pt) => { handleShellIntegration(pt); },    // Shell marks - SAFE
  633: (pt) => { /* Kitty graphics */ },           // DISABLED by default
};

// OSC 52 Clipboard Write - REQUIRES user gesture
async function handleClipboardWrite(pt: string) {
  if (!inputState.lastUserGestureWithin(500)) {
    logger.warn('OSC 52 blocked: no recent user gesture');
    return;
  }
  const { data, encoding } = parseOsc52(pt);
  await clipboard.writeText(decode(data, encoding));
}
```

### 7.3 Escape Sequence Denylist

```typescript
const DENIED_SEQUENCES = [
  // Dangerous DEC/DEC private
  '\x1b[?1h',    // DECCKM (cursor keys) - can break input
  '\x1b[?3h',    // DECCOLM (80/132 col) - resize attack
  '\x1b[?5h',    // DECSCNM (reverse video) - visual spoof
  '\x1b[?6h',    // DECOM (origin mode) - cursor confusion
  '\x1b[?7h',    // DECAWM (auto wrap) - output corruption
  '\x1b[?25h',   // DECTCEM (show cursor) - info leak
  '\x1b[?47h',   // Alt screen - can hide malicious output
  '\x1b[?1049h', // Alt screen + clear - same
  
  // Window manipulation (OSC)
  '\x1b]20;',    // Icon label - can spoof
  '\x1b]50;',    // Font change - resource exhaustion
  '\x1b]51;',    // Font query - info leak
  '\x1b]52;c;',  // Clipboard read - data exfil
  '\x1b]777;',   // notify - notification spam
  
  // Title stacking
  '\x1b]21;',    // Push title
  '\x1b]22;',    // Pop title
  
  // File: URIs in OSC 8
  /^\x1b]8;;file:/,  // Local file links
];

// Parser integration: strip or sanitize before dispatch
function sanitizeSequence(seq: string): string {
  for (const denied of DENIED_SEQUENCES) {
    if (typeof denied === 'string' && seq.startsWith(denied)) return '';
    if (denied instanceof RegExp && denied.test(seq)) return '';
  }
  return seq;
}
```

---

## 8. Performance Targets & Benchmarks

### 8.1 Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Cold start (launch → shell) | < 50ms | `performance.now()` main→renderer→PTY ready |
| Frame time (heavy output) | < 16ms (60fps) | `cat /dev/urandom | head -c 10MB` |
| Frame time (idle) | < 1ms | No output, blinking cursor only |
| Memory/terminal | < 100MB | RSS after 1hr typical use |
| Scrollback search (10k lines) | < 100ms | Regex `/error/i` on full buffer |
| Resize latency | < 5ms | SIGWINCH → reflow complete |
| Paste (1MB text) | < 200ms | Insert + render |
| Input latency (keystroke→PTY) | < 2ms | Keydown → PTY.write() |

### 8.2 Benchmark Suite

```typescript
// benchmarks/terminal.bench.ts
const benchmarks = [
  {
    name: 'coldStart',
    fn: async () => {
      const start = performance.now();
      const session = await terminalManager.createSession(defaultProfile);
      await session.ready();  // Shell prompt detected
      return performance.now() - start;
    },
    target: 50,
  },
  {
    name: 'heavyOutput',
    fn: async () => {
      const session = await terminalManager.createSession(defaultProfile);
      const frames: number[] = [];
      session.on('frame', (t) => frames.push(t));
      session.pty.write(Buffer.from('y'.repeat(10_000_000)));  // 10MB
      await waitForIdle(session);
      const avgFrame = frames.reduce((a,b)=>a+b)/frames.length;
      return avgFrame;
    },
    target: 16,
  },
  {
    name: 'scrollbackSearch',
    fn: async () => {
      const session = await terminalManager.createSession({...defaultProfile, scrollbackLines: 10000});
      // Fill with varied content
      for (let i = 0; i < 10000; i++) {
        session.pty.write(`Line ${i}: ${'x'.repeat(100)}\n`);
      }
      const start = performance.now();
      const matches = session.search(/error|fail|exception/i);
      return performance.now() - start;
    },
    target: 100,
  },
  {
    name: 'rapidResize',
    fn: async () => {
      const session = await terminalManager.createSession(defaultProfile);
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        session.resize(80 + (i % 40), 24 + (i % 20));
        await nextTick();
      }
      return performance.now() - start;
    },
    target: 500,  // Total for 100 resizes
  },
];
```

---

## 9. Configuration Schema (TOML)

```toml
# ~/.config/yogatik/terminal.toml

[core]
# Global settings
default_profile = "default"
confirm_close = true
confirm_multiple_tabs = true
startup_mode = "restore"  # "new" | "restore" | "last"
check_updates = true

[core.rendering]
renderer = "webgl"        # "webgl" | "canvas" | "auto"
gpu_acceleration = true
vsync = true
max_fps = 60

[core.performance]
scrollback_lines = 10000
alt_scrollback_lines = 1000
repaint_throttle_ms = 0
dirty_row_threshold = 10

[profiles.default]
name = "Default"
shell = "auto"
cwd = "home"
cols = 120
rows = 32
scrollback_lines = 10000

[profiles.default.font]
family = "JetBrains Mono"
size = 13
line_height = 1.4
letter_spacing = 0
ligatures = true
fallback = ["Noto Color Emoji", "Symbols Nerd Font Mono"]

[profiles.default.theme]
background = "#1e1e2e"
foreground = "#cdd6f4"
cursor = "#f5e0dc"
cursor_accent = "#1e1e2e"
selection = "#45475a"
ansi = { black = "#1e1e2e", red = "#f38ba8", green = "#a6e3a1", yellow = "#f9e2af", blue = "#89b4fa", magenta = "#f5c2e7", cyan = "#94e2d5", white = "#bac2de" }
ansi_bright = { black = "#6c7086", red = "#f38ba8", green = "#a6e3a1", yellow = "#f9e2af", blue = "#89b4fa", magenta = "#f5c2e7", cyan = "#94e2d5", white = "#a6adc8" }

[profiles.default.bell]
enabled = true
sound = "system"          # "system" | "none" | "custom:/path.wav"
visual = true
flash_duration = 100

[profiles.default.cursor]
style = "block"           # "block" | "underline" | "bar"
blink = true
blink_rate = 530

[profiles.default.mouse]
enabled = true
protocol = "sgr"          # "x10" | "utf8" | "sgr"
hide_when_typing = true

[keybindings]
# Global (merged with profile)
"Ctrl+Shift+T" = "newTab"
"Ctrl+Shift+W" = "closeTab"
"Ctrl+Tab" = "nextTab"
"Ctrl+Shift+Tab" = "prevTab"
"Ctrl+Shift+D" = "splitHorizontal"
"Ctrl+Shift+E" = "splitVertical"
"Alt+Right" = "focusPaneRight"
"Alt+Left" = "focusPaneLeft"
"Alt+Up" = "focusPaneUp"
"Alt+Down" = "focusPaneDown"
"Ctrl+Shift+C" = "copy"
"Ctrl+Shift+V" = "paste"
"Ctrl+Shift+F" = "find"
"Ctrl+Shift+Plus" = "increaseFontSize"
"Ctrl+Shift+Minus" = "decreaseFontSize"
"Ctrl+Shift+0" = "resetFontSize"

[shell_integration]
enabled = true
auto_inject = true        # Inject RC snippets on first run
osc7 = true
osc133 = true
bracket_paste = true

[security]
pty_sandbox = true
osc52_write_requires_gesture = true
deny_file_uris = true
denied_sequences = [
  "\x1b[?3h", "\x1b[?5h", "\x1b[?6h", "\x1b[?7h",
  "\x1b[?25h", "\x1b[?47h", "\x1b[?1049h",
  "\x1b]20;", "\x1b]50;", "\x1b]51;", "\x1b]52;c;",
  "\x1b]777;", "\x1b]21;", "\x1b]22;",
]

[advanced]
experimental_kitty_graphics = false
experimental_sixel = false
log_pty_traffic = false
audit_log = false
```

---

## 10. Plugin/Extension API

### 10.1 Extension Manifest

```json
{
  "name": "terminal-ai-assist",
  "version": "1.0.0",
  "description": "Local LLM command suggestions",
  "main": "dist/index.js",
  "api_version": 1,
  "permissions": ["terminal.read", "terminal.write", "settings.read"],
  "entry_points": {
    "command_suggestion": "suggestCommand",
    "prompt_decorator": "decoratePrompt",
    "keybinding": "handleKey"
  },
  "config_schema": {
    "model_path": { "type": "string", "default": "~/.models/phi-3-mini.gguf" },
    "max_tokens": { "type": "number", "default": 100 }
  }
}
```

### 10.2 Extension API Surface

```typescript
interface TerminalExtensionAPI {
  // Terminal access
  terminals: {
    getActive(): TerminalSession | null;
    getAll(): TerminalSession[];
    onCreate(cb: (session: TerminalSession) => void): Disposable;
    onDestroy(cb: (id: string) => void): Disposable;
    onData(cb: (session: TerminalSession, data: Uint8Array) => void): Disposable;
  };
  
  // UI integration
  ui: {
    registerCommandPaletteItem(item: CommandPaletteItem): Disposable;
    registerContextMenuItem(item: ContextMenuItem): Disposable;
    registerStatusBarItem(item: StatusBarItem): Disposable;
    showNotification(msg: string, type: 'info' | 'warn' | 'error'): void;
    showInputBox(opts: InputBoxOptions): Promise<string | null>;
  };
  
  // Settings
  settings: {
    get<T>(key: string): T;
    set(key: string, value: any): void;
    onChange(key: string, cb: (value: any) => void): Disposable;
    registerSchema(schema: ConfigSchema): void;
  };
  
  // Shell interaction
  shell: {
    sendText(session: TerminalSession, text: string): void;
    sendKey(session: TerminalSession, key: string): void;
    getCwd(session: TerminalSession): string;
    getEnv(session: TerminalSession): Record<string, string>;
  };
  
  // Utilities
  utils: {
    fs: { readFile, writeFile, exists, glob };  // Sandboxed to workspace
    http: { fetch };                             // Controlled fetch
    crypto: { hash, hmac, randomBytes };
    spawn: (cmd: string, args: string[]) => Promise<{stdout: string, stderr: string, code: number}>;
  };
}
```

---

## 11. Implementation Phases

### Phase 1: Core Foundation (Weeks 1-3)
- [ ] Project setup: Electron + TypeScript + React + Vite
- [ ] node-pty integration in main process
- [ ] Basic IPC: spawn, write, resize, kill, data, exit
- [ ] xterm.js integration in renderer (single terminal)
- [ ] Basic parser verification (vt-test, vttest)
- [ ] Configuration system (TOML, live reload)

### Phase 2: Multi-Session & UI (Weeks 4-6)
- [ ] TerminalManager: tabs, splits, drag-reorder
- [ ] Profile system with shell detection
- [ ] Theme/font configuration UI
- [ ] Keybinding manager with defaults
- [ ] Copy/paste/find/scrollback search
- [ ] Persistent session state (IndexedDB)

### Phase 3: Shell Integration (Weeks 7-9)
- [ ] OSC 7/133 handler + RC injection
- [ ] Prompt detection & command marking
- [ ] Working directory sync to app
- [ ] Bracket paste (OSC 200/201)
- [ ] Hyperlink detection (OSC 8)
- [ ] Bell notifications (visual/audio)

### Phase 4: Advanced Features (Weeks 10-12)
- [ ] GPU rendering optimization (WebGL atlas)
- [ ] Mouse reporting (SGR 1006)
- [ ] IME support for CJK
- [ ] Session recording/replay (asciicast v2)
- [ ] Security hardening (sandbox, denylist)
- [ ] Performance benchmarking + CI

### Phase 5: Extensibility & Polish (Weeks 13-15)
- [ ] Plugin API (WASM or native)
- [ ] Extension marketplace prep
- [ ] Accessibility audit (screen reader, high contrast)
- [ ] Cross-shell test matrix (bash, zsh, fish, nu, pwsh, cmd)
- [ ] Documentation + keyboard reference
- [ ] Release packaging (MSIX, DMG, AppImage, deb/rpm)

---

## 12. Testing Strategy

### 12.1 Unit Tests
```typescript
// tests/parser.test.ts
describe('ANSI Parser', () => {
  test('CSI cursor movement', () => {
    const parser = new AnsiParser();
    parser.parse('\x1b[10;20H');
    expect(parser.cursor).toEqual({ row: 10, col: 20 });
  });
  
  test('SGR true color', () => {
    const parser = new AnsiParser();
    parser.parse('\x1b[38;2;255;128;0m');
    expect(parser.currentAttr.fg).toEqual({ r: 255, g: 128, b: 0 });
  });
  
  test('OSC 52 clipboard', () => {
    const parser = new AnsiParser({ allowClipboardWrite: true });
    parser.parse('\x1b]52;c;SGVsbG8=\x07');
    expect(clipboardMock.readText()).toBe('Hello');
  });
  
  test('malformed sequence recovery', () => {
    const parser = new AnsiParser();
    parser.parse('\x1b[1;2;3;4;5;6;7;8;9;10;11;12;13;14;15;16;17;18;19;20m');
    // Should not crash, should handle gracefully
  });
});
```

### 12.2 Integration Tests
```typescript
// tests/pty.integration.test.ts
describe('PTY Integration', () => {
  test('spawn bash, send command, get output', async () => {
    const session = await ptyHost.spawn({ shell: 'bash', args: ['-i'] });
    const output = await new Promise(resolve => {
      session.onData = (data) => { if (data.includes('$ ')) resolve(data); };
    });
    session.write('echo hello\n');
    const result = await waitForOutput(session, 'hello');
    expect(result).toContain('hello');
  });
  
  test('resize propagates SIGWINCH', async () => {
    const session = await ptyHost.spawn({ shell: 'bash' });
    session.resize(120, 40);
    // Verify shell received SIGWINCH via $COLUMNS/$LINES
  });
  
  test('Ctrl+C sends SIGINT', async () => {
    const session = await ptyHost.spawn({ shell: 'bash' });
    session.write('\x03');  // Ctrl+C
    // Verify process group received SIGINT
  });
  
  test('unicode stress', async () => {
    const session = await ptyHost.spawn({ shell: 'bash' });
    const unicode = '🎉'.repeat(1000) + '中文测试'.repeat(500) + 'עברית'.repeat(500);
    session.write(`echo "${unicode}"\n`);
    const output = await waitForOutput(session, unicode);
    expect(output).toContain(unicode);
  });
});
```

### 12.3 Visual Regression
```typescript
// tests/visual.regression.test.ts
import { chromium } from '@playwright/test';

const themes = ['dark', 'light', 'high-contrast'];
const fonts = ['JetBrains Mono', 'Fira Code', 'Cascadia Code'];

for (const theme of themes) {
  for (const font of fonts) {
    test(`render: ${theme}/${font}`, async () => {
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.goto('http://localhost:3000/test-harness');
      await page.evaluate(({ theme, font }) => {
        terminal.setTheme(theme);
        terminal.setFont(font);
        terminal.write('\x1b[31mRed\x1b[0m \x1b[32mGreen\x1b[0m \x1b[34mBlue\x1b[0m');
        terminal.write('\n\u2500\u2501\u2502\u2503 Box drawing');
        terminal.write('\n🎉 Emoji \u{1F600}');
      }, { theme, font });
      await expect(page.locator('.xterm')).toHaveScreenshot(`${theme}-${font}.png`);
      await browser.close();
    });
  }
}
```

### 12.4 Fuzz Testing
```typescript
// tests/fuzz.test.ts
describe('Fuzz: Malformed Sequences', () => {
  const fuzzInputs = [
    // Incomplete sequences
    '\x1b[', '\x1b]52;', '\x1b[38;2;',
    // Oversized parameters
    '\x1b[' + '1;'.repeat(10000) + 'm',
    // Invalid UTF-8
    Buffer.from([0xFF, 0xFE, 0xFD]),
    // Nested OSC
    '\x1b]52;c;\x1b]52;c;SGVsbG8=\x07\x07',
    // Rapid resize
    ...Array(100).fill(0).map(() => `\x1b[${Math.random()*200};${Math.random()*100}H`),
  ];
  
  for (const input of fuzzInputs) {
    test(`handles: ${JSON.stringify(input).slice(0,50)}`, () => {
      const parser = new AnsiParser();
      expect(() => parser.parse(input)).not.toThrow();
    });
  }
});
```

---

## 13. Accessibility Checklist

- [ ] **Screen Reader**: ARIA labels on tabs, panes, terminal output regions
- [ ] **Keyboard Navigation**: Full operation without mouse (Tab, Arrow keys, F6 for panes)
- [ ] **High Contrast**: Windows HCM / macOS increase contrast / forced colors media query
- [ ] **Reduced Motion**: `prefers-reduced-motion` disables cursor blink, bell flash, animations
- [ ] **Focus Indicators**: Visible focus rings on all interactive elements
- [ ] **Text Scaling**: Respects OS zoom level (100%-500%)
- [ ] **Announcements**: Live region for command output, bell, errors
- [ ] **Color Independence**: No info conveyed by color alone (use icons/text too)

---

## 14. Dependencies & Licensing

| Package | Version | License | Purpose |
|---------|---------|---------|---------|
| `xterm` | ^5.3.0 | MIT | Terminal emulator core |
| `xterm-addon-webgl` | ^0.16.0 | MIT | GPU rendering |
| `xterm-addon-search` | ^0.13.0 | MIT | Find in terminal |
| `xterm-addon-unicode11` | ^0.7.0 | MIT | Unicode 11 width |
| `node-pty` | ^1.0.0 | MIT | PTY backend (Electron) |
| `@portable-pty/portable-pty` | ^1.0.0 | MIT | PTY backend (Tauri) |
| `toml` | ^3.0.0 | MIT | Config parsing |
| `hotkey-js` | ^0.1.0 | MIT | Keybinding parser |

---

## 15. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| node-pty native build failures | Medium | High | Prebuilt binaries, CI on all platforms, fallback to portable-pty |
| xterm.js upstream breaking changes | Low | Medium | Pin version, maintain fork if needed, comprehensive tests |
| ConPTY bugs on Windows | Medium | Medium | Test on Win 10/11, fallback to winpty for legacy |
| GPU rendering crashes | Low | High | Canvas fallback, WebGL error boundary, safe mode flag |
| Shell detection fails | Medium | Low | Comprehensive fallback chain, manual override |
| OSC 52 security bypass | Low | Critical | Strict gesture gating, audit logging, user permission prompt |
| Performance regression | Medium | Medium | CI benchmarks, perf budgets, bisect on regression |

---

## 16. Appendix: Key References

- **ECMA-48**: Control Functions for Coded Character Sets
- **VT520**: DEC Terminal Programming Reference
- **OSC 133**: Shell Integration (finalterm, iTerm2, WezTerm)
- **OSC 8**: Hyperlinks (Paul Williams)
- **OSC 52**: Clipboard (xterm, iTerm2)
- **OSC 7/63**: Working Directory (OSC 7 = file://, OSC 63 = path)
- **SGR 1006**: SGR Mouse Mode (Xterm)
- **Kitty Graphics Protocol**: GPU-accelerated graphics in terminal
- **Sixel**: Legacy graphics (still used by some apps)
- **Asciicast v2**: Terminal session recording format

---

*End of Specification*