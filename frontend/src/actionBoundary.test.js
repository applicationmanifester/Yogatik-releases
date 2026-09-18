import { describe, it, expect, beforeEach } from 'vitest'
import {
  evaluateActionPolicy,
  setHumanControl,
  isHumanControlActive,
  setPolicyPreset,
  POLICY_PRESETS,
  addCustomDenyRule,
  clearCustomDenyRules,
} from './actionBoundary'

describe('actionBoundary Pre-Action Security Policy', () => {
  beforeEach(() => {
    setHumanControl(false)
    setPolicyPreset(POLICY_PRESETS.STANDARD)
    clearCustomDenyRules()
  })

  it('allows benign actions under standard policy', async () => {
    const r1 = await evaluateActionPolicy({
      tool: 'fs_write',
      args: { path: 'src/components/Button.jsx', content: 'export function Button() {}' },
    })
    expect(r1.allowed).toBe(true)

    const r2 = await evaluateActionPolicy({
      tool: 'terminal_run',
      args: { command: 'npm run test' },
    })
    expect(r2.allowed).toBe(true)

    const r3 = await evaluateActionPolicy({
      tool: 'browser_control',
      args: { url: 'https://example.com' },
    })
    expect(r3.allowed).toBe(true)
  })

  it('denies writes to sensitive paths like .env, ssh keys, and system files', async () => {
    const r1 = await evaluateActionPolicy({
      tool: 'fs_write',
      args: { path: '.env', content: 'SECRET=123' },
    })
    expect(r1.allowed).toBe(false)
    expect(r1.rule).toBe('path_boundary_sensitive_file')

    const r2 = await evaluateActionPolicy({
      tool: 'fs_edit',
      args: { path: '/home/user/.ssh/id_rsa', content: 'fake' },
    })
    expect(r2.allowed).toBe(false)
    expect(r2.rule).toBe('path_boundary_sensitive_file')

    const r3 = await evaluateActionPolicy({
      tool: 'fs_delete',
      args: { path: 'c:\\windows\\system32\\drivers\\etc\\hosts' },
    })
    expect(r3.allowed).toBe(false)
  })

  it('denies destructive shell commands', async () => {
    const r1 = await evaluateActionPolicy({
      tool: 'terminal_run',
      args: { command: 'rm -rf /' },
    })
    expect(r1.allowed).toBe(false)
    expect(r1.rule).toBe('shell_boundary_destructive_command')

    const r2 = await evaluateActionPolicy({
      tool: 'proc_start',
      args: { command: 'Format-Volume -DriveLetter C' },
    })
    expect(r2.allowed).toBe(false)

    const r3 = await evaluateActionPolicy({
      tool: 'terminal_exec',
      args: { command: 'diskpart /s script.txt' },
    })
    expect(r3.allowed).toBe(false)
  })

  it('denies browser navigation to restricted cloud metadata & router IPs', async () => {
    const r1 = await evaluateActionPolicy({
      tool: 'browser_control',
      args: { url: 'http://169.254.169.254/latest/meta-data/' },
    })
    expect(r1.allowed).toBe(false)
    expect(r1.rule).toBe('network_boundary_restricted_host')

    const r2 = await evaluateActionPolicy({
      tool: 'web_navigate',
      args: { url: 'http://192.168.1.1/admin' },
    })
    expect(r2.allowed).toBe(false)
  })

  it('blocks all agent actions when Take the Wheel (human takeover) is active', async () => {
    setHumanControl(true, 'User is solving CAPTCHA')
    expect(isHumanControlActive()).toBe(true)

    const r1 = await evaluateActionPolicy({
      tool: 'browser_control',
      args: { action: 'click', ref: 'btn-1' },
    })
    expect(r1.allowed).toBe(false)
    expect(r1.rule).toBe('human_takeover_lockout')
    expect(r1.reason).toContain('User is solving CAPTCHA')

    // Release wheel
    setHumanControl(false)
    expect(isHumanControlActive()).toBe(false)

    const r2 = await evaluateActionPolicy({
      tool: 'browser_control',
      args: { action: 'click', ref: 'btn-1' },
    })
    expect(r2.allowed).toBe(true)
  })

  it('supports custom deny rules', async () => {
    addCustomDenyRule({
      id: 'no_crypto_mining',
      tool: 'terminal_run',
      test: ({ args }) => String(args.command || '').includes('xmrig'),
      reason: 'Cryptomining is disallowed by enterprise policy.',
    })

    const r1 = await evaluateActionPolicy({
      tool: 'terminal_run',
      args: { command: './xmrig -o pool.com' },
    })
    expect(r1.allowed).toBe(false)
    expect(r1.rule).toBe('no_crypto_mining')
    expect(r1.reason).toContain('Cryptomining is disallowed')
  })
})
