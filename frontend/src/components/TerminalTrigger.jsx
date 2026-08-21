import React, { useState } from 'react';
import { Monitor } from 'lucide-react';
import { TerminalPanel } from './TerminalPanel';

/**
 * Small helper component that renders a button to open the interactive PTY terminal.
 * It keeps its own open/close state and forwards it to TerminalPanel.
 */
export default function TerminalTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Open Terminal"
        className="terminal-trigger-btn"
        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <Monitor size={18} />
        <span>Terminal</span>
      </button>
      <TerminalPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
