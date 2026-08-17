import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, ChevronRight, Terminal, Settings, FileText, Copy, Maximize2, Minimize2, Keyboard, Bell, Shield } from 'lucide-react';
import { TerminalAction, CoreConfig } from '@shared/types';

interface CommandPaletteProps {
  onClose: () => void;
  actions: any;
  config: CoreConfig;
}

const COMMANDS: Array<{ id: string; label: string; description: string; action: TerminalAction; keys?: string; icon?: React.ReactNode }> = [
  { id: 'new-tab', label: 'New Tab', description: 'Create a new terminal tab', action: 'newTab', keys: 'Ctrl+Shift+T', icon: <FileText size={16} /> },
  { id: 'close-tab', label: 'Close Tab', description: 'Close the current tab', action: 'closeTab', keys: 'Ctrl+Shift+W', icon: <X size={16} /> },
  { id: 'next-tab', label: 'Next Tab', description: 'Switch to the next tab', action: 'nextTab', keys: 'Ctrl+Tab', icon: <ChevronRight size={16} /> },
  { id: 'prev-tab', label: 'Previous Tab', description: 'Switch to the previous tab', action: 'prevTab', keys: 'Ctrl+Shift+Tab', icon: <ChevronRight size={16} /> },
  { id: 'split-h', label: 'Split Horizontally', description: 'Split terminal horizontally', action: 'splitHorizontal', keys: 'Ctrl+Shift+D', icon: <Maximize2 size={16} /> },
  { id: 'split-v', label: 'Split Vertically', description: 'Split terminal vertically', action: 'splitVertical', keys: 'Ctrl+Shift+E', icon: <Maximize2 size={16} /> },
  { id: 'copy', label: 'Copy', description: 'Copy selection', action: 'copy', keys: 'Ctrl+Shift+C', icon: <Copy size={16} /> },
  { id: 'paste', label: 'Paste', description: 'Paste from clipboard', action: 'paste', keys: 'Ctrl+Shift+V', icon: <Copy size={16} /> },
  { id: 'find', label: 'Find', description: 'Find in terminal', action: 'find', keys: 'Ctrl+Shift+F', icon: <Search size={16} /> },
  { id: 'increase-font', label: 'Increase Font Size', description: 'Increase font size', action: 'increaseFontSize', keys: 'Ctrl++', icon: <Terminal size={16} /> },
  { id: 'decrease-font', label: 'Decrease Font Size', description: 'Decrease font size', action: 'decreaseFontSize', keys: 'Ctrl+-', icon: <Terminal size={16} /> },
  { id: 'reset-font', label: 'Reset Font Size', description: 'Reset font size to default', action: 'resetFontSize', keys: 'Ctrl+0', icon: <Terminal size={16} /> },
  { id: 'clear-scrollback', label: 'Clear Scrollback', description: 'Clear terminal scrollback', action: 'clearScrollback', icon: <X size={16} /> },
  { id: 'select-all', label: 'Select All', description: 'Select all text in terminal', action: 'selectAll', keys: 'Ctrl+A', icon: <FileText size={16} /> },
  { id: 'scroll-top', label: 'Scroll to Top', description: 'Scroll to top of terminal', action: 'scrollTop', icon: <ChevronRight size={16} /> },
  { id: 'scroll-bottom', label: 'Scroll to Bottom', description: 'Scroll to bottom of terminal', action: 'scrollBottom', icon: <ChevronRight size={16} /> },
  { id: 'settings', label: 'Open Settings', description: 'Open settings panel', action: 'openConfig', keys: 'Ctrl+,', icon: <Settings size={16} /> },
  { id: 'toggle-fullscreen', label: 'Toggle Fullscreen', description: 'Toggle fullscreen mode', action: 'toggleFullscreen', keys: 'F11', icon: <Maximize2 size={16} /> },
];

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function highlightMatch(query: string, text: string): React.ReactNode {
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let qi = 0;
  
  for (let i = 0; i < text.length && qi < q.length; i++) {
    if (text[i].toLowerCase() === q[qi]) {
      if (i > lastIndex) {
        parts.push(text.slice(lastIndex, i));
      }
      parts.push(<mark key={i}>{text[i]}</mark>);
      lastIndex = i + 1;
      qi++;
    }
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

export function CommandPalette({ onClose, actions, config }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filteredCommands = COMMANDS.filter(cmd => 
    fuzzyMatch(query, cmd.label) || fuzzyMatch(query, cmd.description) || (cmd.keys && fuzzyMatch(query, cmd.keys))
  );

  useEffect(() => {
    inputRef.current?.focus();
    setSelectedIndex(0);
  }, []);

  useEffect(() => {
    if (listRef.current && filteredCommands[selectedIndex]) {
      const item = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, filteredCommands]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex]);
        }
        break;
      case 'Tab':
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
        break;
    }
  };

  const executeCommand = (cmd: typeof COMMANDS[0]) => {
    const handler = actions[cmd.action];
    if (handler) {
      handler();
    }
    onClose();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command Palette">
        <div className="command-palette-header">
          <Search size={18} className="search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="command-palette-input"
            autoComplete="off"
            spellCheck={false}
            aria-label="Command search"
          />
          <kbd className="command-palette-hint">Esc to close</kbd>
        </div>
        
        <div className="command-palette-list" ref={listRef} role="listbox" aria-label="Commands">
          {filteredCommands.length === 0 ? (
            <div className="command-palette-empty">
              No commands found
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <div
                key={cmd.id}
                data-index={index}
                className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => executeCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="command-icon">{cmd.icon}</span>
                <div className="command-info">
                  <div className="command-label">
                    {highlightMatch(query, cmd.label)}
                  </div>
                  <div className="command-description">
                    {highlightMatch(query, cmd.description)}
                  </div>
                </div>
                {cmd.keys && <kbd className="command-keys">{cmd.keys}</kbd>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}