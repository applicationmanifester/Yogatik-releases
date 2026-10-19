import { describe, it, expect } from 'vitest'
import {
  conversationToMarkdown, conversationToHtml,
  conversationToJson, conversationFromJson,
} from './chatExport'
import { BUILT_IN_STYLES } from './styles'

const conv = {
  title: 'My Chat',
  messages: [
    { role: 'system', content: 'ignore me' },
    { role: 'user', content: 'Hello **there**' },
    { role: 'assistant', content: 'Hi! Here is code:\n```\nx=1\n```' },
    { role: 'user', content: [{ type: 'text', text: 'multimodal text' }, { type: 'image_url' }] },
  ],
}

describe('conversationToMarkdown', () => {
  it('includes the title and both speakers, drops system', () => {
    const md = conversationToMarkdown(conv)
    expect(md).toContain('# My Chat')
    expect(md).toContain('**You:**')
    expect(md).toContain('**Yogatik:**')
    expect(md).not.toContain('ignore me')
  })
  it('extracts text from multimodal content', () => {
    expect(conversationToMarkdown(conv)).toContain('multimodal text')
  })
})

describe('conversationToHtml', () => {
  it('is a self-contained document with escaped content and code blocks', () => {
    const html = conversationToHtml(conv)
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<title>My Chat</title>')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('<strong>there</strong>')
    expect(html).not.toContain('ignore me')
  })
})

describe('conversation JSON backup (one-click export/import)', () => {
  it('round-trips losslessly through fromJson, dropping system like the other formats', () => {
    const json = conversationToJson(conv)
    expect(json.format).toBe('yogatik-conversation')
    expect(json.title).toBe('My Chat')
    const back = conversationFromJson(JSON.parse(JSON.stringify(json)))
    expect(back.title).toBe('My Chat')
    expect(back.messages).toHaveLength(3)
    expect(back.messages.every(m => m.role !== 'system')).toBe(true)
    expect(back.messages.map(m => m.content).join('\n')).toContain('multimodal text')
  })
  it('accepts a raw message array and normalises roles', () => {
    const back = conversationFromJson([{ role: 'user', content: 'hi' }, { role: 'weird', content: 'yo' }])
    expect(back.messages[1].role).toBe('assistant')
  })
  it('rejects non-conversation files with a human message, not a TypeError', () => {
    expect(() => conversationFromJson({ nope: true })).toThrow(/no messages/i)
    expect(() => conversationFromJson({ messages: [] })).toThrow(/no messages/i)
  })
})

describe('built-in styles', () => {
  it('ship a default plus several profiles, each with an id and name', () => {
    expect(BUILT_IN_STYLES.length).toBeGreaterThanOrEqual(5)
    expect(BUILT_IN_STYLES[0].id).toBe('default')
    for (const s of BUILT_IN_STYLES) { expect(s.id).toBeTruthy(); expect(s.name).toBeTruthy() }
  })
})
