import React, { useState, useRef, useEffect } from 'react';
import { TerminalSession, CoreConfig } from '@shared/types';
import { Minus, Plus, ChevronDown, Wifi, WifiOff, Bell, BellOff, Shield, AlertCircle } from 'lucide-react';

interface StatusBarProps {
  activeSession: TerminalSession | null;
  config: CoreConfig;
  onFontSizeChange: (sessionId: string, size: number) => void;
}

export function StatusBar({ activeSession, config, onFontSizeChange }: StatusBarProps) {
  const [showFontMenu, setShowFontMenu] = useState(false);
  const [showEncodingMenu, setShowEncodingMenu] = useState(false);
  const [showLineEndingMenu, setShowLineEndingMenu] = useState(false);
  const fontMenuRef = useRef<HTMLDivElement>(null);

  const profile = activeSession ? config.profiles[activeSession.profileId] : config.profiles.default;
  const fontSize = profile?.font?.size || 13;
  const encoding = 'UTF-8';
  const lineEnding = 'LF';

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (fontMenuRef.current && !fontMenuRef.current.contains(e.target as Node)) {
        setShowFontMenu(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const statusItems = [
    {
      label: `${activeSession?.cols || 80} × ${activeSession?.rows || 24}`,
      tooltip: 'Terminal size',
    },
    {
      label: encoding,
      tooltip: 'Encoding',
      onClick: () => setShowEncodingMenu(!showEncodingMenu),
      menu: showEncodingMenu && (
        <div className="status-menu">
          <div className="menu-item">UTF-8</div>
          <div className="menu-item">UTF-16</div>
          <div className="menu-item">Latin1</div>
        </div>
      ),
    },
    {
      label: lineEnding,
      tooltip: 'Line ending',
      onClick: () => setShowLineEndingMenu(!showLineEndingMenu),
      menu: showLineEndingMenu && (
        <div className="status-menu">
          <div className="menu-item">LF (Unix)</div>
          <div className="menu-item">CRLF (Windows)</div>
          <div className="menu-item">CR (Classic Mac)</div>
        </div>
      ),
    },
    {
      label: activeSession?.shell?.name?.toUpperCase() || 'SHELL',
      tooltip: 'Shell',
    },
    {
      label: activeSession?.cwd?.split('/').pop() || '~',
      tooltip: 'Working directory',
      className: 'cwd',
    },
  ];

  return (
    <div className="status-bar" role="statusbar">
      <div className="status-left">
        {statusItems.map((item, index) => (
          <div
            key={index}
            className={`status-item ${item.className || ''}`}
            onClick={item.onClick}
            title={item.tooltip}
          >
            {item.label}
            {item.menu && (
              <div className="status-dropdown" style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 100 }}>
                {item.menu}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="status-center">
        {activeSession?.state === 'exited' && (
          <span className="status-indicator exited">
            <AlertCircle size={12} />
            Exited {activeSession.exitCode !== undefined ? `(${activeSession.exitCode})` : ''}
          </span>
        )}
        {activeSession?.state === 'error' && (
          <span className="status-indicator error">
            <AlertCircle size={12} />
            Error
          </span>
        )}
        {activeSession?.state === 'starting' && (
          <span className="status-indicator starting">
            <span className="spinner" />
            Starting...
          </span>
        )}
        {activeSession?.isModified && (
          <span className="status-indicator modified">
            <Bell size={12} />
            Bell
          </span>
        )}
      </div>

      <div className="status-right">
        <div
          className="status-item font-size"
          onClick={() => setShowFontMenu(!showFontMenu)}
          title="Font size"
        >
          <span>{fontSize}px</span>
          <ChevronDown size={12} />
          {showFontMenu && (
            <div ref={fontMenuRef} className="font-size-menu status-dropdown">
              <div className="font-size-header">Font Size</div>
              <div className="font-size-controls">
                <button onClick={() => onFontSizeChange(activeSession?.id || '', fontSize - 1)}>−</button>
                <span>{fontSize}px</span>
                <button onClick={() => onFontSizeChange(activeSession?.id || '', fontSize + 1)}>+</button>
              </div>
              <div className="font-size-presets">
                {[10, 11, 12, 13, 14, 16, 18, 20, 24].map(size => (
                  <button
                    key={size}
                    className={size === fontSize ? 'active' : ''}
                    onClick={() => onFontSizeChange(activeSession?.id || '', size)}
                  >
                    {size}px
                  </button>
                ))}
              </div>
              <div className="font-size-divider" />
              <div className="font-size-row">
                <label>
                  <input
                    type="checkbox"
                    checked={profile?.font?.ligatures}
                    onChange={(e) => {/* TODO: Toggle ligatures */}}
                  />
                  Ligatures
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="status-item encoding">
          {encoding}
        </div>

        <div className="status-item line-ending">
          {lineEnding}
        </div>

        <div className="status-item shell">
          {activeSession?.shell?.name?.toUpperCase() || 'SHELL'}
        </div>
      </div>
    </div>
  );
}