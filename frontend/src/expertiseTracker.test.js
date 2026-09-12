import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  computeLevel, hiddenForLevel, getMetrics, resetMetrics,
  trackConversation, trackSlashCommand, trackLiveSession,
  trackToolEnabled, trackFeatureToggle, trackAgentRun,
  subscribeExpertise,
} from './expertiseTracker'

describe('expertiseTracker.computeLevel', () => {
  it('returns novice for empty or minimal metrics', () => {
    expect(computeLevel(null)).toBe('novice')
    expect(computeLevel({})).toBe('novice')
    expect(computeLevel({ conversationsStarted: 5 })).toBe('novice')
  })

  it('returns intermediate when score reaches 10', () => {
    // 5 conversations + 3 slash commands * 2 = 11
    expect(computeLevel({ conversationsStarted: 5, slashCommandsUsed: 3 })).toBe('intermediate')
    // 4 live sessions * 3 = 12
    expect(computeLevel({ liveSessionsCompleted: 4 })).toBe('intermediate')
  })

  it('returns expert when score reaches 100', () => {
    expect(computeLevel({
      conversationsStarted: 50,
      slashCommandsUsed: 15, // 30
      liveSessionsCompleted: 5, // 15
      toolsEnabled: 5,
    })).toBe('expert')
  })
})

describe('expertiseTracker.hiddenForLevel', () => {
  it('hides advanced tools for novice', () => {
    const hidden = hiddenForLevel('novice')
    expect(hidden.has('agents')).toBe(true)
    expect(hidden.has('scheduler')).toBe(true)
    expect(hidden.has('mcp')).toBe(true)
  })

  it('hides fewer tools for intermediate', () => {
    const hidden = hiddenForLevel('intermediate')
    expect(hidden.has('agents')).toBe(false)
    expect(hidden.has('scheduler')).toBe(true)
    expect(hidden.has('mcp')).toBe(true)
  })

  it('hides nothing for expert', () => {
    const hidden = hiddenForLevel('expert')
    expect(hidden.size).toBe(0)
  })
})

describe('expertiseTracker increments and subscriptions', () => {
  beforeEach(async () => {
    await resetMetrics()
  })

  it('increments metrics and notifies listeners', async () => {
    const levels = []
    const unsub = subscribeExpertise(lvl => levels.push(lvl))

    await trackConversation()
    let m = await getMetrics()
    expect(m.conversationsStarted).toBe(1)

    await trackSlashCommand()
    m = await getMetrics()
    expect(m.slashCommandsUsed).toBe(1)

    await trackLiveSession()
    m = await getMetrics()
    expect(m.liveSessionsCompleted).toBe(1)

    await trackToolEnabled()
    m = await getMetrics()
    expect(m.toolsEnabled).toBe(1)

    await trackFeatureToggle()
    m = await getMetrics()
    expect(m.featuresToggled).toBe(1)

    await trackAgentRun()
    m = await getMetrics()
    expect(m.agentsRun).toBe(1)

    unsub()
  })
})
