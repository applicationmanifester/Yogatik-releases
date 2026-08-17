import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal } from 'xterm';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { TabBar } from './TabBar';
import { TerminalView } from './TerminalView';
import { StatusBar } from './StatusBar';
import { CommandPalette } from './CommandPalette';
import { FindWidget } from './FindWidget';
import { SettingsModal } from './SettingsModal';
import { RecordingsPanel } from './RecordingsPanel';
import { SplitPane, TabState } from '@shared/types';
import { useTerminalSessions } from '../hooks/useTerminalSessions';
import { useKeybindings } from '../hooks/useKeybindings';
import { useConfig } from '../hooks/useConfig';
import { useReducedMotion, useHighContrast, useColorScheme, useFocusVisible, announceToScreenReader } from '../hooks/useAccessibility';

export function TerminalApp() {
  const config = useConfig();
  const { sessions, activeSessionId, tabs, activeTabId, splitPanes, actions } = useTerminalSessions();
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRecordings, setShowRecordings] = useState(false);
  const [findState, setFindState] = useState<{ active: boolean; sessionId?: string }>({ active: false });
  const lastGestureRef = useRef(0);
  
  // Accessibility
  const prefersReducedMotion = useReducedMotion();
  const prefersHighContrast = useHighContrast();
  const colorScheme = useColorScheme();
  useFocusVisible();
  
  // Announce tab changes
  const activeTabForAnnounce = tabs.find(t => t.id === activeTabId);
  useEffect(() => {
    if (activeTabForAnnounce) {
      announceToScreenReader(`Terminal tab: ${activeTabForAnnounce.userTitle || activeTabForAnnounce.title}`);
    }
  }, [activeTabId]);

  // Record user gestures for OSC 52
  const recordGesture = useCallback(() => {
    lastGestureRef.current = Date.now();
    window.terminalAPI?.pty.recordGesture();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      recordGesture();
      
      // Global shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettings(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        setShowRecordings(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        const activeTerminal = document.querySelector('.terminal-focused');
        if (activeTerminal) {
          e.preventDefault();
          const sessionId = activeTerminal.getAttribute('data-session-id');
          if (sessionId) {
            setFindState({ active: true, sessionId });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('click', recordGesture, true);
    window.addEventListener('mousedown', recordGesture, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('click', recordGesture, true);
      window.removeEventListener('mousedown', recordGesture, true);
    };
  }, [recordGesture]);

  const activeTab = tabs.find(t => t.id === activeTabId);
  const activePane = activeTab ? splitPanes.find(p => p.sessionId === activeTab.sessionId) : null;

  return (
    <div className="terminal-app" onKeyDown={recordGesture} onClick={recordGesture} onMouseDown={recordGesture}>
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={actions.setActiveTab}
        onTabClose={actions.closeTab}
        onNewTab={actions.newTab}
        onTabReorder={actions.reorderTabs}
        onTabRename={actions.renameTab}
      />
      
      <div className="terminal-content" role="main">
        {activeTab && (
          <>
            {splitPanes.filter(p => p.sessionId === activeTab.sessionId).length > 1 ? (
              <SplitView
                panes={splitPanes.filter(p => p.sessionId === activeTab.sessionId)}
                sessions={sessions}
                actions={actions}
                activePaneId={activePane?.id}
              />
            ) : (
              <TerminalView
                session={sessions.get(activeTab.sessionId)}
                sessionId={activeTab.sessionId}
                profile={config.profiles[activeTab.sessionId.split('_')[0]] || config.profiles.default}
                onResize={actions.resizeSession}
                onTitleChange={actions.setTabTitle}
                onFocus={actions.focusSession}
              />
            )}
          </>
        )}
        
        {!activeTab && (
          <div className="welcome-screen">
            <h1>Yogatik Terminal</h1>
            <p>Press <kbd>Ctrl+Shift+T</kbd> or click + to create a new terminal</p>
            <p>Press <kbd>Ctrl+Shift+P</kbd> for command palette</p>
          </div>
        )}
      </div>

      <StatusBar
        activeSession={activeTab ? sessions.get(activeTab.sessionId) : null}
        config={config}
        onFontSizeChange={actions.setFontSize}
      />

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          actions={actions}
          config={config}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          config={config}
          onConfigChange={actions.updateConfig}
        />
      )}

      {showRecordings && (
        <RecordingsPanel
          isOpen={showRecordings}
          onClose={() => setShowRecordings(false)}
        />
      )}

      {findState.active && (
        <FindWidget
          sessionId={findState.sessionId!}
          onClose={() => setFindState({ active: false })}
          sessions={sessions}
        />
      )}
    </div>
  );
}

interface SplitViewProps {
  panes: SplitPane[];
  sessions: Map<string, any>;
  actions: any;
  activePaneId?: string;
}

function SplitView({ panes, sessions, actions, activePaneId }: SplitViewProps) {
  // Simple horizontal split for now
  const isHorizontal = panes.length > 1;
  
  return (
    <div className={`split-view ${isHorizontal ? 'horizontal' : 'vertical'}`}>
      {panes.map((pane, index) => (
        <div
          key={pane.id}
          className={`split-pane ${pane.id === activePaneId ? 'active' : ''}`}
          style={{ flex: 1 }}
        >
          <TerminalView
            session={sessions.get(pane.sessionId)}
            sessionId={pane.sessionId}
            profile={null}
            onResize={(id, cols, rows) => actions.resizeSession(id, cols, rows)}
            onTitleChange={(id, title) => actions.setTabTitle(id, title)}
            onFocus={() => actions.focusSession(pane.sessionId)}
          />
          {index < panes.length - 1 && (
            <div className="split-resizer" onMouseDown={(e) => actions.startResize(e, pane.id)} />
          )}
        </div>
      ))}
    </div>
  );
}