// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  startSession, endSession, markUtteranceEnd, markFirstWord, markTurnEnd,
  markTool, markCameraOn, markBargeIn, report, percentile, currentSession,
  sessions, _resetLiveMetrics, END_REASON,
} from './metrics'

const HERE = path.dirname(fileURLToPath(import.meta.url))

beforeEach(() => _resetLiveMetrics())

describe('live metrics', () => {
  it('records a whole session', () => {
    startSession({ engine: 'cascade', provider: 'ollama' }, 0)
    markCameraOn()
    for (const [end, word] of [[1000, 1400], [5000, 5600], [9000, 9500]]) {
      markUtteranceEnd(end); markFirstWord(word); markTool(1); markTurnEnd()
    }
    const s = endSession(END_REASON.USER, 90_000)
    expect(s.turns).toBe(3)
    expect(s.firstWordMs).toEqual([400, 600, 500])
    expect(s.cameraOn).toBe(true)
    expect(s.endReason).toBe('user')
  })

  it('counts a turn that starts at timestamp 0', () => {
    // `_turnStart` was used as the has-a-turn flag, and 0 is falsy — so a turn
    // beginning at t=0 recorded nothing at all. Date.now() is never 0 in
    // production, which is exactly why this class of bug survives review and
    // only a test with a fake clock finds it.
    startSession({}, 0)
    markUtteranceEnd(0)
    markFirstWord(700)
    expect(currentSession().firstWordMs).toEqual([700])
  })

  it('counts only the FIRST word of a turn', () => {
    startSession({}, 0)
    markUtteranceEnd(0)
    markFirstWord(100)
    markFirstWord(900)
    expect(currentSession().firstWordMs).toEqual([100])
  })

  it('separates a real barge-in from a false one', () => {
    // An interrupt followed by nothing is noise or the assistant's own echo.
    // That is the failure people never report — they just stop using it.
    startSession({}, 0)
    markBargeIn(true)
    markBargeIn(false)
    endSession(END_REASON.USER, 1000)
    expect(report().bargeInFalsePositiveRate).toBe(0.5)
  })

  it('reports the six numbers that decide the roadmap', () => {
    startSession({}, 0); markCameraOn()
    markUtteranceEnd(0); markFirstWord(500); markTool(1); markTurnEnd()
    endSession(END_REASON.USER, 90_000)

    startSession({}, 0)
    markUtteranceEnd(0); markFirstWord(800); markTurnEnd()
    endSession(END_REASON.ERROR, 20_000)

    const r = report()
    expect(r.sessions).toBe(2)
    expect(r.firstWordP50).toBe(500)
    expect(r.firstWordP95).toBe(800)
    expect(r.over60sRate).toBe(0.5)   // under a minute means it did not work
    expect(r.cameraOnRate).toBe(0.5)  // the strategic metric
    expect(r.toolTurnRate).toBe(0.5)
    expect(r.endReasons).toEqual({ user: 1, error: 1 })
  })

  it('never throws when nothing has happened', () => {
    // These are called from event handlers that can fire before or after a
    // session; a metric that crashes the call it measures is worse than none.
    expect(() => { markFirstWord(); markTurnEnd(); markTool(); markCameraOn(); markBargeIn() }).not.toThrow()
    expect(endSession()).toBeNull()
    expect(report().sessions).toBe(0)
    expect(percentile([], 50)).toBeNull()
  })

  it('keeps the ring bounded', () => {
    for (let i = 0; i < 60; i++) { startSession({}, 0); endSession(END_REASON.USER, 1000) }
    expect(sessions().length).toBeLessThanOrEqual(50)
  })
})

describe('wiring', () => {
  const cascade = fs.readFileSync(path.join(HERE, 'cascade.js'), 'utf8')
  const view = fs.readFileSync(path.join(HERE, '..', 'components', 'LiveView.jsx'), 'utf8')

  it('starts the turn clock when the utterance is committed, not when the request is sent', () => {
    // The user experiences the whole gap, including the on-device vision work
    // that happens before the model is even called.
    expect(cascade).toMatch(/metrics\.markUtteranceEnd\(\)/)
    expect(cascade.indexOf('metrics.markUtteranceEnd()')).toBeLessThan(cascade.indexOf('await runAgent') > -1
      ? cascade.indexOf('await runAgent') : cascade.length)
  })

  it('counts a spoken filler as the first word', () => {
    // Not counting it would flatter the metric by exactly the amount the
    // filler was introduced to hide.
    expect(cascade).toMatch(/speak\(line\)[\s\S]{0,220}metrics\.markFirstWord\(\)/)
  })

  it('records every way a session can end', () => {
    for (const reason of ['USER', 'ERROR', 'UNMOUNT']) {
      expect(view, `${reason} ending`).toContain(`END_REASON.${reason}`)
    }
  })

  it('records camera use, which is the strategic metric', () => {
    expect(view).toMatch(/liveMetrics\.markCameraOn\(\)/)
  })
})
