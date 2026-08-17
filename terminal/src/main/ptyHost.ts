import { spawn as spawnPty, type IPty } from 'node-pty';
import { EventEmitter } from 'events';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  PtySpawnOptions,
  PtyDataEvent,
  PtyExitEvent,
  PtyErrorEvent,
  TerminalSession,
  SessionState,
  ShellInfo,
} from '../shared/types';
import { detectShell, getShellIntegrationScript } from './shell';
import { loadConfig, getProfile } from './config';
import { sessionRecorder } from './sessionRecorder';
import { graphicsProtocolHandler } from './graphicsProtocol';

const SECURITY_DENIED_SEQUENCES = [
  '\x1b[?3h', '\x1b[?5h', '\x1b[?6h', '\x1b[?7h',
  '\x1b[?25h', '\x1b[?47h', '\x1b[?1049h',
  '\x1b]20;', '\x1b]50;', '\x1b]51;', '\x1b]52;c;',
  '\x1b]777;', '\x1b]21;', '\x1b]22;',
];

export class PtyHost extends EventEmitter {
  private sessions: Map<string, PtySession> = new Map();
  private lastUserGesture: number = 0;

  constructor() {
    super();
    this.setupSecurity();
  }

  private setupSecurity(): void {
    // Track user gestures for OSC 52 - in main process we track via IPC
    // The renderer will call recordUserGesture() via IPC
  }

  recordUserGesture(): void {
    this.lastUserGesture = Date.now();
  }

  hasRecentUserGesture(withinMs: number = 500): boolean {
    return Date.now() - this.lastUserGesture < withinMs;
  }

  async spawnSession(options: PtySpawnOptions): Promise<PtySession> {
    const config = loadConfig();
    const profile = getProfile(options.profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${options.profileId}`);
    }
    const shellInfo = await detectShell(profile);

    const cols = options.cols || profile.cols;
    const rows = options.rows || profile.rows;
    const cwd = this.resolveCwd(options.cwd, profile.cwd);
    const env = this.buildEnvironment(options.env, profile.env, shellInfo, cwd);

    const pty = this.createPty(shellInfo.path, shellInfo.args, {
      cols,
      rows,
      cwd,
      env,
    });

    const session: PtySession = {
      id: options.profileId + '_' + uuidv4().slice(0, 8),
      profileId: options.profileId,
      pty,
      cols,
      rows,
      cwd,
      env,
      shell: shellInfo,
      state: 'starting',
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      title: profile.name,
      marks: [],
      scrollback: new ScrollbackBuffer(profile.scrollbackLines),
    };

    this.sessions.set(session.id, session);
    this.setupPtyListeners(session);

    // Start recording if enabled
    if (config.advanced?.logPtyTraffic) {
      session.recordingId = sessionRecorder.startRecording(session);
    }

    // Send shell integration script if enabled
    if (config.shellIntegration.enabled && config.shellIntegration.autoInject) {
      const script = getShellIntegrationScript(shellInfo);
      if (script) {
        // Send after shell is ready (small delay)
        setTimeout(() => {
          pty.write(script + '\n');
        }, 500);
      }
    }

    this.emit('session-created', session);

    // Attach graphics protocol handler for this session
    graphicsProtocolHandler.attachPty(pty);
    graphicsProtocolHandler.on('kitty-image', (data) => {
      this.emit('graphics:kitty', { sessionId: session.id, ...data });
    });
    graphicsProtocolHandler.on('sixel-image', (data) => {
      this.emit('graphics:sixel', { sessionId: session.id, ...data });
    });
    graphicsProtocolHandler.on('iterm2-image', (data) => {
      this.emit('graphics:iterm2', { sessionId: session.id, ...data });
    });

    return session;
  }

  private createPty(shell: string, args: string[], options: {
    cols: number;
    rows: number;
    cwd: string;
    env: Record<string, string>;
  }): IPty {
    const pty = spawnPty(shell, args, {
      name: 'xterm-256color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: options.env,
      encoding: 'utf8',
      handleFlowControl: true,
    });

    return pty;
  }

  private setupPtyListeners(session: PtySession): void {
    const { pty, id } = session;

    pty.onData((data: string) => {
      session.lastActivityAt = Date.now();
      
      // Security: filter denied sequences
      const filtered = this.filterDeniedSequences(data);
      if (filtered !== data) {
        console.warn(`Filtered denied sequences from session ${id}`);
      }

      // Convert to Uint8Array for efficient IPC
      const encoder = new TextEncoder();
      const buffer = encoder.encode(filtered);

      // Update scrollback
      session.scrollback.write(filtered);

      // Record frame if recording
      if (session.recordingId) {
        sessionRecorder.addFrame(session.recordingId, buffer);
      }

      // Parse for shell integration markers
      this.parseShellMarkers(session, filtered);

      this.emit('data', { sessionId: id, data: buffer } as PtyDataEvent);
    });

    pty.onExit(({ exitCode, signal }) => {
      session.state = 'exited';
      session.exitCode = exitCode;
      this.emit('exit', { sessionId: id, exitCode, signal } as PtyExitEvent);
      this.cleanupSession(id);
    });

    // Handle errors via the standard EventEmitter 'error' event
    (pty as any).on('error', (error: Error) => {
      session.state = 'error';
      this.emit('error', { sessionId: id, error: error.message } as PtyErrorEvent);
    });
  }

  private filterDeniedSequences(data: string): string {
    let result = data;
    for (const denied of SECURITY_DENIED_SEQUENCES) {
      if (result.includes(denied)) {
        result = result.split(denied).join('');
      }
    }
    return result;
  }

  private parseShellMarkers(session: PtySession, data: string): void {
    // OSC 133 - Shell integration markers
    const osc133Regex = /\x1b\]133;([AB]);?(\d*)\x1b\\/g;
    let match;
    while ((match = osc133Regex.exec(data)) !== null) {
      const type = match[1];
      const code = match[2] ? parseInt(match[2], 10) : undefined;
      
      if (type === 'A') {
        // Prompt start
        session.marks.push({
          id: uuidv4(),
          type: 'prompt',
          line: session.scrollback.length - 1,
          timestamp: Date.now(),
        });
      } else if (type === 'B') {
        // Prompt end / command exit
        const lastPrompt = [...session.marks].reverse().find(m => m.type === 'prompt');
        if (lastPrompt) {
          lastPrompt.type = 'command-end';
          lastPrompt.exitCode = code;
        }
        session.marks.push({
          id: uuidv4(),
          type: 'command-start',
          line: session.scrollback.length - 1,
          timestamp: Date.now(),
          exitCode: code,
        });
      }
    }

    // OSC 7 - Working directory
    const osc7Regex = /\x1b\]7;(file:\/\/[^\\]+)\x1b\\/g;
    while ((match = osc7Regex.exec(data)) !== null) {
      const uri = match[1];
      try {
        const url = new URL(uri);
        session.cwd = url.pathname;
        this.emit('cwd-changed', { sessionId: session.id, cwd: session.cwd });
      } catch {
        // Ignore invalid URIs
      }
    }
  }

  private resolveCwd(requested: string, profileCwd: string | 'home' | 'project'): string {
    if (requested && requested !== 'home' && requested !== 'project') {
      return requested;
    }
    if (profileCwd === 'home' || requested === 'home') {
      return os.homedir();
    }
    if (profileCwd === 'project' || requested === 'project') {
      return process.cwd();
    }
    return os.homedir();
  }

  private buildEnvironment(
    baseEnv: Record<string, string>,
    profileEnv: Record<string, string>,
    shell: ShellInfo,
    cwd: string
  ): Record<string, string> {
    // Filter out undefined values from process.env
    const filteredProcessEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        filteredProcessEnv[key] = value;
      }
    }
    
    const env = { ...filteredProcessEnv, ...baseEnv, ...profileEnv };
    
    // Ensure critical vars
    env.HOME = os.homedir();
    env.USER = os.userInfo().username;
    env.SHELL = shell.path;
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    env.PWD = cwd;
    
    // Platform-specific
    if (process.platform === 'win32') {
      env.SYSTEMROOT = process.env.SYSTEMROOT || 'C:\\Windows';
      env.PATH = process.env.PATH || '';
    }

    return env;
  }

  write(sessionId: string, data: Uint8Array): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'running') return;

    const decoder = new TextDecoder();
    const text = decoder.decode(data);
    session.pty.write(text);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cols = cols;
    session.rows = rows;
    session.pty.resize(cols, rows);
  }

  kill(sessionId: string, signal: string = 'SIGTERM'): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.pty.kill(signal);
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): PtySession[] {
    return Array.from(this.sessions.values());
  }

  private cleanupSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Stop recording if active
      if (session.recordingId) {
        sessionRecorder.stopRecording(session.recordingId);
      }
      // Clear graphics for this session
      graphicsProtocolHandler.clear();
      try {
        session.pty.kill();
      } catch {}
      this.sessions.delete(sessionId);
      this.emit('session-destroyed', sessionId);
    }
  }

  destroy(): void {
    for (const session of this.sessions.values()) {
      try {
        session.pty.kill('SIGKILL');
      } catch {}
    }
    this.sessions.clear();
    this.removeAllListeners();
  }
}

interface PtySession extends TerminalSession {
  pty: IPty;
  scrollback: ScrollbackBuffer;
  recordingId?: string;
}

class ScrollbackBuffer {
  private lines: string[] = [];
  private maxLines: number;

  constructor(maxLines: number) {
    this.maxLines = maxLines;
  }

  write(data: string): void {
    const newLines = data.split('\n');
    for (const line of newLines) {
      this.lines.push(line);
      if (this.lines.length > this.maxLines) {
        this.lines.shift();
      }
    }
  }

  get length(): number {
    return this.lines.length;
  }

  getLine(index: number): string | undefined {
    return this.lines[index];
  }

  getRange(start: number, end: number): string[] {
    return this.lines.slice(start, end);
  }

  search(query: string, regex: boolean, caseSensitive: boolean): Array<{ line: number; col: number; length: number }> {
    const flags = caseSensitive ? '' : 'i';
    const pattern = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(pattern, flags + 'g');
    
    const matches: Array<{ line: number; col: number; length: number }> = [];
    
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      let match;
      while ((match = re.exec(line)) !== null) {
        matches.push({ line: i, col: match.index, length: match[0].length });
        if (!regex) break; // For literal search, only first match per line
      }
    }
    
    return matches;
  }

  clear(): void {
    this.lines = [];
  }
}

export const ptyHost = new PtyHost();