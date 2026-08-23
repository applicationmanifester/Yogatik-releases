import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  shouldNotifyTurn,
  notificationBody,
  notificationTitle,
  cleanReply,
  sendDesktopTurnNotification,
} from './desktopNotify'

const base = { isDesktop: true, hidden: true, focused: false, aborted: false, error: null, hasText: true }

beforeEach(() => {
  delete window.__YOGATIK_NOTIFY__
})

afterEach(() => {
  delete window.__YOGATIK_NOTIFY__
})

describe('shouldNotifyTurn', () => {
  it('notifies when the window is hidden', () => {
    expect(shouldNotifyTurn(base)).toBe(true)
  })

  it('notifies when visible but not focused (window behind another)', () => {
    expect(shouldNotifyTurn({ ...base, hidden: false, focused: false })).toBe(true)
  })

  it('stays silent when the user is looking right at it', () => {
    // Fires every turn, so a false positive is met constantly.
    expect(shouldNotifyTurn({ ...base, hidden: false, focused: true })).toBe(false)
  })

  it('stays silent on the web build', () => {
    expect(shouldNotifyTurn({ ...base, isDesktop: false })).toBe(false)
  })

  it('stays silent when the user stopped the turn themselves', () => {
    expect(shouldNotifyTurn({ ...base, aborted: true })).toBe(false)
  })

  it('stays silent on an error, which is already on screen', () => {
    expect(shouldNotifyTurn({ ...base, error: 'boom' })).toBe(false)
  })

  it('stays silent when the reply is empty', () => {
    expect(shouldNotifyTurn({ ...base, hasText: false })).toBe(false)
  })
})

describe('sendDesktopTurnNotification', () => {
  it('fires notification when window is hidden in desktop environment', async () => {
    const notifyMock = vi.fn().mockResolvedValue({ id: 'n1' })
    window.__YOGATIK_NOTIFY__ = notifyMock

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })

    const res = await sendDesktopTurnNotification({
      conversationTitle: 'Quarterly Audit',
      text: 'Analysis is complete.',
      aborted: false,
      error: null,
      hasText: true,
    })

    expect(res).toEqual({ id: 'n1' })
    expect(notifyMock).toHaveBeenCalledWith({
      title: 'Yogatik — Quarterly Audit',
      body: 'Analysis is complete.',
      hasReply: true,
    })
  })
})

describe('notificationBody', () => {
  it('strips reasoning blocks, which are not the answer', () => {
    expect(notificationBody('<think>weighing options</think>The answer is 42.')).toBe('The answer is 42.')
  })

  it('summarises code and images rather than dumping them', () => {
    expect(notificationBody('Here:\n```js\nconst a=1\n```')).toBe('Here: [code]')
    expect(notificationBody('See ![chart](data:image/png;base64,AAAA)')).toBe('See [image]')
  })

  it('keeps link text and drops the URL', () => {
    expect(notificationBody('Read [the docs](https://example.com/x)')).toBe('Read the docs')
  })

  it('flattens markdown emphasis and headings', () => {
    expect(notificationBody('## Title\n**bold** and `code`')).toBe('Title bold and code')
  })

  it('truncates on a word boundary, not mid-word', () => {
    const out = notificationBody('supercalifragilistic '.repeat(40))
    expect(out.length).toBeLessThanOrEqual(221)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/superc…$/)   // would mean it cut mid-token
  })

  it('leaves a short reply untouched', () => {
    expect(notificationBody('Done.')).toBe('Done.')
  })
})

describe('notificationTitle', () => {
  it('names the conversation so several chats stay distinguishable', () => {
    expect(notificationTitle('Quarterly report')).toBe('Yogatik — Quarterly report')
  })

  it('does not say "New Chat", which identifies nothing', () => {
    expect(notificationTitle('New Chat')).toBe('Yogatik')
    expect(notificationTitle('')).toBe('Yogatik')
    expect(notificationTitle(undefined)).toBe('Yogatik')
  })
})

describe('cleanReply', () => {
  it('trims a real reply', () => {
    expect(cleanReply('  and then?  ')).toBe('and then?')
  })

  it('rejects blanks so a stray Enter cannot fire an empty turn', () => {
    expect(cleanReply('   ')).toBeNull()
    expect(cleanReply('')).toBeNull()
    expect(cleanReply(undefined)).toBeNull()
  })
})
