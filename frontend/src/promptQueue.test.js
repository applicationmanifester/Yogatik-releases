import { describe, it, expect, vi } from 'vitest'

function createPromptQueueSystem() {
  const queueMap = {}
  let isGenerating = false
  const sentMessages = []

  function send(text, clientId = 'c_1') {
    if (!text?.trim()) return

    if (isGenerating) {
      if (!queueMap[clientId]) queueMap[clientId] = []
      queueMap[clientId].push({ text: text.trim(), timestamp: Date.now() })
      return { queued: true }
    }

    isGenerating = true
    sentMessages.push({ text: text.trim(), clientId })
    return { queued: false }
  }

  function finishTurn(clientId = 'c_1') {
    isGenerating = false
    const queue = queueMap[clientId] || []
    if (queue.length > 0) {
      const nextItem = queue.shift()
      queueMap[clientId] = queue
      // Auto dispatch
      send(nextItem.text, clientId)
    }
  }

  return {
    send,
    finishTurn,
    getQueue: (clientId = 'c_1') => queueMap[clientId] || [],
    getSentMessages: () => sentMessages,
    isGenerating: () => isGenerating,
  }
}

describe('Prompt Queueing Engine', () => {
  it('queues messages when model is currently generating and dispatches FIFO on complete', () => {
    const system = createPromptQueueSystem()

    // First message starts execution
    const r1 = system.send('First prompt')
    expect(r1.queued).toBe(false)
    expect(system.isGenerating()).toBe(true)
    expect(system.getSentMessages()).toHaveLength(1)

    // Second message while generating gets queued
    const r2 = system.send('Second prompt (while busy)')
    expect(r2.queued).toBe(true)
    expect(system.getQueue()).toHaveLength(1)
    expect(system.getQueue()[0].text).toBe('Second prompt (while busy)')

    // Third message also gets queued
    const r3 = system.send('Third prompt')
    expect(r3.queued).toBe(true)
    expect(system.getQueue()).toHaveLength(2)

    // Finish first turn -> automatically triggers second prompt
    system.finishTurn()
    expect(system.isGenerating()).toBe(true)
    expect(system.getSentMessages()).toHaveLength(2)
    expect(system.getSentMessages()[1].text).toBe('Second prompt (while busy)')
    expect(system.getQueue()).toHaveLength(1)
    expect(system.getQueue()[0].text).toBe('Third prompt')

    // Finish second turn -> automatically triggers third prompt
    system.finishTurn()
    expect(system.isGenerating()).toBe(true)
    expect(system.getSentMessages()).toHaveLength(3)
    expect(system.getSentMessages()[2].text).toBe('Third prompt')
    expect(system.getQueue()).toHaveLength(0)

    // Finish third turn -> all queues empty and model idle
    system.finishTurn()
    expect(system.isGenerating()).toBe(false)
    expect(system.getQueue()).toHaveLength(0)
  })
})
