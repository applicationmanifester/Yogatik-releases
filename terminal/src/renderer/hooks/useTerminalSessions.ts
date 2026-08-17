import { useState, useEffect, useCallback, useRef } from 'react';
import { TabState, SplitPane, TerminalSession, TerminalProfile } from '@shared/types';

interface TerminalActions {
  newTab: (profileId?: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  renameTab: (tabId: string, title: string) => void;
  setTabTitle: (sessionId: string, title: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
  focusSession: (sessionId: string) => void;
  splitHorizontal: (sessionId: string) => Promise<void>;
  splitVertical: (sessionId: string) => Promise<void>;
  focusPane: (direction: 'left' | 'right' | 'up' | 'down') => void;
  resizePane: (paneId: string, direction: 'left' | 'right' | 'up' | 'down') => void;
  setFontSize: (sessionId: string, size: number) => void;
  updateConfig: (config: any) => void;
  saveSession: () => void;
  loadSession: () => void;
}

interface PersistedSessionState {
  tabs: TabState[];
  splitPanes: SplitPane[];
  activeTabId: string | null;
  timestamp: number;
}

export function useTerminalSessions(): {
  sessions: Map<string, TerminalSession>;
  activeSessionId: string | null;
  tabs: TabState[];
  activeTabId: string | null;
  splitPanes: SplitPane[];
  actions: TerminalActions;
} {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(new Map());
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [splitPanes, setSplitPanes] = useState<SplitPane[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);
  const nextTabOrder = useRef(0);
  const configRef = useRef<any>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced session save
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      const state: PersistedSessionState = {
        tabs,
        splitPanes,
        activeTabId,
        timestamp: Date.now(),
      };
      window.terminalAPI?.session.save(state);
    }, 500);
  }, [tabs, splitPanes, activeTabId]);

  // Save session on changes
  useEffect(() => {
    debouncedSave();
  }, [debouncedSave]);

  // Listen for PTY events
  useEffect(() => {
    const unsubData = window.terminalAPI?.pty.onData((event) => {
      setSessions(prev => {
        const next = new Map(prev);
        const session = next.get(event.sessionId);
        if (session) {
          next.set(event.sessionId, { ...session, lastActivityAt: Date.now() });
        }
        return next;
      });
    });

    const unsubExit = window.terminalAPI?.pty.onExit((event) => {
      setSessions(prev => {
        const next = new Map(prev);
        const session = next.get(event.sessionId);
        if (session) {
          next.set(event.sessionId, { ...session, state: 'exited', exitCode: event.exitCode });
        }
        return next;
      });
    });

    const unsubError = window.terminalAPI?.pty.onError((event) => {
      setSessions(prev => {
        const next = new Map(prev);
        const session = next.get(event.sessionId);
        if (session) {
          next.set(event.sessionId, { ...session, state: 'error' });
        }
        return next;
      });
    });

    const unsubCreated = window.terminalAPI?.pty.onSessionCreated((session) => {
      setSessions(prev => {
        const next = new Map(prev);
        next.set(session.id, session as TerminalSession);
        return next;
      });
    });

    const unsubDestroyed = window.terminalAPI?.pty.onSessionDestroyed((sessionId) => {
      setSessions(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      setTabs(prev => prev.filter(t => t.sessionId !== sessionId));
      setSplitPanes(prev => prev.filter(p => p.sessionId !== sessionId));
    });

    const unsubCwd = window.terminalAPI?.pty.onCwdChanged((event) => {
      setSessions(prev => {
        const next = new Map(prev);
        const session = next.get(event.sessionId);
        if (session) {
          next.set(event.sessionId, { ...session, cwd: event.cwd });
        }
        return next;
      });
    });

    const unsubRestored = window.terminalAPI?.pty.onSessionRestored((data) => {
      setTabs(prev => prev.map(t => 
        t.id === data.tab.id ? { ...t, sessionId: data.sessionId } : t
      ));
      setSplitPanes(prev => prev.map(p => 
        p.sessionId === data.tab.sessionId ? { ...p, sessionId: data.sessionId } : p
      ));
    });

    const unsubConfig = window.terminalAPI?.config.onChanged((config) => {
      configRef.current = config;
    });

    // Load initial config
    window.terminalAPI?.config.get().then((config) => {
      configRef.current = config;
    });

    return () => {
      unsubData?.();
      unsubExit?.();
      unsubError?.();
      unsubCreated?.();
      unsubDestroyed?.();
      unsubCwd?.();
      unsubRestored?.();
      unsubConfig?.();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Handle session restore request from main process
  useEffect(() => {
    const handleRestore = async (persisted: PersistedSessionState) => {
      if (!persisted || !persisted.tabs.length) return;
      
      setIsRestoring(true);
      try {
        await window.terminalAPI?.session.requestRestore(persisted);
      } finally {
        setIsRestoring(false);
      }
    };

    // Listen for restore request from main
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'session:restore') {
        handleRestore(event.data.payload);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const activeSessionId = activeTabId ? tabs.find(t => t.id === activeTabId)?.sessionId || null : null;

  const createSplitPane = (sessionId: string, parentPaneId?: string): SplitPane => {
    const parentPane = parentPaneId ? splitPanes.find(p => p.id === parentPaneId) : splitPanes[0];
    const isHorizontal = Math.random() > 0.5; // Alternate or use parameter
    
    return {
      id: `pane_${sessionId}`,
      sessionId,
      bounds: parentPane 
        ? isHorizontal
          ? { x: parentPane.bounds.x, y: parentPane.bounds.y, w: parentPane.bounds.w, h: parentPane.bounds.h / 2 }
          : { x: parentPane.bounds.x, y: parentPane.bounds.y, w: parentPane.bounds.w / 2, h: parentPane.bounds.h }
        : { x: 0, y: 0, w: 1, h: 1 },
      isActive: true,
    };
  };

  const actions: TerminalActions = {
    newTab: useCallback(async (profileId = 'default') => {
      const config = configRef.current;
      const profile = config?.profiles?.[profileId] || config?.profiles?.default;
      if (!profile) return;

      const cols = profile.cols || 120;
      const rows = profile.rows || 32;

      const session = await window.terminalAPI?.pty.spawn({
        profileId,
        cols,
        rows,
        cwd: profile.cwd === 'home' ? 'home' : profile.cwd === 'project' ? 'project' : profile.cwd,
        env: profile.env,
        shell: profile.shell === 'auto' ? 'auto' : profile.shell.path,
        args: profile.shell === 'auto' ? [] : profile.shell.args,
      });

      if (session) {
        const tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newTab: TabState = {
          id: tabId,
          sessionId: session.id,
          title: profile.name,
          isActive: true,
          isModified: false,
          order: nextTabOrder.current++,
        };

        setTabs(prev => {
          const updated = prev.map(t => ({ ...t, isActive: false }));
          return [...updated, newTab];
        });
        setActiveTabId(tabId);

        const newPane: SplitPane = {
          id: `pane_${session.id}`,
          sessionId: session.id,
          bounds: { x: 0, y: 0, w: 1, h: 1 },
          isActive: true,
        };
        setSplitPanes(prev => [...prev, newPane]);
      }
    }, []),

    closeTab: useCallback((tabId: string) => {
      setTabs(prev => {
        const tab = prev.find(t => t.id === tabId);
        if (tab) {
          window.terminalAPI?.pty.kill(tab.sessionId);
        }
        const filtered = prev.filter(t => t.id !== tabId);
        if (filtered.length > 0 && activeTabId === tabId) {
          const idx = prev.findIndex(t => t.id === tabId);
          const newActive = filtered[Math.min(idx, filtered.length - 1)];
          setActiveTabId(newActive.id);
        } else if (filtered.length === 0) {
          setActiveTabId(null);
        }
        return filtered;
      });
      setSplitPanes(prev => {
        const tab = tabs.find(t => t.id === tabId);
        return prev.filter(p => p.sessionId !== tab?.sessionId);
      });
    }, [tabs, activeTabId]),

    setActiveTab: useCallback((tabId: string) => {
      setTabs(prev => prev.map(t => ({ ...t, isActive: t.id === tabId })));
      setSplitPanes(prev => prev.map(p => ({ ...p, isActive: false })));
      
      const tab = tabs.find(t => t.id === tabId);
      if (tab) {
        setSplitPanes(prev => prev.map(p => ({ ...p, isActive: p.sessionId === tab.sessionId })));
      }
      setActiveTabId(tabId);
    }, [tabs]),

    reorderTabs: useCallback((fromIndex: number, toIndex: number) => {
      setTabs(prev => {
        const copy = [...prev];
        const [removed] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, removed);
        return copy.map((t, i) => ({ ...t, order: i }));
      });
    }, []),

    renameTab: useCallback((tabId: string, title: string) => {
      setTabs(prev => prev.map(t => t.id === tabId ? { ...t, userTitle: title } : t));
    }, []),

    setTabTitle: useCallback((sessionId: string, title: string) => {
      setTabs(prev => prev.map(t => 
        t.sessionId === sessionId && !t.userTitle ? { ...t, title } : t
      ));
    }, []),

    resizeSession: useCallback((sessionId: string, cols: number, rows: number) => {
      window.terminalAPI?.pty.resize(sessionId, cols, rows);
      setSessions(prev => {
        const next = new Map(prev);
        const session = next.get(sessionId);
        if (session) {
          next.set(sessionId, { ...session, cols, rows });
        }
        return next;
      });
    }, []),

    focusSession: useCallback((sessionId: string) => {
      const tab = tabs.find(t => t.sessionId === sessionId);
      if (tab) {
        actions.setActiveTab(tab.id);
      }
    }, [tabs]),

    splitHorizontal: useCallback(async (sessionId: string) => {
      const tab = tabs.find(t => t.sessionId === sessionId);
      if (!tab) return;
      
      const profileId = sessionId.split('_')[0];
      await actions.newTab(profileId);
    }, [tabs, actions]),

    splitVertical: useCallback(async (sessionId: string) => {
      const tab = tabs.find(t => t.sessionId === sessionId);
      if (!tab) return;
      
      const profileId = sessionId.split('_')[0];
      await actions.newTab(profileId);
    }, [actions, tabs]),

    focusPane: useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
      // Find current active pane
      const activePane = splitPanes.find(p => p.isActive);
      if (!activePane) return;

      // Simple grid-based navigation
      // In a real implementation, this would use the bounds to find adjacent panes
      const currentIndex = splitPanes.findIndex(p => p.id === activePane.id);
      let targetIndex = currentIndex;

      if (direction === 'left' || direction === 'up') {
        targetIndex = Math.max(0, currentIndex - 1);
      } else {
        targetIndex = Math.min(splitPanes.length - 1, currentIndex + 1);
      }

      if (targetIndex !== currentIndex) {
        setSplitPanes(prev => prev.map((p, i) => ({ ...p, isActive: i === targetIndex })));
        const targetPane = splitPanes[targetIndex];
        actions.focusSession(targetPane.sessionId);
      }
    }, [splitPanes, actions]),

    resizePane: useCallback((paneId: string, direction: 'left' | 'right' | 'up' | 'down') => {
      setSplitPanes(prev => prev.map(p => {
        if (p.id !== paneId) return p;
        
        const step = 0.05;
        const newBounds = { ...p.bounds };
        
        switch (direction) {
          case 'left':
            newBounds.w = Math.max(0.1, newBounds.w - step);
            break;
          case 'right':
            newBounds.w = Math.min(1, newBounds.w + step);
            break;
          case 'up':
            newBounds.h = Math.max(0.1, newBounds.h - step);
            break;
          case 'down':
            newBounds.h = Math.min(1, newBounds.h + step);
            break;
        }
        
        return { ...p, bounds: newBounds };
      }));
    }, []),

    setFontSize: useCallback((sessionId: string, size: number) => {
      // Font size is handled by TerminalView component
    }, []),

    updateConfig: useCallback((config: any) => {
      window.terminalAPI?.config.save(config);
      configRef.current = config;
    }, []),

    saveSession: useCallback(() => {
      const state: PersistedSessionState = {
        tabs,
        splitPanes,
        activeTabId,
        timestamp: Date.now(),
      };
      window.terminalAPI?.session.save(state);
    }, [tabs, splitPanes, activeTabId]),

    loadSession: useCallback(async () => {
      const persisted = await window.terminalAPI?.session.load();
      if (persisted) {
        await window.terminalAPI?.session.requestRestore(persisted);
      }
    }, []),
  };

  return { sessions, activeSessionId, tabs, activeTabId, splitPanes, actions };
}