import { describe, it, expect } from 'vitest'

// Unit tests for SecureVmSandbox — the CRITICAL fix for the RCE in
// desktop:eval-js. The original code exposed `require` in the VM sandbox
// (`require: (mod) => require(mod)`), letting any IPC caller load arbitrary
// modules from the main process. These tests pin the contract the fix
// promises: no Node.js API is reachable from sandboxed code, the dangerous
// pattern blocklist fires before execution, a hard timeout applies, and the
// frozen standard-JS globals cannot be swapped. The require test FAILS
// against the original vulnerable code (require was available and
// `require('child_process')` succeeded), so the suite is non-vacuous.

import { SecureVmSandbox } from './VmSandbox'

describe('SecureVmSandbox', () => {
  it('evaluates plain JS and returns the result', async () => {
    const sandbox = new SecureVmSandbox()
    const res = await sandbox.execute('return 1 + 2')
    expect(res.success).toBe(true)
    expect(res.result).toBe('3')
  })

  it('supports async code (top-level await)', async () => {
    const sandbox = new SecureVmSandbox()
    const res = await sandbox.execute('return await Promise.resolve(42)')
    expect(res.success).toBe(true)
    expect(res.result).toBe('42')
  })

  it('captures console.log output', async () => {
    const sandbox = new SecureVmSandbox()
    const res = await sandbox.execute(`console.log('hello', 123); return 'done'`)
    expect(res.success).toBe(true)
    expect(res.logs).toContain('hello 123')
    expect(res.output).toBe('hello 123')
    // result is the RETURN value; it falls back to output only when the code
    // returns undefined.
    expect(res.result).toBe('done')
  })

  it('reports thrown errors honestly instead of crashing', async () => {
    const sandbox = new SecureVmSandbox()
    const res = await sandbox.execute(`throw new Error('boom')`)
    expect(res.success).toBe(false)
    expect(res.error).toContain('boom')
  })

  // --- THE RCE FIX: no Node.js API is reachable from the sandbox ---

  it('cannot require modules (the original RCE path)', async () => {
    const sandbox = new SecureVmSandbox()
    // Blocked at the pattern layer before execution even starts
    const res = await sandbox.execute(`return require('child_process')`)
    expect(res.success).toBe(false)
    expect(res.error).toContain('disallowed patterns')
  })

  it('has no require/process/Buffer/global in scope even if patterns were bypassed', async () => {
    const sandbox = new SecureVmSandbox()
    // The names are assembled INSIDE the sandbox from split strings — the
    // probe source itself must not contain the blocklist words, or the
    // pattern layer would refuse the code before it ever ran. `this` inside
    // the wrapper's async IIFE is the sandbox's global proxy.
    const res = await sandbox.execute(`
      const names = ['req' + 'uire', 'proc' + 'ess', 'Buf' + 'fer', 'gl' + 'obal', 'mod' + 'ule']
      return names.map(n => typeof this[n]).join(',')
    `)
    expect(res.success).toBe(true)
    expect(res.result).toBe('undefined,undefined,undefined,undefined,undefined')
  })

  it('blocks eval, Function constructor and dynamic import patterns', async () => {
    const sandbox = new SecureVmSandbox()
    for (const code of [
      `return eval('1+1')`,
      `return Function('return 1')()`,
      `return import('node:fs')`,
    ]) {
      const res = await sandbox.execute(code)
      expect(res.success).toBe(false)
      expect(res.error).toContain('disallowed patterns')
    }
  })

  it('blocks globalThis and __dirname patterns', async () => {
    const sandbox = new SecureVmSandbox()
    for (const code of [
      `return globalThis`,
      `return __dirname`,
      `return __filename`,
    ]) {
      const res = await sandbox.execute(code)
      expect(res.success).toBe(false)
      expect(res.error).toContain('disallowed patterns')
    }
  })

  // --- Frozen globals ---

  it('cannot overwrite a frozen global (JSON stays JSON)', async () => {
    const sandbox = new SecureVmSandbox()
    const res = await sandbox.execute(`JSON = {}; return JSON.parse('{"a":1}').a`)
    expect(res.success).toBe(true)
    expect(res.result).toBe('1')
  })

  it('does not over-block benign code containing blocklist-adjacent words', async () => {
    const sandbox = new SecureVmSandbox()
    // 'processor'/'modular'/'globals' must NOT trip /\bprocess\b/, /\bmodule\b/,
    // /\bglobal\b/ — \b requires a word boundary, so longer words are safe.
    const res = await sandbox.execute(`const processor = 'x'; return processor + 'ular'`)
    expect(res.success).toBe(true)
    expect(res.result).toBe('xular')
  })

  // --- Size and input guards ---

  it('rejects empty or non-string code', async () => {
    const sandbox = new SecureVmSandbox()
    for (const bad of ['', undefined as unknown as string, null as unknown as string, 42 as unknown as string]) {
      const res = await sandbox.execute(bad)
      expect(res.success).toBe(false)
      expect(res.error).toContain('No code provided')
    }
  })

  it('rejects code over the 50KB limit', async () => {
    const sandbox = new SecureVmSandbox()
    const big = 'const x = 1;' + '// ' + 'a'.repeat(51_000)
    const res = await sandbox.execute(big)
    expect(res.success).toBe(false)
    expect(res.error).toContain('Code too long')
  })

  it('enforces the hard timeout on an infinite loop', async () => {
    const sandbox = new SecureVmSandbox({ timeout: 100 })
    const start = Date.now()
    const res = await sandbox.execute('while (true) {}')
    const elapsed = Date.now() - start
    expect(res.success).toBe(false)
    // Terminated well under the 5s default — the timeout actually fired.
    expect(elapsed).toBeLessThan(4000)
    expect(res.error).toBeTruthy()
  })

  it('clears logs between executions', async () => {
    const sandbox = new SecureVmSandbox()
    await sandbox.execute(`console.log('first'); return 1`)
    const second = await sandbox.execute(`return 2`)
    expect(second.logs).toHaveLength(0)
    expect(second.output).toBe('')
  })
})
