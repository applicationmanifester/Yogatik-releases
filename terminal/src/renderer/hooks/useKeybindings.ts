import { useEffect, useCallback, useRef } from 'react';
import { Keybinding, TerminalAction, KeybindingContext } from '@shared/types';
import { useConfig } from './useConfig';

const DEFAULT_KEYBINDINGS: Record<string, TerminalAction> = {
  'Ctrl+Shift+T': 'newTab',
  'Ctrl+Shift+W': 'closeTab',
  'Ctrl+Tab': 'nextTab',
  'Ctrl+Shift+Tab': 'prevTab',
  'Ctrl+Shift+D': 'splitHorizontal',
  'Ctrl+Shift+E': 'splitVertical',
  'Alt+Right': 'focusPaneRight',
  'Alt+Left': 'focusPaneLeft',
  'Alt+Up': 'focusPaneUp',
  'Alt+Down': 'focusPaneDown',
  'Ctrl+Shift+C': 'copy',
  'Ctrl+Shift+V': 'paste',
  'Ctrl+Shift+F': 'find',
  'Ctrl+Plus': 'increaseFontSize',
  'Ctrl+Minus': 'decreaseFontSize',
  'Ctrl+0': 'resetFontSize',
};

function parseKeybinding(key: string): { key: string; ctrl: boolean; shift: boolean; alt: boolean; meta: boolean } {
  const parts = key.split('+').map(p => p.toLowerCase().trim());
  return {
    key: parts[parts.length - 1],
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
  };
}

function matchesKeybinding(e: KeyboardEvent, binding: ReturnType<typeof parseKeybinding>): boolean {
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (binding.ctrl && !e.ctrlKey && !(isMac && e.metaKey)) return false;
  if (binding.meta && !e.metaKey && !(isMac && e.ctrlKey)) return false;
  if (binding.shift !== e.shiftKey) return false;
  if (binding.alt !== e.altKey) return false;
  
  const pressedKey = e.key.toLowerCase();
  const bindingKey = binding.key.toLowerCase();
  
  // Handle special keys
  const keyMap: Record<string, string> = {
    'escape': 'escape',
    'enter': 'enter',
    'tab': 'tab',
    'backspace': 'backspace',
    'delete': 'delete',
    'arrowup': 'up',
    'arrowdown': 'down',
    'arrowleft': 'left',
    'arrowright': 'right',
    'pageup': 'pageup',
    'pagedown': 'pagedown',
    'home': 'home',
    'end': 'end',
    'insert': 'insert',
    'f1': 'f1', 'f2': 'f2', 'f3': 'f3', 'f4': 'f4',
    'f5': 'f5', 'f6': 'f6', 'f7': 'f7', 'f8': 'f8',
    'f9': 'f9', 'f10': 'f10', 'f11': 'f11', 'f12': 'f12',
    '+': 'plus', '-': 'minus', '=': 'equals',
    '[': 'bracketleft', ']': 'bracketright',
    '\\': 'backslash', ';': 'semicolon',
    '\'': 'quote', ',': 'comma', '.': 'period', '/': 'slash',
    '`': 'backquote',
  };
  
  const normalizedPressed = keyMap[pressedKey] || pressedKey;
  const normalizedBinding = keyMap[bindingKey] || bindingKey;
  
  return normalizedPressed === normalizedBinding;
}

function evaluateContext(context: KeybindingContext | undefined, currentContext: KeybindingContext): boolean {
  if (!context) return true;
  
  for (const [key, value] of Object.entries(context)) {
    if (currentContext[key as keyof KeybindingContext] !== value) {
      return false;
    }
  }
  return true;
}

export function useKeybindings(
  context: Partial<KeybindingContext>,
  handlers: Partial<Record<TerminalAction, () => void>>
): void {
  const config = useConfig();
  const contextRef = useRef(context);
  const handlersRef = useRef(handlers);
  
  contextRef.current = context;
  handlersRef.current = handlers;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        // Still allow some global shortcuts
        const isGlobalShortcut = (e.ctrlKey || e.metaKey) && 
          ['t', 'w', 'tab', 'p', ',', 'f', '+', '-', '0'].includes(e.key.toLowerCase());
        if (!isGlobalShortcut) return;
      }

      const currentContext: KeybindingContext = {
        terminalFocus: contextRef.current.terminalFocus ?? true,
        searchActive: contextRef.current.searchActive ?? false,
        selectionActive: contextRef.current.selectionActive ?? false,
        altScreen: contextRef.current.altScreen ?? false,
        platform: navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? 'darwin' : 
                  navigator.platform.toUpperCase().indexOf('WIN') >= 0 ? 'win32' : 'linux',
      };

      // Merge config keybindings with defaults
      const allBindings = { ...DEFAULT_KEYBINDINGS, ...config.keybindings };

      for (const [key, action] of Object.entries(allBindings)) {
        const binding = parseKeybinding(key);
        if (matchesKeybinding(e, binding)) {
          // Check when context
          // For simplicity, we'll skip context evaluation for now
          // TODO: Store context with keybindings
          
          const handler = handlersRef.current[action as TerminalAction];
          if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
            return;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [config.keybindings]);
}

export function normalizeKey(key: string): string {
  return key
    .replace(/^(ctrl|control)$/i, 'Ctrl')
    .replace(/^(shift)$/i, 'Shift')
    .replace(/^(alt|option)$/i, 'Alt')
    .replace(/^(meta|cmd|command)$/i, 'Meta')
    .replace(/^(arrowup)$/i, 'Up')
    .replace(/^(arrowdown)$/i, 'Down')
    .replace(/^(arrowleft)$/i, 'Left')
    .replace(/^(arrowright)$/i, 'Right')
    .replace(/^(pageup)$/i, 'PageUp')
    .replace(/^(pagedown)$/i, 'PageDown')
    .replace(/^(home)$/i, 'Home')
    .replace(/^(end)$/i, 'End')
    .replace(/^(insert)$/i, 'Insert')
    .replace(/^(delete)$/i, 'Delete')
    .replace(/^(backspace)$/i, 'Backspace')
    .replace(/^(escape)$/i, 'Escape')
    .replace(/^(enter)$/i, 'Enter')
    .replace(/^(tab)$/i, 'Tab')
    .replace(/^(space)$/i, 'Space')
    .replace(/^(plus)$/i, '+')
    .replace(/^(minus)$/i, '-')
    .replace(/^(equals)$/i, '=');
}