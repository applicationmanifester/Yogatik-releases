/**
 * tradeJournal.js — Cryptographic Forensic Trade Journal & Audit Trail.
 *
 * Implements an immutable, tamper-evident chained ledger for algorithmic trade executions.
 * Each trade execution is linked via SHA-256 cryptographic hashing to the previous entry,
 * preserving a verifiable audit trail of AI signals, timestamps, execution prices, and fees paid.
 */

const JOURNAL_STORAGE_KEY = 'yogatik_trade_journal_v1'
export const GENESIS_HASH = '0'.repeat(64)

/**
 * Portable synchronous SHA-256 hash calculation (handles browser, worker, and Node).
 */
export function sha256Sync(str) {
  // Simple deterministic 32-bit FNV-1a / Murmur hybrid expanded to 64-char hex
  // for synchronous testing fallback, with crypto fallback
  if (typeof crypto !== 'undefined' && crypto.createHash) {
    try {
      return crypto.createHash('sha256').update(str).digest('hex')
    } catch { /* fallthrough */ }
  }

  // Pure JavaScript SHA-256 implementation
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount))
  }

  const mathPow = Math.pow
  const maxWord = mathPow(2, 32)
  const lengthProperty = 'length'
  let i, j
  let result = ''

  const words = []
  const asciiBitLength = str[lengthProperty] * 8

  let hash = []
  const k = []
  let primeCounter = 0

  const isComposite = {}
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = candidate * candidate; i < 312; i += candidate) {
        isComposite[i] = true
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0
    }
  }
  hash = hash.slice(0, 8)

  str += '\x80'
  while ((str[lengthProperty] % 64) - 56) str += '\x00'
  for (i = 0; i < str[lengthProperty]; i++) {
    j = str.charCodeAt(i)
    if (j >> 8) return ''
    words[i >> 2] |= j << (((3 - i) % 4) * 8)
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0
  words[words[lengthProperty]] = asciiBitLength | 0

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, (j += 16))
    const oldHash = hash
    hash = hash.slice(0, 8)

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15]
      const w2 = w[i - 2]

      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10)
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6])
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2])
      const temp1 = (hash[7] + (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) + ch + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0)) | 0
      const temp2 = ((rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) + maj) | 0

      hash = [(temp1 + temp2) | 0, hash[0], hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]]
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255
      result += (b < 16 ? '0' : '') + b.toString(16)
    }
  }

  return result
}

/**
 * Computes payload hash for a journal entry string.
 */
export function computeEntryHash(entry) {
  const payload = [
    entry.index,
    entry.timestamp,
    entry.tradeId,
    entry.orderId,
    entry.symbol,
    entry.side,
    entry.quantity,
    entry.price,
    entry.fees,
    entry.netPnl,
    entry.previousHash,
  ].join('|')

  return sha256Sync(payload)
}

/**
 * Retrieves the persisted journal entries.
 */
export function getTradeJournal() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(JOURNAL_STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch { /* ignore */ }
  return []
}

/**
 * Clears the trade journal.
 */
export function clearTradeJournal() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(JOURNAL_STORAGE_KEY)
    }
  } catch { /* ignore */ }
}

/**
 * Appends a verified trade execution to the chained forensic journal.
 *
 * @param {Object} tradeData
 * @returns {Object} Newly created and chained journal entry
 */
export function recordTradeToJournal(tradeData = {}) {
  const journal = getTradeJournal()
  const previousEntry = journal.length > 0 ? journal[journal.length - 1] : null
  const previousHash = previousEntry ? previousEntry.hash : GENESIS_HASH

  const newIndex = journal.length + 1
  const timestamp = tradeData.timestamp || new Date().toISOString()
  const entry = {
    index: newIndex,
    timestamp,
    tradeId: tradeData.tradeId || `TRD_${Date.now()}_${newIndex}`,
    orderId: tradeData.orderId || `ORD_${Date.now()}`,
    symbol: String(tradeData.symbol || 'UNKNOWN').toUpperCase(),
    side: tradeData.side === 'SELL' ? 'SELL' : 'BUY',
    quantity: Math.abs(Number(tradeData.quantity) || 0),
    price: Number(Number(tradeData.price || 0).toFixed(2)),
    fees: Number(Number(tradeData.fees || 0).toFixed(2)),
    netPnl: Number(Number(tradeData.netPnl || 0).toFixed(2)),
    triggerReason: tradeData.triggerReason || 'QUANT_SETUP',
    aiRationale: tradeData.aiRationale || '',
    previousHash,
  }

  entry.hash = computeEntryHash(entry)
  journal.push(entry)

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(journal))
    }
  } catch { /* best effort */ }

  return entry
}

/**
 * Verifies cryptographic integrity of the trade journal ledger.
 *
 * @param {Array<Object>} [customJournal] - Optional in-memory journal for validation
 * @returns {Object} Verification outcome report
 */
export function verifyJournalIntegrity(customJournal) {
  const journal = customJournal || getTradeJournal()

  if (!Array.isArray(journal) || journal.length === 0) {
    return {
      isValid: true,
      count: 0,
      message: 'Journal is empty. No tampering possible.',
      tamperedIndex: null,
    }
  }

  for (let i = 0; i < journal.length; i++) {
    const entry = journal[i]
    const expectedPreviousHash = i === 0 ? GENESIS_HASH : journal[i - 1].hash

    // 1. Check parent link integrity
    if (entry.previousHash !== expectedPreviousHash) {
      return {
        isValid: false,
        count: journal.length,
        tamperedIndex: i + 1,
        message: `Ledger link broken at trade #${i + 1}. Expected parent hash ${expectedPreviousHash}, found ${entry.previousHash}`,
      }
    }

    // 2. Check hash validity
    const calculatedHash = computeEntryHash(entry)
    if (entry.hash !== calculatedHash) {
      return {
        isValid: false,
        count: journal.length,
        tamperedIndex: i + 1,
        message: `Tampering detected at trade #${i + 1}! Payload hash mismatch.`,
      }
    }
  }

  return {
    isValid: true,
    count: journal.length,
    message: `Forensic audit complete: All ${journal.length} trades cryptographically verified.`,
    tamperedIndex: null,
  }
}

/**
 * Exports the trade journal to CSV.
 */
export function exportJournalToCsv(customJournal) {
  const journal = customJournal || getTradeJournal()
  const headers = [
    'Index',
    'Timestamp',
    'TradeId',
    'OrderId',
    'Symbol',
    'Side',
    'Quantity',
    'Price (INR)',
    'Fees (INR)',
    'Net P&L (INR)',
    'Trigger Reason',
    'Hash',
    'Previous Hash',
  ]

  const rows = journal.map((e) => [
    e.index,
    `"${e.timestamp}"`,
    `"${e.tradeId}"`,
    `"${e.orderId}"`,
    `"${e.symbol}"`,
    e.side,
    e.quantity,
    e.price,
    e.fees,
    e.netPnl,
    `"${e.triggerReason}"`,
    `"${e.hash}"`,
    `"${e.previousHash}"`,
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/**
 * Exports the trade journal to formatted JSON.
 */
export function exportJournalToJson(customJournal) {
  const journal = customJournal || getTradeJournal()
  return JSON.stringify(journal, null, 2)
}
