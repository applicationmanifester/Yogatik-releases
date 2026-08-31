// @vitest-environment node
//
// Per-chat isolation is a HABIT, not a logic error anyone reasons their way
// into. Two chats really do run at once — `aborters` and `loadingMap` in
// App.jsx are both keyed by clientId — and a tool that resolves its workspace
// from the ambient slot gets whichever chat entered LAST, not the one that
// called it. The symptom is a file written into another conversation's folder,
// a shell command run in the wrong repo, or a browser action driving another
// chat's logged-in tab. None of them throw. All of them look like success.
//
// So this file is mostly a grep, in the same spirit as safeWindow.test.js and
// browserActions.test.js: it fails when a tool reads the ambient context with
// no explicit override.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withWorkspaceContext, getWorkspaceCtx, concurrentChats } from './localFs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** Tool modules that reach the user's machine and therefore must be scoped. */
const SCOPED = [
  'localFs.js', 'terminalRun.js', 'devTools.js', 'browserControl.js',
  'watchFolder.js', 'todo.js', 'spawnAgents.js', 'index.js', 'crewRunner.js',
]

describe('no tool reads the ambient workspace context', () => {
  for (const file of SCOPED) {
    it(`${file} always passes an explicit ctx`, () => {
      const src = fs.readFileSync(path.join(HERE, file), 'utf8')
      // getWorkspaceCtx() with an EMPTY argument list is the bug. With an
      // argument — opts?.ctx, ctx, callerCtx — it is correct.
      const bare = [...src.matchAll(/getWorkspaceCtx\(\s*\)/g)]
      expect(
        bare.length,
        `${file} calls getWorkspaceCtx() with no argument ${bare.length} time(s). ` +
        'Thread the calling chat down: getWorkspaceCtx(opts?.ctx).',
      ).toBe(0)
    })
  }

  it('covers every tool file that imports the context at all', () => {
    // A new desktop tool must be added to SCOPED, or it is unguarded and this
    // whole file quietly stops covering the thing it was written for.
    const importers = fs.readdirSync(HERE)
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
      .filter(f => /getWorkspaceCtx/.test(fs.readFileSync(path.join(HERE, f), 'utf8')))
    expect(importers.sort()).toEqual([...SCOPED].sort())
  })
})

describe('the ambient slot is genuinely unsafe under concurrency', () => {
  beforeEach(() => { /* module state drains via the finally in withWorkspaceContext */ })

  it('an explicit ctx survives an interleaved second chat', async () => {
    // THE REGRESSION. Chat A enters, awaits (a permission prompt, a slow read),
    // and while it is suspended chat B enters and sets the slot to itself. When
    // A resumes, an ambient read yields B. An explicit ctx does not move.
    const A = { conversationId: 'chat-A' }
    const B = { conversationId: 'chat-B' }
    let release
    const gate = new Promise(r => { release = r })

    let ambientSeenByA = null
    let explicitSeenByA = null

    const runA = withWorkspaceContext(A, async () => {
      await gate
      ambientSeenByA = getWorkspaceCtx()?.conversationId
      explicitSeenByA = getWorkspaceCtx(A)?.conversationId
    })

    const runB = withWorkspaceContext(B, async () => {
      expect(concurrentChats()).toBe(2)
      release()
      await Promise.resolve()
    })

    await Promise.all([runB, runA])

    // This is the bug, asserted rather than described: the ambient read did NOT
    // come back as chat A.
    expect(ambientSeenByA).not.toBe('chat-A')
    // ...and the explicit read is correct, which is why every tool threads it.
    expect(explicitSeenByA).toBe('chat-A')
  })

  it('drains the in-flight set even when a tool throws', async () => {
    // A leaked entry would make concurrentChats() climb forever and turn the
    // ambiguity warning into permanent noise, which is how a warning gets
    // ignored and then deleted.
    await expect(
      withWorkspaceContext({ conversationId: 'boom' }, async () => { throw new Error('tool failed') }),
    ).rejects.toThrow('tool failed')
    expect(concurrentChats()).toBe(0)
  })

  it('nests the same chat without double-counting it', async () => {
    await withWorkspaceContext({ conversationId: 'x' }, async () => {
      await withWorkspaceContext({ conversationId: 'x' }, async () => {
        expect(concurrentChats()).toBe(1)
      })
      expect(concurrentChats()).toBe(1)
    })
    expect(concurrentChats()).toBe(0)
  })
})
