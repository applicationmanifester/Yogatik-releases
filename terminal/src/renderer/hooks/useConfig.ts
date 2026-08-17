import { useState, useEffect, useCallback } from 'react';
import { CoreConfig, TerminalProfile } from '@shared/types';

export function useConfig(): CoreConfig {
  const [config, setConfig] = useState<CoreConfig | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      try {
        const cfg = await window.terminalAPI?.config.get();
        if (mounted && cfg) {
          setConfig(cfg);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    loadConfig();

    const unsubscribe = window.terminalAPI?.config.onChanged((cfg) => {
      if (mounted) {
        setConfig(cfg);
      }
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  // Return default config while loading
  return config || getDefaultConfig();
}

function getDefaultConfig(): CoreConfig {
  return {
    defaultProfile: 'default',
    confirmClose: true,
    confirmMultipleTabs: true,
    startupMode: 'restore',
    checkUpdates: true,
    rendering: {
      renderer: 'webgl',
      gpuAcceleration: true,
      vsync: true,
      maxFps: 60,
    },
    performance: {
      scrollbackLines: 10000,
      altScrollbackLines: 1000,
      repaintThrottleMs: 0,
      dirtyRowThreshold: 10,
    },
    profiles: {
      default: getDefaultProfile(),
    },
    keybindings: {},
    shellIntegration: {
      enabled: true,
      autoInject: true,
      osc7: true,
      osc133: true,
      bracketPaste: true,
    },
    security: {
      ptySandbox: true,
      osc52WriteRequiresGesture: true,
      denyFileUris: true,
      deniedSequences: [],
    },
    advanced: {
      experimentalKittyGraphics: false,
      experimentalSixel: false,
      logPtyTraffic: false,
      auditLog: false,
    },
  };
}

function getDefaultProfile(): TerminalProfile {
  return {
    id: 'default',
    name: 'Default',
    shell: 'auto',
    env: {},
    cwd: 'home',
    cols: 120,
    rows: 32,
    scrollbackLines: 10000,
    font: {
      family: 'JetBrains Mono',
      size: 13,
      lineHeight: 1.4,
      letterSpacing: 0,
      ligatures: true,
      fallbackFamilies: ['Noto Color Emoji', 'Symbols Nerd Font Mono'],
    },
    theme: {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      cursorAccent: '#1e1e2e',
      selection: '#45475a',
      ansi: {
        black: '#1e1e2e',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#bac2de',
      },
      ansiBright: {
        black: '#6c7086',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#f5c2e7',
        cyan: '#94e2d5',
        white: '#a6adc8',
      },
    },
    bell: {
      enabled: true,
      sound: 'system',
      visual: true,
      flashDuration: 100,
    },
    cursor: {
      style: 'block',
      blink: true,
      blinkRate: 530,
    },
    mouse: {
      enabled: true,
      protocol: 'sgr',
      hideWhenTyping: true,
    },
    keybindings: [],
  };
}

export function useProfile(profileId: string): TerminalProfile | undefined {
  const config = useConfig();
  return config.profiles[profileId] || config.profiles.default;
}