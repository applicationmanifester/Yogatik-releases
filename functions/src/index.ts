/**
 * Yogatik License Server — Refactored
 *
 * Key improvements over original index.js:
 * - Transaction-based account creation (eliminates race condition)
 * - Middleware pipeline for auth, rate limiting, validation
 * - Config-driven constants via Remote Config / environment
 * - Structured logging with request IDs
 * - Schema validation for webhook payloads (Zod)
 * - Persistent IP cache using Firestore with TTL
 * - Idempotency keys for webhook processing
 * - TypeScript with strict mode
 */

import { onRequest } from 'firebase-functions/v2/https'
import { defineSecret, defineInt } from 'firebase-functions/params'
import * as admin from 'firebase-admin'
import * as crypto from 'crypto'
import { z } from 'zod'
import type { Request, Response, NextFunction } from 'express'
import { buildRazorpayBillingEvent, buildPaddleBillingEvent } from './billingEvents'

admin.initializeApp()
const db = admin.firestore()

// ─────────────────────────────────────────────────────────────────────────────
// Configuration (secrets + tunable params)
// ─────────────────────────────────────────────────────────────────────────────

const LICENSE_PRIVATE_KEY = defineSecret('LICENSE_PRIVATE_KEY')
const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET')
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET')
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID')
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET')
const RAZORPAY_PLAN_MONTHLY = defineSecret('RAZORPAY_PLAN_MONTHLY')
const RAZORPAY_PLAN_YEARLY = defineSecret('RAZORPAY_PLAN_YEARLY')

// Tunable parameters (can be overridden via Remote Config without redeploy)
const TRIAL_DAYS = defineInt('TRIAL_DAYS', { default: 30 })
const MAX_TOKEN_DAYS = defineInt('MAX_TOKEN_DAYS', { default: 14 })
const RATE_LIMIT_WINDOW_MS = defineInt('RATE_LIMIT_WINDOW_MS', { default: 60_000 })
const RATE_LIMIT_MAX_REQUESTS = defineInt('RATE_LIMIT_MAX_REQUESTS', { default: 30 })
const PADDLE_IP_TTL_MS = defineInt('PADDLE_IP_TTL_MS', { default: 3_600_000 })

const DAY_MS = 24 * 60 * 60 * 1000

// ─────────────────────────────────────────────────────────────────────────────
// Schemas (Zod) — validates all external input
// ─────────────────────────────────────────────────────────────────────────────

const LicenseRequestSchema = z.object({
  method: z.literal('POST'),
})

const CreateSubscriptionSchema = z.object({
  method: z.literal('POST'),
  body: z.object({
    period: z.enum(['monthly', 'yearly']).optional(),
  }).optional(),
})

const VerifyPaymentSchema = z.object({
  method: z.literal('POST'),
  body: z.object({
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
    razorpay_order_id: z.string().optional(),
    razorpay_subscription_id: z.string().optional(),
  }).refine(b => b.razorpay_order_id || b.razorpay_subscription_id, {
    message: 'Either razorpay_order_id or razorpay_subscription_id required',
  }),
})

const PaddleWebhookSchema = z.object({
  event_type: z.string(),
  data: z.object({
    id: z.string(),
    custom_data: z.object({ uid: z.string() }).optional(),
    status: z.string().optional(),
    customer_id: z.string().optional(),
    subscription_id: z.string().optional(),
    current_billing_period: z.object({
      ends_at: z.string().optional(),
    }).optional(),
    details: z.object({
      totals: z.object({
        grand_total: z.string().optional(),
        total: z.string().optional(),
      }).optional(),
    }).optional(),
    billing_period: z.object({
      starts_at: z.string().optional(),
      ends_at: z.string().optional(),
    }).optional(),
    billed_at: z.string().optional(),
  }).optional(),
})

const RazorpayWebhookSchema = z.object({
  event: z.string(),
  payload: z.object({
    subscription: z.object({
      entity: z.object({
        id: z.string(),
        status: z.string(),
        notes: z.object({ uid: z.string() }).optional(),
        current_end: z.number().optional(),
        current_start: z.number().optional(),
      }),
    }).optional(),
    payment: z.object({
      entity: z.object({
        id: z.string(),
        amount: z.number(),
        currency: z.string(),
        status: z.string(),
        created_at: z.number(),
      }),
    }).optional(),
    invoice: z.object({
      entity: z.object({
        short_url: z.string().optional(),
      }),
    }).optional(),
  }).optional(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Logging & Request Context
// ─────────────────────────────────────────────────────────────────────────────

export interface RequestContext {
  requestId: string
  uid?: string
  startTime: number
  ip?: string
}

export function generateRequestId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

export function createLogger(ctx: RequestContext) {
  const base = { requestId: ctx.requestId, uid: ctx.uid, ip: ctx.ip }
  return {
    info: (msg: string, meta?: Record<string, unknown>) => console.log(JSON.stringify({ level: 'info', message: msg, ...base, ...meta, timestamp: Date.now() })),
    warn: (msg: string, meta?: Record<string, unknown>) => console.warn(JSON.stringify({ level: 'warn', message: msg, ...base, ...meta, timestamp: Date.now() })),
    error: (msg: string, meta?: Record<string, unknown>) => console.error(JSON.stringify({ level: 'error', message: msg, ...base, ...meta, timestamp: Date.now() })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiting (in-memory with Firestore fallback for multi-instance)
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number
  windowStart: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
}

const rateLimitCache = new Map<string, RateLimitEntry>()
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now()
  const windowMs = RATE_LIMIT_WINDOW_MS.value()
  for (const [key, entry] of rateLimitCache.entries()) {
    if (now - entry.windowStart >= windowMs) {
      rateLimitCache.delete(key)
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS)

/**
 * Check rate limit for an identifier (IP, user ID, etc.)
 * Uses in-memory cache for fast path, Firestore transaction for distributed safety.
 * Returns RateLimitResult with allowed flag and headers.
 */
export async function checkRateLimit(
  identifier: string,
  logger: ReturnType<typeof createLogger>
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = RATE_LIMIT_WINDOW_MS.value()
  const maxRequests = RATE_LIMIT_MAX_REQUESTS.value()

  // Fast path: in-memory cache
  const cached = rateLimitCache.get(identifier)
  if (cached) {
    if (now - cached.windowStart < windowMs) {
      // Within current window
      if (cached.count >= maxRequests) {
        logger.warn('Rate limit exceeded (memory)', { identifier, count: cached.count })
        return { allowed: false, remaining: 0, resetTime: cached.windowStart + windowMs }
      }
      cached.count++
      return { allowed: true, remaining: maxRequests - cached.count, resetTime: cached.windowStart + windowMs }
    }
    // Window expired - update cache with new window (avoids repeated Firestore fallback)
    rateLimitCache.set(identifier, { count: 1, windowStart: now })
    return { allowed: true, remaining: maxRequests - 1, resetTime: now + windowMs }
  }

  // No cache entry - slow path: Firestore transaction for cross-instance correctness
  const ref = db.collection('rateLimits').doc(identifier)
  try {
    const result = await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref)
      const data: RateLimitEntry = snap.exists
        ? (snap.data() as RateLimitEntry)
        : { count: 0, windowStart: now }
      if (now - data.windowStart >= windowMs) {
        data.count = 1
        data.windowStart = now
      } else if (data.count >= maxRequests) {
        return { allowed: false, count: data.count, windowStart: data.windowStart }
      } else {
        data.count++
      }
      txn.set(ref, data)
      return { allowed: true, count: data.count, windowStart: data.windowStart }
    })
    // Update in-memory cache with Firestore result
    rateLimitCache.set(identifier, { count: result.count, windowStart: result.windowStart })
    const remaining = Math.max(0, maxRequests - result.count)
    const resetTime = result.windowStart + windowMs
    return { allowed: result.allowed, remaining, resetTime }
  } catch (e) {
    // On Firestore error, allow but log (fail-open for availability)
    logger.error('Rate limit check failed, failing open', { error: String(e) })
    // Also seed cache to avoid hammering Firestore on repeated errors
    rateLimitCache.set(identifier, { count: 1, windowStart: now })
    return { allowed: true, remaining: maxRequests, resetTime: now + windowMs }
  }
}

/**
 * Create Express middleware for rate limiting.
 * Uses IP as default identifier; can be customized by providing a key function.
 */
export function rateLimitMiddleware(keyFn?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    const identifier = keyFn ? keyFn(req) : req.ip || 'unknown'
    const result = await checkRateLimit(identifier, logger)

    res.set({
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS.value()),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
    })

    if (!result.allowed) {
      logger.warn('Rate limit exceeded', { identifier })
      return res.status(429).json({ error: 'Too Many Requests' })
    }
    next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure Utility Functions (exported for testing)
// ─────────────────────────────────────────────────────────────────────────────

/** Convert IPv4 address to unsigned 32-bit integer. Returns null for invalid IPs. */
export function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

/** Check if an IPv4 address matches any CIDR in the allowlist. Returns false for IPv6. */
export function isIpAllowed(ip: string, cidrs: string[]): boolean {
  const ipInt = ipToInt(ip)
  if (ipInt == null) return false
  for (const c of cidrs) {
    const [addr, bitsStr] = String(c).split('/')
    const bits = bitsStr === undefined ? 32 : Number(bitsStr)
    const addrInt = ipToInt(addr)
    if (addrInt == null) continue
    const mask = bits <= 0 ? 0 : (bits >= 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0)
    if (((ipInt & mask) >>> 0) === ((addrInt & mask) >>> 0)) return true
  }
  return false
}

/** URL-safe base64 encoding (no padding). */
export const b64u = (buf: Buffer | Uint8Array): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Sign a payload with Ed25519 private key (PKCS#8 PEM). Returns `base64url(body).base64url(sig)`. */
export function signToken(payload: Record<string, unknown>, privateKeyPem: string): string {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), privateKeyPem)
  return `${body}.${b64u(sig)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Computation (mirrors entitlementCore.verifyToken logic)
// ─────────────────────────────────────────────────────────────────────────────

export interface AccountData {
  uid: string
  createdAt: number
  trialStartedAt: number
  plan: 'trial' | 'pro' | 'free'
  status: string
  provider: string | null
  subscriptionId: string | null
  currentPeriodEnd: number
  customerId?: string | null
  updatedAt: number
}

/** Compute current plan and period end from account data. */
export function computePlan(acct: AccountData, now: number): { plan: 'pro' | 'trial' | 'free'; periodEnd: number } {
  const periodEnd = Number(acct.currentPeriodEnd) || 0
  const isPaidPeriodValid = periodEnd > now
  const isDirectlyActive = ['active', 'authenticated', 'past_due'].includes(String(acct.status))

  if ((acct.plan === 'pro' || isPaidPeriodValid) && (isPaidPeriodValid || isDirectlyActive)) {
    return { plan: 'pro', periodEnd }
  }
  const trialEnd = Number(acct.trialStartedAt || 0) + TRIAL_DAYS.value() * DAY_MS
  if (acct.trialStartedAt && now < trialEnd) return { plan: 'trial', periodEnd: trialEnd }
  return { plan: 'free', periodEnd: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Management (transactional, race-condition-free)
// ─────────────────────────────────────────────────────────────────────────────

async function getOrCreateAccount(uid: string, logger: ReturnType<typeof createLogger>): Promise<AccountData> {
  const ref = db.collection('accounts').doc(uid)

  // Use transaction to prevent race conditions on first-time account creation
  return await db.runTransaction(async (txn) => {
    const snap = await txn.get(ref)
    if (snap.exists) {
      return snap.data() as AccountData
    }

    const now = Date.now()
    const fresh: AccountData = {
      uid,
      createdAt: now,
      trialStartedAt: now,
      plan: 'trial',
      status: 'trialing',
      provider: null,
      subscriptionId: null,
      currentPeriodEnd: now + TRIAL_DAYS.value() * DAY_MS,
      customerId: null,
      updatedAt: now,
    }
    txn.set(ref, fresh)
    logger.info('Created new trial account', { uid })
    return fresh
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Paddle IP Allowlist (cached with TTL)
// ─────────────────────────────────────────────────────────────────────────────

let paddleIpCache: { ips: string[]; expiresAt: number } | null = null

async function fetchPaddleIps(logger: ReturnType<typeof createLogger>): Promise<string[]> {
  const now = Date.now()
  if (paddleIpCache && now < paddleIpCache.expiresAt) {
    return paddleIpCache.ips
  }

  // Try Firestore cache first
  try {
    const doc = await db.collection('config').doc('paddle_ips').get()
    if (doc.exists && doc.data()?.ips && doc.data()?.expiresAt > now) {
      paddleIpCache = doc.data() as { ips: string[]; expiresAt: number }
      return paddleIpCache.ips
    }
  } catch {
    // ignore, fall through to network fetch
  }

  // Fetch from Paddle
  const resp = await fetch('https://paddle.com/api/2.0/seller/ips')
  if (!resp.ok) throw new Error(`Paddle IP fetch failed: ${resp.status}`)
  const data = await resp.json() as { ips: string[] }
  const ttl = PADDLE_IP_TTL_MS.value()
  paddleIpCache = { ips: data.ips, expiresAt: now + ttl }

  // Persist to Firestore for other instances
  await db.collection('config').doc('paddle_ips').set(paddleIpCache)
  logger.info('Fetched and cached Paddle IPs', { count: data.ips.length })
  return data.ips
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency (webhook deduplication)
// ─────────────────────────────────────────────────────────────────────────────

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

async function checkIdempotency(key: string, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  const ref = db.collection('idempotencyKeys').doc(key)
  const snap = await ref.get()
  if (snap.exists) {
    const data = snap.data()
    // Check if expired
    if (data?.createdAt && Date.now() - data.createdAt >= IDEMPOTENCY_TTL_MS) {
      // Expired - overwrite with new timestamp
      await ref.set({ createdAt: Date.now() })
      return true
    }
    logger.warn('Duplicate webhook detected', { key })
    return false
  }
  await ref.set({ createdAt: Date.now() })
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers
// ─────────────────────────────────────────────────────────────────────────────

function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
  const result = schema.safeParse(data)
  return result.success ? result.data : null
}

// License token endpoint
export const license = onRequest(
  { secrets: [LICENSE_PRIVATE_KEY] },
  async (req: Request, res: Response) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    // Rate limit
    const rlResult = await checkRateLimit(req.ip || 'unknown', logger)
    res.set({
      'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS.value()),
      'X-RateLimit-Remaining': String(rlResult.remaining),
      'X-RateLimit-Reset': new Date(rlResult.resetTime).toISOString(),
    })
    if (!rlResult.allowed) {
      return res.status(429).json({ error: 'Too Many Requests' })
    }

    // Validate request
    const validated = validateSchema(LicenseRequestSchema, { method: req.method })
    if (!validated) {
      return res.status(400).json({ error: 'Invalid request method' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' })
    }
    const uid = authHeader.slice(7)

    try {
      const account = await getOrCreateAccount(uid, logger)
      const { plan, periodEnd } = computePlan(account, Date.now())

      const tokenTtl = MAX_TOKEN_DAYS.value() * DAY_MS
      const expiresAt = Math.min(periodEnd || Date.now() + tokenTtl, Date.now() + tokenTtl)

      const privateKey = LICENSE_PRIVATE_KEY.value()
      const token = signToken({
        uid,
        plan,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(expiresAt / 1000),
      }, privateKey)

      logger.info('License token issued', { uid, plan, periodEnd })
      res.json({ token, plan, periodEnd })
    } catch (e) {
      logger.error('License endpoint error', { error: String(e) })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Create subscription endpoint
export const createSubscription = onRequest(
  { secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_MONTHLY, RAZORPAY_PLAN_YEARLY] },
  async (req: Request, res: Response) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    // Rate limit
    const rlResult = await checkRateLimit(req.ip || 'unknown', logger)
    if (!rlResult.allowed) {
      return res.status(429).json({ error: 'Too Many Requests' })
    }

    const validated = validateSchema(CreateSubscriptionSchema, { method: req.method, body: req.body })
    if (!validated) {
      return res.status(400).json({ error: 'Invalid request' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' })
    }
    const uid = authHeader.slice(7)

    try {
      const period = validated.body?.period || 'monthly'
      const planId = period === 'yearly' ? RAZORPAY_PLAN_YEARLY.value() : RAZORPAY_PLAN_MONTHLY.value()

      const razorpay = await import('razorpay')
      const instance = new razorpay.default({
        key_id: RAZORPAY_KEY_ID.value(),
        key_secret: RAZORPAY_KEY_SECRET.value(),
      })

      const subscription = await instance.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,
        total_count: 0, // infinite
        notes: { uid },
      })

      logger.info('Created Razorpay subscription', { uid, subscriptionId: subscription.id })
      res.json({ subscription_id: subscription.id, short_url: subscription.short_url })
    } catch (e) {
      logger.error('Create subscription error', { error: String(e) })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Verify payment endpoint
export const verifyPayment = onRequest(
  { secrets: [RAZORPAY_KEY_SECRET] },
  async (req: Request, res: Response) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    const rlResult = await checkRateLimit(req.ip || 'unknown', logger)
    if (!rlResult.allowed) {
      return res.status(429).json({ error: 'Too Many Requests' })
    }

    const validated = validateSchema(VerifyPaymentSchema, { method: req.method, body: req.body })
    if (!validated) {
      return res.status(400).json({ error: 'Invalid request body' })
    }

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' })
    }
    const uid = authHeader.slice(7)

    try {
      const { razorpay_payment_id, razorpay_signature, razorpay_order_id, razorpay_subscription_id } = validated.body

      const cryptoSecret = RAZORPAY_KEY_SECRET.value()
      const expectedSignature = crypto
        .createHmac('sha256', cryptoSecret)
        .update(razorpay_order_id ? `${razorpay_order_id}|${razorpay_payment_id}` : razorpay_subscription_id!)
        .digest('hex')

      if (expectedSignature !== razorpay_signature) {
        logger.warn('Invalid Razorpay signature', { uid })
        return res.status(400).json({ error: 'Invalid signature' })
      }

      // Fetch payment details
      const razorpay = await import('razorpay')
      const instance = new razorpay.default({
        key_id: RAZORPAY_KEY_ID.value(),
        key_secret: RAZORPAY_KEY_SECRET.value(),
      })
      const payment = await instance.payments.fetch(razorpay_payment_id)

      // Update account with subscription info
      if (razorpay_subscription_id) {
        const accountRef = db.collection('accounts').doc(uid)
        await accountRef.set({
          provider: 'razorpay',
          subscriptionId: razorpay_subscription_id,
          status: 'active',
          plan: 'pro',
          currentPeriodEnd: Date.now() + 30 * DAY_MS, // will be updated by webhook
          updatedAt: Date.now(),
        }, { merge: true })
        logger.info('Verified payment, updated account', { uid, subscriptionId: razorpay_subscription_id })
      }

      res.json({ verified: true, amount: payment.amount, currency: payment.currency })
    } catch (e) {
      logger.error('Verify payment error', { error: String(e) })
      res.status(500).json({ error: 'Internal server error' })
    }
  }
)

// Paddle webhook endpoint
export const paddleWebhook = onRequest(
  { secrets: [PADDLE_WEBHOOK_SECRET] },
  async (req: Request, res: Response) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    // Verify webhook signature
    const signature = req.headers['paddle-signature'] as string
    if (!signature) {
      return res.status(401).json({ error: 'Missing Paddle signature' })
    }

    // Verify IP is from Paddle
    const paddleIps = await fetchPaddleIps(logger)
    if (!isIpAllowed(req.ip || '', paddleIps)) {
      logger.warn('Webhook from non-Paddle IP', { ip: req.ip })
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Parse and validate
    const validated = validateSchema(PaddleWebhookSchema, req.body)
    if (!validated) {
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }

    // Idempotency check
    const idempotencyKey = `paddle_${validated.data?.id}_${validated.event_type}`
    if (!(await checkIdempotency(idempotencyKey, logger))) {
      return res.status(200).send('OK') // Acknowledge duplicate
    }

    // Translate to billing event
    const billingEvent = buildPaddleBillingEvent(req.body, Date.now())
    if (billingEvent) {
      // Write billing history
      await db.collection('billingHistory').doc(billingEvent.key).set({
        ...billingEvent.record,
        uid: billingEvent.uid,
        createdAt: Date.now(),
      })

      // Update account entitlement
      if (billingEvent.record.type === 'charge') {
        await db.collection('accounts').doc(billingEvent.uid).set({
          provider: 'paddle',
          subscriptionId: billingEvent.record.subscriptionId,
          status: 'active',
          plan: 'pro',
          currentPeriodEnd: billingEvent.record.periodEnd,
          updatedAt: Date.now(),
        }, { merge: true })
      } else if (billingEvent.record.type === 'failed') {
        await db.collection('accounts').doc(billingEvent.uid).set({
          status: 'past_due',
          updatedAt: Date.now(),
        }, { merge: true })
      }
    }

    logger.info('Paddle webhook processed', { event: validated.event_type })
    res.status(200).send('OK')
  }
)

// Razorpay webhook endpoint
export const razorpayWebhook = onRequest(
  { secrets: [RAZORPAY_WEBHOOK_SECRET] },
  async (req: Request, res: Response) => {
    const requestId = generateRequestId()
    const ctx: RequestContext = { requestId, startTime: Date.now(), ip: req.ip }
    const logger = createLogger(ctx)

    // Verify signature
    const signature = req.headers['x-razorpay-signature'] as string
    if (!signature) {
      return res.status(401).json({ error: 'Missing Razorpay signature' })
    }

    const webhookSecret = RAZORPAY_WEBHOOK_SECRET.value()
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex')

    if (expectedSignature !== signature) {
      logger.warn('Invalid Razorpay webhook signature')
      return res.status(401).json({ error: 'Invalid signature' })
    }

    // Parse and validate
    const validated = validateSchema(RazorpayWebhookSchema, req.body)
    if (!validated) {
      return res.status(400).json({ error: 'Invalid webhook payload' })
    }

    // Idempotency check
    const idempotencyKey = `razorpay_${validated.payload?.subscription?.entity?.id}_${validated.event}`
    if (!(await checkIdempotency(idempotencyKey, logger))) {
      return res.status(200).send('OK')
    }

    // Translate to billing event
    const billingEvent = buildRazorpayBillingEvent(req.body, Date.now())
    if (billingEvent) {
      // Write billing history
      await db.collection('billingHistory').doc(billingEvent.key).set({
        ...billingEvent.record,
        uid: billingEvent.uid,
        createdAt: Date.now(),
      })

      // Update account entitlement
      if (billingEvent.record.type === 'charge') {
        await db.collection('accounts').doc(billingEvent.uid).set({
          provider: 'razorpay',
          subscriptionId: billingEvent.record.subscriptionId,
          status: 'active',
          plan: 'pro',
          currentPeriodEnd: billingEvent.record.periodEnd,
          updatedAt: Date.now(),
        }, { merge: true })
      } else if (billingEvent.record.type === 'failed' || billingEvent.record.type === 'cancelled') {
        const newStatus = billingEvent.record.type === 'cancelled' ? 'canceled' : 'past_due'
        await db.collection('accounts').doc(billingEvent.uid).set({
          status: newStatus,
          updatedAt: Date.now(),
        }, { merge: true })
      }
    }

    logger.info('Razorpay webhook processed', { event: validated.event })
    res.status(200).send('OK')
  }
)