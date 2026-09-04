// @vitest-environment node
/**
 * proc_start wraps every command in a shell (cmd.exe /c on Windows, /bin/sh
 * -c on POSIX) — exactly the same shape that produced the documented
 * "terminal_run hung forever" bug: `child.kill()` only signals the SHELL, and
 * a backgrounded grandchild (the actual dev server / watcher / sleep) keeps
 * running, orphaned, after "stop" reports success.
 *
 * This is a REAL reproduction, not a mock: it starts a shell command that
 * backgrounds a long-lived process which writes a heartbeat file on a timer,
 * stops it through the real stopProcess(), and then proves nothing is still
 * writing to that file — the same "measure it, don't just read the code"
 * discipline electronFsBridge.test.js already established for this codebase.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const electronStub = require_('../test/electron-stub.cjs')
const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') return electronStub
  return originalLoad.call(this, request, parent, isMain)
}

const bg = require_('../electron/bgProcesses.cjs')

afterAll(() => { Module._load = originalLoad })

// This whole file is POSIX-only: it shells a `while true` loop and reads its
// heartbeat file. Windows' cmd.exe equivalent would need a different script
// shape — the underlying killTree() fix is exercised for real on Windows by
// the CI-run vitest suite's platform, not asserted here.
const isPosix = process.platform !== 'win32'
const d = isPosix ? describe : describe.skip

d('bgProcesses — proc_stop kills the whole tree, not just the shell', () => {
  let dir
  const started = []

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-bgproc-'))
  })

  afterEach(() => {
    // Belt and suspenders: nothing from a failed assertion should survive the test file.
    for (const p of started.splice(0)) { try { bg.stopProcess(p.id) } catch { /* ignore */ } }
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('kills a backgrounded grandchild, proven by its heartbeat file going stale', async () => {
    const hb = path.join(dir, `hb_${crypto.randomUUID()}.txt`)
    // The shell (`sh -c`) itself returns almost immediately — the LOOP,
    // backgrounded inside it, is the grandchild that only a real tree-kill
    // reaches. A monotonic counter, not a timestamp, is the heartbeat: a
    // %s-resolution clock can land two writes in the same second and make a
    // still-running loop look stale by accident. A counter can only go up.
    const command = `( i=0; while true; do i=$((i+1)); echo $i > ${hb}; sleep 0.05; done & )`
    const res = bg.startProcess({ chatId: 'c1', command, cwd: dir })
    expect(res.success).toBe(true)
    started.push(res)

    // Let the heartbeat loop actually start writing.
    await new Promise(r => setTimeout(r, 300))
    expect(fs.existsSync(hb)).toBe(true)
    const beforeStop = fs.readFileSync(hb, 'utf8')

    const stopRes = bg.stopProcess(res.id)
    expect(stopRes.success).toBe(true)

    // Give a stray, un-killed loop plenty of time to write again — a false
    // pass here (asserting too early) would hide exactly the bug this test
    // exists to catch.
    await new Promise(r => setTimeout(r, 500))
    const afterStop = fs.readFileSync(hb, 'utf8')
    expect(afterStop).toBe(beforeStop)
  }, 10000)

  it('killAllBgProcesses reaches the same grandchild', async () => {
    const hb = path.join(dir, `hb_${crypto.randomUUID()}.txt`)
    const command = `( i=0; while true; do i=$((i+1)); echo $i > ${hb}; sleep 0.05; done & )`
    const res = bg.startProcess({ chatId: 'c1', command, cwd: dir })
    expect(res.success).toBe(true)
    started.push(res)

    await new Promise(r => setTimeout(r, 300))
    const beforeStop = fs.readFileSync(hb, 'utf8')

    bg.killAllBgProcesses()
    started.length = 0 // already killed

    await new Promise(r => setTimeout(r, 500))
    const afterStop = fs.readFileSync(hb, 'utf8')
    expect(afterStop).toBe(beforeStop)
  }, 10000)
})
