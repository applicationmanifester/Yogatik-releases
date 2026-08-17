import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import type { TerminalSession, TabState, SplitPane } from '../shared/types';

const SESSION_DIR = path.join(app.getPath('userData'), 'sessions');
const SESSION_FILE = path.join(SESSION_DIR, 'session-state.json');

interface PersistedSessionState {
  tabs: TabState[];
  splitPanes: SplitPane[];
  activeTabId: string | null;
  timestamp: number;
}

export function ensureSessionDir(): void {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function saveSessionState(state: PersistedSessionState): void {
  ensureSessionDir();
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save session state:', error);
  }
}

export function loadSessionState(): PersistedSessionState | null {
  ensureSessionDir();
  
  if (!fs.existsSync(SESSION_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(content) as PersistedSessionState;
  } catch (error) {
    console.error('Failed to load session state:', error);
    return null;
  }
}

export function clearSessionState(): void {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      fs.unlinkSync(SESSION_FILE);
    }
  } catch (error) {
    console.error('Failed to clear session state:', error);
  }
}

export function createSessionFromPersisted(
  tab: TabState,
  profile: any
): TerminalSession {
  return {
    id: tab.sessionId,
    profileId: tab.sessionId.split('_')[0] || 'default',
    cols: 120,
    rows: 32,
    cwd: profile?.cwd || 'home',
    env: profile?.env || {},
    shell: {
      path: profile?.shell?.path || 'bash',
      name: profile?.shell?.name || 'bash',
      args: profile?.shell?.args || [],
      features: {
        osc7: true,
        osc133: true,
        bracketPaste: true,
        promptMarkers: true,
      },
    },
    state: 'starting',
    createdAt: tab.order,
    lastActivityAt: Date.now(),
    title: tab.userTitle || tab.title,
    icon: tab.icon,
    marks: [],
  };
}