import { describe, it, expect } from 'vitest'
import { conversationToMarkdown, conversationToHtml } from './chatExport'
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

describe('built-in styles', () => {
  it('ship a default plus several profiles, each with an id and name', () => {
    expect(BUILT_IN_STYLES.length).toBeGreaterThanOrEqual(5)
    expect(BUILT_IN_STYLES[0].id).toBe('default')
    for (const s of BUILT_IN_STYLES) { expect(s.id).toBeTruthy(); expect(s.name).toBeTruthy() }
  })
})
