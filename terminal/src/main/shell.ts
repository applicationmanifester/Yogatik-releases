import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import type { ShellInfo, ShellFeatures, TerminalProfile } from '../shared/types';

export async function detectShell(profile: TerminalProfile): Promise<ShellInfo> {
  if (profile.shell !== 'auto') {
    return {
      path: profile.shell.path,
      name: profile.shell.name as ShellInfo['name'],
      args: profile.shell.args,
      features: await testShellFeatures(profile.shell.path, profile.shell.args),
    };
  }

  const platform = process.platform;
  const candidates = getShellCandidates(platform);

  for (const candidate of candidates) {
    try {
      const shellInfo = await probeShell(candidate.path, candidate.args);
      if (shellInfo) {
        return shellInfo;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Ultimate fallback
  return {
    path: platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    name: platform === 'win32' ? 'cmd' : 'bash',
    args: platform === 'win32' ? [] : ['-l'],
    features: getBaseFeatures(),
  };
}

function getShellCandidates(platform: string): Array<{ path: string; args: string[] }> {
  const home = os.homedir();
  const candidates: Array<{ path: string; args: string[] }> = [];

  switch (platform) {
    case 'win32': {
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
      const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      const userProfile = process.env.USERPROFILE || home;

      candidates.push(
        { path: path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'), args: ['-NoProfile', '-NoLogo'] },
        { path: path.join(programFiles, 'PowerShell', '7-preview', 'pwsh.exe'), args: ['-NoProfile', '-NoLogo'] },
        { path: path.join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'), args: ['-NoProfile', '-NoLogo'] },
        { path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoProfile', '-NoLogo'] },
        { path: 'C:\\Windows\\System32\\cmd.exe', args: [] },
        { path: path.join(programFiles, 'Git', 'bin', 'bash.exe'), args: ['-l'] },
        { path: path.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'), args: ['-l'] },
        { path: 'C:\\Windows\\System32\\wsl.exe', args: ['~', '-e', 'bash', '-l'] },
        { path: path.join(userProfile, 'scoop', 'apps', 'pwsh', 'current', 'pwsh.exe'), args: ['-NoProfile', '-NoLogo'] },
      );
      break;
    }
    case 'darwin': {
      candidates.push(
        { path: '/bin/zsh', args: ['-l'] },
        { path: '/bin/bash', args: ['-l'] },
        { path: '/opt/homebrew/bin/zsh', args: ['-l'] },
        { path: '/opt/homebrew/bin/bash', args: ['-l'] },
        { path: '/opt/homebrew/bin/fish', args: ['-l'] },
        { path: '/usr/local/bin/zsh', args: ['-l'] },
        { path: '/usr/local/bin/bash', args: ['-l'] },
        { path: '/usr/local/bin/fish', args: ['-l'] },
      );
      break;
    }
    default: { // linux
      candidates.push(
        { path: '/bin/zsh', args: ['-l'] },
        { path: '/bin/bash', args: ['-l'] },
        { path: '/bin/fish', args: ['-l'] },
        { path: '/bin/nu', args: ['-l'] },
        { path: '/usr/bin/zsh', args: ['-l'] },
        { path: '/usr/bin/bash', args: ['-l'] },
        { path: '/usr/bin/fish', args: ['-l'] },
        { path: '/usr/bin/nu', args: ['-l'] },
      );
    }
  }

  // Add $SHELL if set
  if (process.env.SHELL) {
    candidates.unshift({ path: process.env.SHELL, args: ['-l'] });
  }

  return candidates;
}

async function probeShell(shellPath: string, args: string[]): Promise<ShellInfo | null> {
  try {
    // Quick existence check
    const fs = await import('fs/promises');
    await fs.access(shellPath);

    // Get version
    const version = await getShellVersion(shellPath, args);

    // Detect shell name from path
    const name = detectShellName(shellPath);

    // Test features
    const features = await testShellFeatures(shellPath, args);

    return { path: shellPath, name, args, version, features };
  } catch {
    return null;
  }
}

function detectShellName(path: string): ShellInfo['name'] {
  const basename = path.toLowerCase().split(/[/\\]/).pop() || '';
  if (basename.includes('pwsh') || basename.includes('powershell')) return 'pwsh';
  if (basename === 'cmd.exe') return 'cmd';
  if (basename === 'powershell.exe') return 'powershell';
  if (basename === 'zsh') return 'zsh';
  if (basename === 'fish') return 'fish';
  if (basename === 'nu') return 'nu';
  return 'bash';
}

async function getShellVersion(shellPath: string, args: string[]): Promise<string | undefined> {
  const versionArgs: Record<string, string[]> = {
    pwsh: ['-c', '$PSVersionTable.PSVersion.ToString()'],
    powershell: ['-c', '$PSVersionTable.PSVersion.ToString()'],
    cmd: ['/c', 'ver'],
    bash: ['-c', 'echo $BASH_VERSION'],
    zsh: ['-c', 'echo $ZSH_VERSION'],
    fish: ['-c', 'echo $FISH_VERSION'],
    nu: ['-c', 'version'],
  };

  const name = detectShellName(shellPath);
  const testArgs = versionArgs[name] || ['-c', 'echo unknown'];

  return new Promise((resolve) => {
    const proc = spawn(shellPath, testArgs, { timeout: 2000 });
    let stdout = '';
    proc.stdout.on('data', (d) => stdout += d.toString());
    proc.on('close', () => resolve(stdout.trim() || undefined));
    proc.on('error', () => resolve(undefined));
  });
}

async function testShellFeatures(shellPath: string, args: string[]): Promise<ShellFeatures> {
  const name = detectShellName(shellPath);

  // Most modern shells support these
  const base = getBaseFeatures();

  // Shell-specific feature detection
  if (['bash', 'zsh', 'fish'].includes(name)) {
    return {
      ...base,
      osc7: true,
      osc133: true,
      bracketPaste: true,
      promptMarkers: true,
    };
  }

  if (['pwsh', 'powershell'].includes(name)) {
    return {
      ...base,
      osc7: true,
      osc133: false, // Requires PSReadLine module
      bracketPaste: true,
      promptMarkers: false,
    };
  }

  if (name === 'nu') {
    return {
      ...base,
      osc7: true,
      osc133: false,
      bracketPaste: true,
      promptMarkers: false,
    };
  }

  if (name === 'cmd') {
    return {
      ...base,
      osc7: false,
      osc133: false,
      bracketPaste: false,
      promptMarkers: false,
    };
  }

  return base;
}

function getBaseFeatures(): ShellFeatures {
  return {
    osc7: true,
    osc133: false,
    bracketPaste: true,
    promptMarkers: false,
  };
}

export function getShellIntegrationScript(shell: ShellInfo): string {
  const name = shell.name;

  if (name === 'bash') {
    return `# Yogatik Terminal Shell Integration
__yogatik_prompt_start() { printf '\\033]133;A\\033\\\\'; }
__yogatik_prompt_end() { printf '\\033]133;B;%s\\033\\\\' "$?"; }
__yogatik_cwd() { printf '\\033]7;file://%s%s\\033\\\\' "$HOSTNAME" "$PWD"; }
if [[ -z "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="__yogatik_cwd; __yogatik_prompt_end"
else
  PROMPT_COMMAND="__yogatik_cwd; __yogatik_prompt_end; $PROMPT_COMMAND"
fi
PS1="\\[\\033]133;A\\033\\\\\\]${'$'}{PS1}\\[\\033]133;B\\033\\\\\\]"
`;
  }

  if (name === 'zsh') {
    return `
# Yogatik Terminal Shell Integration
function __yogatik_precmd() { print -Pn '\\033]133;A\\033\\\\' }
function __yogatik_preexec() { print -Pn '\\033]133;B;%?\\033\\\\' }
function __yogatik_cwd() { print -Pn '\\033]7;file://%M%~\\033\\\\' }
precmd_functions+=(__yogatik_precmd __yogatik_cwd)
preexec_functions+=(__yogatik_preexec)
`;
  }

  if (name === 'fish') {
    return `
# Yogatik Terminal Shell Integration
function __yogatik_prompt_start --on-event fish_prompt
  printf '\\033]133;A\\033\\\\'
end
function __yogatik_prompt_end --on-event fish_postexec
  printf '\\033]133;B;%d\\033\\\\' \$status
end
function __yogatik_cwd --on-event fish_prompt
  printf '\\033]7;file://%s%s\\033\\\\' (hostname) (pwd)
end
`;
  }

  if (name === 'pwsh' || name === 'powershell') {
    return `# Yogatik Terminal Shell Integration (requires PSReadLine)
if (Get-Module -ListAvailable PSReadLine) {
  Import-Module PSReadLine
  Set-PSReadLineOption -EditMode Emacs
  $function:prompt = {
    $host.UI.Write("\`e]133;A\`e\\\\")
    & $function:prompt
    $host.UI.Write("\`e]133;B;\$LASTEXITCODE\`e\\\\")
  }
  Register-EngineEvent -SourceIdentifier PowerShell.OnPrompt -Action {
    $host.UI.Write("\`e]7;file://\$env:COMPUTERNAME\$PWD\`e\\\\")
  } | Out-Null
}
`;
  }

  return '';
}