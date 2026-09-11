import { describe, it, expect } from 'vitest'
import {
  splitMessage,
  formatTelegramMessage,
  parseWebhookPayload,
  BotEngine,
} from '../bin/bot-gateway.mjs'

describe('bot-gateway message formatting & chunking', () => {
  it('returns short messages in a single chunk', () => {
    const text = 'Hello from Yogatik bot!'
    const chunks = splitMessage(text, 100)
    expect(chunks).toEqual([text])
  })

  it('splits long text respecting paragraph boundaries', () => {
    const p1 = 'First paragraph content that is relatively long.'
    const p2 = 'Second paragraph content that continues the explanation.'
    const combined = `${p1}\n\n${p2}`
    const chunks = splitMessage(combined, 65)
    expect(chunks.length).toBe(2)
    expect(chunks[0]).toBe(p1)
    expect(chunks[1]).toBe(p2)
  })

  it('handles empty or null text safely', () => {
    expect(splitMessage('', 100)).toEqual([''])
    expect(splitMessage(null, 100)).toEqual([''])
  })

  it('formats telegram messages trimming whitespace', () => {
    expect(formatTelegramMessage('   Hello World!  \n')).toBe('Hello World!')
    expect(formatTelegramMessage(null)).toBe('')
  })
})

describe('bot-gateway webhook parsing', () => {
  it('correctly parses Telegram Update payloads', () => {
    const payload = {
      update_id: 12345,
      message: {
        message_id: 1,
        chat: { id: 987654321 },
        from: { username: 'telegram_user', first_name: 'John' },
        text: 'How do I build a bot?',
      },
    }
    const parsed = parseWebhookPayload(payload)
    expect(parsed).toEqual({
      platform: 'telegram',
      chatId: 987654321,
      sender: 'telegram_user',
      text: 'How do I build a bot?',
      raw: payload,
    })
  })

  it('correctly parses Discord interaction payloads', () => {
    const payload = {
      channel_id: 'disc_999',
      author: { username: 'discord_dev' },
      content: '!ask what is the status of the app',
    }
    const parsed = parseWebhookPayload(payload)
    expect(parsed).toEqual({
      platform: 'discord',
      chatId: 'disc_999',
      sender: 'discord_dev',
      text: '!ask what is the status of the app',
      raw: payload,
    })
  })

  it('correctly parses generic REST JSON payloads', () => {
    const payload = {
      message: 'Run automated tests',
      chatId: 'ci_runner_01',
      sender: 'github_actions',
    }
    const parsed = parseWebhookPayload(payload)
    expect(parsed).toEqual({
      platform: 'rest',
      chatId: 'ci_runner_01',
      sender: 'github_actions',
      text: 'Run automated tests',
      raw: payload,
    })
  })

  it('returns null for unrecognized bodies', () => {
    expect(parseWebhookPayload({})).toBeNull()
    expect(parseWebhookPayload({ foo: 'bar' })).toBeNull()
  })
})

describe('BotEngine configuration & fallback', () => {
  it('initializes with default options', () => {
    const engine = new BotEngine()
    expect(engine.provider).toBe('auto')
    expect(engine.agent).toBe('agent_general')
  })

  it('detects specified provider directly without querying network', async () => {
    const engine = new BotEngine({ provider: 'groq', model: 'llama-3.3-70b-versatile' })
    const detected = await engine.detectBestProvider()
    expect(detected.provider).toBe('groq')
    expect(detected.model).toBe('llama-3.3-70b-versatile')
  })

  it('maintains per-chat conversation history', async () => {
    const engine = new BotEngine({ provider: 'groq', groqApiKey: 'dummy' })
    // Stub queryOpenAiCompatible
    engine.queryOpenAiCompatible = async () => 'Mock reply from assistant'

    const reply1 = await engine.ask('Hello', 'chat_1')
    expect(reply1).toBe('Mock reply from assistant')

    const hist1 = engine.histories.get('chat_1')
    expect(hist1.length).toBe(2)
    expect(hist1[0].content).toBe('Hello')
    expect(hist1[1].content).toBe('Mock reply from assistant')

    // Separate chat should have its own history
    const reply2 = await engine.ask('Different chat query', 'chat_2')
    expect(reply2).toBe('Mock reply from assistant')
    const hist2 = engine.histories.get('chat_2')
    expect(hist2.length).toBe(2)
    expect(hist2[0].content).toBe('Different chat query')
  })
})
