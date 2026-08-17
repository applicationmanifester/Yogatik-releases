import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from 'xterm';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { TerminalSession, TerminalProfile } from '@shared/types';
import { useKeybindings } from '../hooks/useKeybindings';
import { GraphicsOverlay } from './GraphicsOverlay';

interface TerminalViewProps {
  session: TerminalSession | undefined;
  sessionId: string;
  profile: TerminalProfile | null;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onTitleChange: (sessionId: string, title: string) => void;
  onFocus: (sessionId: string) => void;
}

export const TerminalView = forwardRef<HTMLDivElement, TerminalViewProps>(
  ({ session, sessionId, profile, onResize, onTitleChange, onFocus }, ref) => {
    const terminalContainerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const webglAddonRef = useRef<WebglAddon | null>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const [cols, setCols] = useState(120);
    const [rows, setRows] = useState(32);
    const [isFocused, setIsFocused] = useState(false);
    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const fontSizeRef = useRef(13);
    const lineHeightRef = useRef(1.4);
    const letterSpacingRef = useRef(0);
    const ligaturesRef = useRef(true);
    const themeRef = useRef<any>(null);
    const pendingWriteRef = useRef<Uint8Array[]>([]);
    const isProcessingRef = useRef(false);

    // Expose terminal instance to parent
    useImperativeHandle(ref, () => ({
      focus: () => terminalRef.current?.focus(),
      getTerminal: () => terminalRef.current,
      search: (query: string, regex: boolean, caseSensitive: boolean) => {
        if (!searchAddonRef.current) return [];
        return searchAddonRef.current.findNext(query, { regex, caseSensitive });
      },
      clearSelection: () => terminalRef.current?.clearSelection(),
      selectAll: () => terminalRef.current?.selectAll(),
      copy: () => terminalRef.current?.copy(),
      paste: () => terminalRef.current?.paste(),
    }), []);

    // Initialize terminal
    useEffect(() => {
      if (!terminalContainerRef.current || terminalRef.current) return;

      const term = new Terminal({
        cols,
        rows,
        cursorBlink: true,
        cursorStyle: 'block',
        fontFamily: profile?.font.family || 'JetBrains Mono',
        fontSize: profile?.font.size || 13,
        lineHeight: profile?.font.lineHeight || 1.4,
        letterSpacing: profile?.font.letterSpacing || 0,
        fontLigatures: profile?.font.ligatures !== false,
        allowTransparency: true,
        theme: {
          background: profile?.theme.background || '#1e1e2e',
          foreground: profile?.theme.foreground || '#cdd6f4',
          cursor: profile?.theme.cursor || '#f5e0dc',
          cursorAccent: profile?.theme.cursorAccent || '#1e1e2e',
          selection: profile?.theme.selection || '#45475a',
          black: profile?.theme.ansi.black,
          red: profile?.theme.ansi.red,
          green: profile?.theme.ansi.green,
          yellow: profile?.theme.ansi.yellow,
          blue: profile?.theme.ansi.blue,
          magenta: profile?.theme.ansi.magenta,
          cyan: profile?.theme.ansi.cyan,
          white: profile?.theme.ansi.white,
          brightBlack: profile?.theme.ansiBright.black,
          brightRed: profile?.theme.ansiBright.red,
          brightGreen: profile?.theme.ansiBright.green,
          brightYellow: profile?.theme.ansiBright.yellow,
          brightBlue: profile?.theme.ansiBright.blue,
          brightMagenta: profile?.theme.ansiBright.magenta,
          brightCyan: profile?.theme.ansiBright.cyan,
          brightWhite: profile?.theme.ansiBright.white,
        },
        // Bell
        bellStyle: profile?.bell.visual ? 'visual' : 'none',
        // Scrollback
        scrollback: profile?.scrollbackLines || 10000,
        // Mouse
        enableMouseEvents: profile?.mouse.enabled !== false,
        // Allow proposed API for advanced features
        allowProposedApi: true,
        // Performance optimizations
        fastScrollModifier: 'alt',
        fastScrollSensitivity: 5,
        minimumContrastRatio: 1,
        // WebGL renderer options
        rendererType: 'canvas', // Use canvas for better compatibility, WebGL addon will handle GPU
      });

      // Addons
      const webgl = new WebglAddon();
      term.loadAddon(webgl);
      webglAddonRef.current = webgl;

      const search = new SearchAddon();
      term.loadAddon(search);
      searchAddonRef.current = search;

      const unicode11 = new Unicode11Addon();
      term.loadAddon(unicode11);

      // Open terminal
      term.open(terminalContainerRef.current!);
      terminalRef.current = term;
      themeRef.current = profile?.theme;

      // Handle data from PTY
      const handleData = (e: any) => {
        if (e.sessionId === sessionId && e.data) {
          const decoder = new TextDecoder();
          const text = decoder.decode(new Uint8Array(e.data));
          writeToTerminal(text);
        }
      };

      window.terminalAPI?.pty.onData(handleData);

      // Handle resize
      term.onResize(({ cols: newCols, rows: newRows }) => {
        setCols(newCols);
        setRows(newRows);
        onResize(sessionId, newCols, newRows);
      });

      // Handle title changes
      term.onTitleChange((title) => {
        onTitleChange(sessionId, title);
      });

      // Handle focus
      term.onFocusChange((focused) => {
        setIsFocused(focused);
        if (focused) {
          onFocus(sessionId);
        }
      });

      // Handle binary data (for images, etc.)
      term.onBinary((data) => {
        // Handle binary protocols if needed
        console.log('Binary data received:', data);
      });

      // Write any pending data
      processPendingWrites();

      // Cleanup
      return () => {
        window.terminalAPI?.pty.off('data', handleData);
        term.dispose();
        webgl.dispose();
        search.dispose();
        unicode11.dispose();
        terminalRef.current = null;
        webglAddonRef.current = null;
        searchAddonRef.current = null;
      };
    }, [sessionId, cols, rows, profile, onResize, onTitleChange, onFocus]);

    // Write data to terminal with batching
    const writeToTerminal = useCallback((text: string) => {
      const term = terminalRef.current;
      if (!term) {
        pendingWriteRef.current.push(new TextEncoder().encode(text));
        return;
      }

      // Check if we're in the middle of processing
      if (isProcessingRef.current) {
        pendingWriteRef.current.push(new TextEncoder().encode(text));
        return;
      }

      isProcessingRef.current = true;
      term.write(text);
      processPendingWrites();
    }, []);

    const processPendingWrites = useCallback(() => {
      const term = terminalRef.current;
      if (!term || pendingWriteRef.current.length === 0) {
        isProcessingRef.current = false;
        return;
      }

      const pending = pendingWriteRef.current.splice(0, pendingWriteRef.current.length);
      for (const data of pending) {
        const decoder = new TextDecoder();
        term.write(decoder.decode(data));
      }
      isProcessingRef.current = false;
    }, []);

    // Handle profile/theme changes
    useEffect(() => {
      if (!terminalRef.current || !profile) return;

      const term = terminalRef.current;
      
      // Update font
      term.options.fontFamily = profile.font.family;
      term.options.fontSize = profile.font.size;
      term.options.lineHeight = profile.font.lineHeight;
      term.options.letterSpacing = profile.font.letterSpacing;
      term.options.fontLigatures = profile.font.ligatures;
      fontSizeRef.current = profile.font.size;
      lineHeightRef.current = profile.font.lineHeight;
      letterSpacingRef.current = profile.font.letterSpacing;
      ligaturesRef.current = profile.font.ligatures !== false;

      // Update theme
      const theme = profile.theme;
      term.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        cursorAccent: theme.cursorAccent,
        selection: theme.selection,
        black: theme.ansi.black,
        red: theme.ansi.red,
        green: theme.ansi.green,
        yellow: theme.ansi.yellow,
        blue: theme.ansi.blue,
        magenta: theme.ansi.magenta,
        cyan: theme.ansi.cyan,
        white: theme.ansi.white,
        brightBlack: theme.ansiBright.black,
        brightRed: theme.ansiBright.red,
        brightGreen: theme.ansiBright.green,
        brightYellow: theme.ansiBright.yellow,
        brightBlue: theme.ansiBright.blue,
        brightMagenta: theme.ansiBright.magenta,
        brightCyan: theme.ansiBright.cyan,
        brightWhite: theme.ansiBright.white,
      };
      themeRef.current = theme;

      // Update bell
      term.options.bellStyle = profile.bell.visual ? 'visual' : 'none';

      // Update cursor
      term.options.cursorStyle = profile.cursor.style;
      term.options.cursorBlink = profile.cursor.blink;

      // Update mouse
      term.options.enableMouseEvents = profile.mouse.enabled;

      // Refresh
      term.refresh(0, term.rows - 1);
    }, [profile]);

    // Handle incoming PTY data
    useEffect(() => {
      if (!session) return;

      // Session data is handled via the event listener in the init effect
      // This effect handles session state changes
      if (session.state === 'exited') {
        terminalRef.current?.write(`\r\n[Process exited with code ${session.exitCode}]\r\n`);
      } else if (session.state === 'error') {
        terminalRef.current?.write('\r\n[Process error]\r\n');
      }
    }, [session?.state, session?.exitCode]);

    // Resize observer for container
    useEffect(() => {
      const container = terminalContainerRef.current;
      if (!container) return;

      resizeObserverRef.current = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          const term = terminalRef.current;
          if (!term) return;

          const charWidth = Math.max(1, Math.floor(width / (term.options.fontSize || 13) * 1.6));
          const charHeight = Math.max(1, Math.floor(height / (term.options.fontSize || 13) * (term.options.lineHeight || 1.4)));

          if (charWidth !== cols || charHeight !== rows) {
            setCols(charWidth);
            setRows(charHeight);
            term.resize(charWidth, charHeight);
            onResize(sessionId, charWidth, charHeight);
          }
        }
      });

      resizeObserverRef.current.observe(container);
      return () => resizeObserverRef.current?.disconnect();
    }, [cols, rows, sessionId, onResize]);

    // Keybindings for terminal-specific actions
    useKeybindings(
      { terminalFocus: isFocused, altScreen: terminalRef.current?.buffer.active.type === 'alt' },
      {
        copy: () => terminalRef.current?.copy(),
        paste: () => terminalRef.current?.paste(),
        find: () => {}, // Handled by parent
        increaseFontSize: () => {
          const newSize = Math.min(24, fontSizeRef.current + 1);
          fontSizeRef.current = newSize;
          if (terminalRef.current) terminalRef.current.options.fontSize = newSize;
        },
        decreaseFontSize: () => {
          const newSize = Math.max(8, fontSizeRef.current - 1);
          fontSizeRef.current = newSize;
          if (terminalRef.current) terminalRef.current.options.fontSize = newSize;
        },
        resetFontSize: () => {
          fontSizeRef.current = profile?.font.size || 13;
          if (terminalRef.current) terminalRef.current.options.fontSize = fontSizeRef.current;
        },
        scrollUp: () => terminalRef.current?.scrollLines(-1),
        scrollDown: () => terminalRef.current?.scrollLines(1),
        scrollPageUp: () => terminalRef.current?.scrollPages(-1),
        scrollPageDown: () => terminalRef.current?.scrollPages(1),
        scrollTop: () => terminalRef.current?.scrollToTop(),
        scrollBottom: () => terminalRef.current?.scrollToBottom(),
        clearScrollback: () => terminalRef.current?.clear(),
        selectAll: () => terminalRef.current?.selectAll(),
      }
    );

    // Handle paste
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text');
      // Bracketed paste mode
      terminalRef.current?.write('\x1b[200~' + text + '\x1b[201~');
    }, []);

    return (
      <div
        ref={terminalContainerRef}
        className={`terminal-view ${isFocused ? 'terminal-focused' : ''}`}
        data-session-id={sessionId}
        onPaste={handlePaste}
        onClick={() => terminalRef.current?.focus()}
        onMouseDown={() => terminalRef.current?.focus()}
        style={{ width: '100%', height: '100%', position: 'relative' }}
      >
        <GraphicsOverlay sessionId={sessionId} terminalRef={terminalContainerRef} />
      </div>
    );
  }
);

TerminalView.displayName = 'TerminalView';