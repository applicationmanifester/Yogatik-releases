import { describe, it, expect, vi } from 'vitest'
import {
  sha256Hex,
  getKiteLoginUrl,
  generateSessionToken,
  getMargins,
  getHoldings,
  getPositions,
  placeOrder,
  cancelOrder,
  getQuotes,
} from './zerodhaClient'
import * as http from '../tools/http'

describe('zerodhaClient', () => {
  it('computes correct sha256 checksum', async () => {
    // Known SHA-256 for 'hello' is 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    const hash = await sha256Hex('hello')
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('builds standard Kite Connect login URL', () => {
    const url = getKiteLoginUrl('my_test_api_key')
    expect(url).toBe('https://kite.zerodha.com/connect/login?v=3&api_key=my_test_api_key')
    expect(getKiteLoginUrl('')).toBe('')
  })

  it('extracts request_token from various URL formats or raw strings', async () => {
    const { extractRequestToken } = await import('./zerodhaClient')
    expect(extractRequestToken('xyz12345')).toBe('xyz12345')
    expect(extractRequestToken('https://yogatik.web.app/?action=login&status=success&request_token=abc9988')).toBe('abc9988')
    expect(extractRequestToken('?action=login&request_token=token456')).toBe('token456')
    expect(extractRequestToken('request_token=my_secret_token_123')).toBe('my_secret_token_123')
    expect(extractRequestToken('  trimmedToken  ')).toBe('trimmedToken')
  })

  it('exchanges request_token for access_token with Kite API checksum', async () => {
    const mockProxyJson = vi.spyOn(http, 'proxyJson').mockResolvedValueOnce({
      status: 'success',
      data: {
        access_token: 'valid_access_token_123',
        public_token: 'pub_token_456',
        user_id: 'AB1234',
        user_name: 'Test Trader',
        login_time: '2026-09-17 09:15:00',
      },
    })

    const res = await generateSessionToken({
      apiKey: 'api_key_1',
      apiSecret: 'secret_1',
      requestToken: 'req_tok_1',
    })

    expect(res.success).toBe(true)
    expect(res.accessToken).toBe('valid_access_token_123')
    expect(res.userId).toBe('AB1234')
    expect(mockProxyJson).toHaveBeenCalledTimes(1)
    mockProxyJson.mockRestore()
  })

  it('validates order payload before sending to Kite', async () => {
    await expect(
      placeOrder(
        { apiKey: 'key', accessToken: 'token' },
        { symbol: '', side: 'BUY', quantity: 1 }
      )
    ).rejects.toThrow()

    await expect(
      placeOrder(
        { apiKey: 'key', accessToken: 'token' },
        { symbol: 'RELIANCE', side: 'BUY', quantity: 0 }
      )
    ).rejects.toThrow()
  })

  it('sends authenticated order placement when payload is valid', async () => {
    const mockProxyJson = vi.spyOn(http, 'proxyJson').mockResolvedValueOnce({
      status: 'success',
      data: {
        order_id: '260917000000001',
      },
    })

    const res = await placeOrder(
      { apiKey: 'key1', accessToken: 'tok1' },
      {
        exchange: 'NSE',
        symbol: 'INFY',
        side: 'BUY',
        quantity: 10,
        orderType: 'LIMIT',
        product: 'CNC',
        price: 1850.5,
      }
    )

    expect(res.status).toBe('success')
    expect(res.data.order_id).toBe('260917000000001')
    mockProxyJson.mockRestore()
  })

  it('fetches margins, holdings, positions, and quotes', async () => {
    const mockProxyJson = vi.spyOn(http, 'proxyJson')
      .mockResolvedValueOnce({ status: 'success', data: { equity: { net: 50000 } } }) // margins
      .mockResolvedValueOnce({ status: 'success', data: [{ tradingsymbol: 'TCS', quantity: 5 }] }) // holdings
      .mockResolvedValueOnce({ status: 'success', data: { net: [] } }) // positions
      .mockResolvedValueOnce({ status: 'success', data: { 'NSE:INFY': { last_price: 1850 } } }) // quotes

    const margins = await getMargins({ apiKey: 'k', accessToken: 't' })
    expect(margins.data.equity.net).toBe(50000)

    const holdings = await getHoldings({ apiKey: 'k', accessToken: 't' })
    expect(holdings.data[0].tradingsymbol).toBe('TCS')

    const positions = await getPositions({ apiKey: 'k', accessToken: 't' })
    expect(positions.data.net).toBeDefined()

    const quotes = await getQuotes({ apiKey: 'k', accessToken: 't' }, ['NSE:INFY'])
    expect(quotes.data['NSE:INFY'].last_price).toBe(1850)

    mockProxyJson.mockRestore()
  })
})
