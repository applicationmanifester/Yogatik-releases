/**
 * zerodhaClient.js — Zerodha Kite Connect v3 REST API Client.
 * Implements authentication, margins, holdings, positions, and order placement.
 */

import { proxyJson } from '../tools/http'

const KITE_API_BASE = 'https://api.kite.trade'

/**
 * Computes SHA-256 hex string for Kite session token checksum.
 */
export async function sha256Hex(text) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Node.js fallback for tests
  try {
    const nodeCrypto = await import('node:crypto')
    return nodeCrypto.createHash('sha256').update(text).digest('hex')
  } catch {
    throw new Error('No crypto implementation available for sha256 calculation.')
  }
}

/**
 * Returns the standard Zerodha Kite login redirect URL for the user to authenticate.
 */
export function getKiteLoginUrl(apiKey) {
  if (!apiKey) return ''
  return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`
}

/**
 * Exchanges daily request_token for an active access_token.
 */
export async function generateSessionToken({ apiKey, apiSecret, requestToken }) {
  if (!apiKey || !apiSecret || !requestToken) {
    throw new Error('apiKey, apiSecret, and requestToken are required to generate a session.')
  }

  const checksum = await sha256Hex(`${apiKey}${requestToken}${apiSecret}`)
  const url = `${KITE_API_BASE}/session/token`

  const bodyParams = new URLSearchParams()
  bodyParams.append('api_key', apiKey)
  bodyParams.append('request_token', requestToken)
  bodyParams.append('checksum', checksum)

  const res = await proxyJson(url, {
    method: 'POST',
    headers: {
      'X-Kite-Version': '3',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  })

  if (res?.status === 'success' && res?.data) {
    return {
      success: true,
      accessToken: res.data.access_token,
      publicToken: res.data.public_token,
      userId: res.data.user_id,
      userName: res.data.user_name,
      loginTime: res.data.login_time,
      avatarUrl: res.data.avatar_url,
    }
  }

  throw new Error(res?.message || 'Failed to exchange request token with Zerodha.')
}

/**
 * Dispatches an authenticated request to Kite API.
 */
async function kiteRequest(endpoint, { apiKey, accessToken, method = 'GET', body = null } = {}) {
  if (!apiKey || !accessToken) {
    throw new Error('Zerodha API Key and active Access Token are required. Please log in via Trading Settings.')
  }

  const url = `${KITE_API_BASE}${endpoint}`
  const headers = {
    'X-Kite-Version': '3',
    'Authorization': `token ${apiKey}:${accessToken}`,
  }

  let reqBody = undefined
  if (body) {
    if (typeof body === 'object') {
      const params = new URLSearchParams()
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) params.append(k, String(v))
      }
      reqBody = params.toString()
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else {
      reqBody = body
    }
  }

  const res = await proxyJson(url, { method, headers, body: reqBody })
  if (res?.status === 'success') {
    return res.data
  }
  throw new Error(res?.message || `Kite request failed (${res?.error_type || 'Unknown error'})`)
}

/**
 * Fetches available equity & commodity cash margins.
 */
export async function getMargins(apiKeyOrOpts, accessToken) {
  const apiKey = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.apiKey : apiKeyOrOpts
  const token = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.accessToken : accessToken
  const data = await kiteRequest('/user/margins', { apiKey, accessToken: token })
  return {
    status: 'success',
    data,
    equity: {
      availableCash: data?.equity?.available?.live_balance || data?.equity?.net || 0,
      collateral: data?.equity?.available?.collateral || 0,
      utilisedDebits: data?.equity?.utilised?.debits || 0,
    },
    commodity: data?.commodity ? {
      availableCash: data?.commodity?.available?.live_balance || data?.commodity?.net || 0,
    } : null,
  }
}

/**
 * Fetches long-term Demat holdings.
 */
export async function getHoldings(apiKeyOrOpts, accessToken) {
  const apiKey = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.apiKey : apiKeyOrOpts
  const token = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.accessToken : accessToken
  const holdings = await kiteRequest('/portfolio/holdings', { apiKey, accessToken: token })
  const list = Array.isArray(holdings) ? holdings.map(h => ({
    tradingsymbol: h.tradingsymbol,
    exchange: h.exchange,
    quantity: h.quantity,
    averagePrice: h.average_price,
    lastPrice: h.last_price,
    pnl: h.pnl,
    dayChangePercentage: h.day_change_percentage,
  })) : []
  list.data = holdings
  return list
}

/**
 * Fetches intraday and open positions.
 */
export async function getPositions(apiKeyOrOpts, accessToken) {
  const apiKey = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.apiKey : apiKeyOrOpts
  const token = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.accessToken : accessToken
  const data = await kiteRequest('/portfolio/positions', { apiKey, accessToken: token })
  const net = data?.net || []
  const list = net.map(p => ({
    tradingsymbol: p.tradingsymbol,
    exchange: p.exchange,
    product: p.product,
    quantity: p.quantity,
    buyPrice: p.buy_price,
    sellPrice: p.sell_price,
    lastPrice: p.last_price,
    pnl: p.pnl,
    realised: p.realised,
    unrealised: p.unrealised,
  }))
  list.data = data
  return list
}

/**
 * Fetches order book for the current trading day.
 */
export async function getOrders(apiKeyOrOpts, accessToken) {
  const apiKey = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.apiKey : apiKeyOrOpts
  const token = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.accessToken : accessToken
  const orders = await kiteRequest('/orders', { apiKey, accessToken: token })
  const list = Array.isArray(orders) ? orders.map(o => ({
    orderId: o.order_id,
    tradingsymbol: o.tradingsymbol,
    exchange: o.exchange,
    transactionType: o.transaction_type, // BUY | SELL
    orderType: o.order_type, // MARKET | LIMIT | SL
    product: o.product, // CNC | MIS | NRML
    quantity: o.quantity,
    price: o.price,
    status: o.status, // COMPLETE | REJECTED | CANCELLED | OPEN
    statusMessage: o.status_message,
    orderTimestamp: o.order_timestamp,
  })) : []
  list.data = orders
  return list
}

/**
 * Places a live order on Zerodha Kite.
 */
export async function placeOrder(arg1 = {}, arg2 = {}, arg3) {
  let orderParams = arg1
  let creds = arg2
  if (arg1?.apiKey && (arg2?.symbol || arg2?.tradingsymbol)) {
    creds = arg1
    orderParams = arg2
  }

  const apiKey = creds?.apiKey || (typeof arg2 === 'string' ? arg2 : orderParams?.apiKey)
  const accessToken = creds?.accessToken || (typeof arg3 === 'string' ? arg3 : orderParams?.accessToken)

  const {
    exchange = 'NSE',
    tradingsymbol = orderParams.symbol,
    transactionType = orderParams.side, // 'BUY' | 'SELL'
    quantity,
    product = 'CNC', // 'CNC' (delivery) | 'MIS' (intraday)
    orderType = 'LIMIT', // 'LIMIT' | 'MARKET' | 'SL'
    price = 0,
    triggerPrice = 0,
    validity = 'DAY',
  } = orderParams

  const qty = parseInt(quantity, 10)
  if (!tradingsymbol || isNaN(qty) || qty <= 0 || !transactionType) {
    throw new Error('tradingsymbol, quantity, and transactionType (BUY/SELL) are required.')
  }

  const payload = {
    exchange: exchange.toUpperCase(),
    tradingsymbol: tradingsymbol.toUpperCase(),
    transaction_type: transactionType.toUpperCase(),
    quantity: qty,
    product: product.toUpperCase(),
    order_type: orderType.toUpperCase(),
    validity: validity.toUpperCase(),
  }

  if (payload.order_type === 'LIMIT' || payload.order_type === 'SL') {
    payload.price = parseFloat(price)
  }
  if (payload.order_type === 'SL' || payload.order_type === 'SL-M') {
    payload.trigger_price = parseFloat(triggerPrice)
  }

  const res = await kiteRequest('/orders/regular', {
    apiKey,
    accessToken,
    method: 'POST',
    body: payload,
  })

  return {
    status: 'success',
    success: true,
    orderId: res?.order_id,
    data: res,
    message: `Order submitted successfully: ${transactionType} ${quantity} ${tradingsymbol} (${product} ${orderType})`,
  }
}

/**
 * Cancels an open order.
 */
export async function cancelOrder(orderId, apiKeyOrOpts, maybeAccessToken) {
  if (!orderId) throw new Error('orderId is required')
  const apiKey = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.apiKey : apiKeyOrOpts
  const accessToken = typeof apiKeyOrOpts === 'object' ? apiKeyOrOpts?.accessToken : maybeAccessToken
  const res = await kiteRequest(`/orders/regular/${orderId}`, {
    apiKey,
    accessToken,
    method: 'DELETE',
  })
  return { status: 'success', success: true, orderId: res?.order_id || orderId, data: res }
}

/**
 * Fetches live quotes from Zerodha.
 */
export async function getQuotes(arg1 = [], arg2, arg3) {
  const instruments = Array.isArray(arg1) ? arg1 : (Array.isArray(arg2) ? arg2 : [])
  const creds = Array.isArray(arg1) ? arg2 : arg1
  const apiKey = typeof creds === 'object' ? creds?.apiKey : creds
  const accessToken = typeof creds === 'object' ? creds?.accessToken : (typeof arg3 === 'string' ? arg3 : undefined)

  if (!instruments.length) return { status: 'success', data: {} }
  const qStr = instruments.map(i => `i=${encodeURIComponent(i)}`).join('&')
  const res = await kiteRequest(`/quote?${qStr}`, { apiKey, accessToken })
  return {
    status: 'success',
    data: res || {},
    ...(res || {})
  }
}
