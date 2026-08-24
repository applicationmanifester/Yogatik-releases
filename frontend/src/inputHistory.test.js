import { describe, it, expect } from 'vitest'

function createPromptHistoryNavigator(initialHistory = []) {
  let history = [...initialHistory]
  let historyIndex = -1
  let draftInput = ''
  let currentInput = ''

  return {
    get input() { return currentInput },
    get historyIndex() { return historyIndex },
    get draftInput() { return draftInput },
    setInput(val) { currentInput = val },
    recordSentPrompt(text) {
      const msg = (text || '').trim()
      if (msg) {
        history = [...history.filter(p => p !== msg), msg]
      }
      historyIndex = -1
      draftInput = ''
      currentInput = ''
    },
    handleArrowUp(isAtStart = true) {
      const isEmpty = !currentInput
      if (isEmpty || isAtStart) {
        if (history.length > 0) {
          if (historyIndex === -1) {
            draftInput = currentInput
            historyIndex = history.length - 1
          } else if (historyIndex > 0) {
            historyIndex -= 1
          }
          currentInput = history[historyIndex]
          return true
        }
      }
      return false
    },
    handleArrowDown() {
      if (historyIndex !== -1) {
        if (historyIndex < history.length - 1) {
          historyIndex += 1
          currentInput = history[historyIndex]
          return true
        } else {
          historyIndex = -1
          currentInput = draftInput || ''
          return true
        }
      }
      return false
    },
  }
}

describe('Chat Input Up/Down Arrow History Recall', () => {
  it('recalls previous messages on ArrowUp and navigates through history', () => {
    const nav = createPromptHistoryNavigator()
    nav.recordSentPrompt('Hello world')
    nav.recordSentPrompt('Write a python script')
    nav.recordSentPrompt('Can you optimize it?')

    // Initial state
    expect(nav.input).toBe('')

    // Press ArrowUp -> latest prompt
    expect(nav.handleArrowUp(true)).toBe(true)
    expect(nav.input).toBe('Can you optimize it?')

    // Press ArrowUp again -> 2nd previous prompt
    expect(nav.handleArrowUp(true)).toBe(true)
    expect(nav.input).toBe('Write a python script')

    // Press ArrowUp again -> oldest prompt
    expect(nav.handleArrowUp(true)).toBe(true)
    expect(nav.input).toBe('Hello world')

    // Press ArrowUp at the top -> stays at oldest
    expect(nav.handleArrowUp(true)).toBe(true)
    expect(nav.input).toBe('Hello world')

    // Press ArrowDown -> moves forward
    expect(nav.handleArrowDown()).toBe(true)
    expect(nav.input).toBe('Write a python script')

    // Press ArrowDown -> latest sent prompt
    expect(nav.handleArrowDown()).toBe(true)
    expect(nav.input).toBe('Can you optimize it?')

    // Press ArrowDown -> restores empty draft
    expect(nav.handleArrowDown()).toBe(true)
    expect(nav.input).toBe('')
    expect(nav.historyIndex).toBe(-1)
  })

  it('preserves unsubmitted draft when recalling history and going back down', () => {
    const nav = createPromptHistoryNavigator(['First prompt', 'Second prompt'])
    nav.setInput('My unsubmitted work in progress...')

    // Press ArrowUp from start
    expect(nav.handleArrowUp(true)).toBe(true)
    expect(nav.input).toBe('Second prompt')
    expect(nav.draftInput).toBe('My unsubmitted work in progress...')

    // Press ArrowDown -> restores unsubmitted draft
    expect(nav.handleArrowDown()).toBe(true)
    expect(nav.input).toBe('My unsubmitted work in progress...')
    expect(nav.historyIndex).toBe(-1)
  })
})
