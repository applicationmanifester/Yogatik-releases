import { describe, it, expect, beforeEach } from 'vitest'
import {
  sha256Sync,
  recordTradeToJournal,
  getTradeJournal,
  clearTradeJournal,
  verifyJournalIntegrity,
  exportJournalToCsv,
  exportJournalToJson,
  GENESIS_HASH,
} from './tradeJournal'

describe('tradeJournal — Chained Cryptographic Ledger', () => {
  beforeEach(() => {
    clearTradeJournal()
  })

  it('generates consistent 64-character SHA-256 hashes', () => {
    const hash1 = sha256Sync('hello world')
    const hash2 = sha256Sync('hello world')
    const hash3 = sha256Sync('different text')

    expect(hash1).toHaveLength(64)
    expect(hash1).toBe(hash2)
    expect(hash1).not.toBe(hash3)
  })

  it('chains trade records with parent hash links', () => {
    const trade1 = recordTradeToJournal({
      symbol: 'RELIANCE',
      side: 'BUY',
      quantity: 10,
      price: 2950,
      fees: 32.5,
      netPnl: 0,
    })

    expect(trade1.index).toBe(1)
    expect(trade1.previousHash).toBe(GENESIS_HASH)
    expect(trade1.hash).toHaveLength(64)

    const trade2 = recordTradeToJournal({
      symbol: 'RELIANCE',
      side: 'SELL',
      quantity: 10,
      price: 3020,
      fees: 45.2,
      netPnl: 622.3,
    })

    expect(trade2.index).toBe(2)
    expect(trade2.previousHash).toBe(trade1.hash)

    const journal = getTradeJournal()
    expect(journal.length).toBe(2)

    const audit = verifyJournalIntegrity()
    expect(audit.isValid).toBe(true)
    expect(audit.count).toBe(2)
  })

  it('detects tampering if trade data is modified post-hoc', () => {
    recordTradeToJournal({ symbol: 'INFY', side: 'BUY', quantity: 20, price: 1850 })
    recordTradeToJournal({ symbol: 'INFY', side: 'SELL', quantity: 20, price: 1900 })

    const rawJournal = getTradeJournal()
    // Tamper with first trade price
    rawJournal[0].price = 1000

    const audit = verifyJournalIntegrity(rawJournal)
    expect(audit.isValid).toBe(false)
    expect(audit.tamperedIndex).toBe(1)
    expect(audit.message).toContain('Tampering detected')
  })

  it('exports journal into valid CSV and JSON structures', () => {
    recordTradeToJournal({ symbol: 'TCS', side: 'BUY', quantity: 5, price: 3800 })
    const csv = exportJournalToCsv()
    const json = exportJournalToJson()

    expect(csv).toContain('Index,Timestamp,TradeId,OrderId,Symbol')
    expect(csv).toContain('TCS')
    expect(JSON.parse(json).length).toBe(1)
  })
})
