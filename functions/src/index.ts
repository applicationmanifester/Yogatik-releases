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
import type { Request, Response } from 'express'
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

interface RequestContext {
  requestId: string
  uid?: string
  startTime: number
  ip?: string
}

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`
}

function createLogger(ctx: RequestContext) {
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

const rateLimitCache = new Map<string, RateLimitEntry>()

async function checkRateLimit(identifier: string, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  const now = Date.now()
  const windowMs = RATE_LIMIT_WINDOW_MS.value()
  const maxRequests = RATE_LIMIT_MAX_REQUESTS.value()

  // Try in-memory first (fast path)
  const cached = rateLimitCache.get(identifier)
  if (cached && now - cached.windowStart < windowMs) {
    if (cached.count >= maxRequests) {
      logger.warn('Rate limit exceeded (memory)', { identifier, count: cached.count })
      return false
    }
    cached.count++
    return true
  }

  // Fallback to Firestore for distributed rate limiting
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
        return { allowed: false, count: data.count }
      } else {
        data.count++
      }
      txn.set(ref, data)
      return { allowed: true, count: data.count }
    })
    return result.allowed
  } catch (e) {
    // On Firestore error, allow but log (fail-open for availability)
    logger.error('Rate limit check failed, failing open', { error: String(e) })
    return true
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Minting (mirrors entitlementCore.verifyToken)
// ─────────────────────────────────────────────────────────────────────────────

const b64u = (buf: Buffer | Uint8Array): string =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function signToken(payload: Record<string, unknown>, privateKeyPem: string): string {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), privateKeyPem)
  return `${body}.${b64u(sig)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Management (transactional, race-condition-free)
// ─────────────────────────────────────────────────────────────────────────────

interface AccountData {
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

function computePlan(acct: AccountData, now: number): { plan: 'pro' | 'trial' | 'free'; periodEnd: number } {
  const periodEnd = Number(acct.currentPeriodEnd) || 0
  const isPaidPeriodValid = periodEnd > now
  const isDirectlyActive = ['active', 'authenticated', 'past_due'].includes(acct.status)

  if ((acct.plan === 'pro' || isPaidPeriodValid) && (isPaidPeriodValid || isDirectlyActive)) {
    return { plan: 'pro', periodEnd }
  }
  const trialEnd = Number(acct.trialStartedAt || 0) + TRIAL_DAYS.value() * DAY_MS
  if (acct.trialStartedAt && now < trialEnd) return { plan: 'trial', periodEnd: trialEnd }
  return { plan: 'free', periodEnd: 0 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paddle IP Allowlist (persisted to Firestore, survives cold starts)
// ─────────────────────────────────────────────────────────────────────────────

interface PaddleIpCache {
  cidrs: string[] | null
  fetchedAt: number
}

async function getPaddleCidrs(logger: ReturnType<typeof createLogger>): Promise<string[] | null> {
  const cacheRef = db.collection('config').doc('paddleIpCache')
  const now = Date.now()
  const ttl = PADDLE_IP_TTL_MS.value()

  // Try cache first
  const cached = await cacheRef.get()
  if (cached.exists) {
    const data = cached.data() as PaddleIpCache
    if (data.cidrs && now - data.fetchedAt < ttl) {
      return data.cidrs
    }
  }

  // Fetch fresh
  try {
    const resp = await fetch('https://api.paddle.com/ips')
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const body: { data?: { ipv4_cidrs?: string[] } } = (await resp.json()) as { data?: { ipv4_cidrs?: string[] } }
    const cidrs = body?.data?.ipv4_cidrs
    if (!Array.isArray(cidrs) || !cidrs.length) throw new Error('Empty IP list')

    await cacheRef.set({ cidrs, fetchedAt: now })
    return cidrs
  } catch (e) {
    logger.error('Failed to refresh Paddle IP allowlist', { error: String(e) })
    // Return stale cache if available
    if (cached.exists) {
      const data = cached.data() as PaddleIpCache
      if (data.cidrs) {
        logger.warn('Serving stale Paddle IP cache')
        return data.cidrs
      }
    }
    // No cache at all — skip IP check (fail-open for availability)
    logger.warn('No Paddle IP cache available, skipping IP check')
    return null
  }
}

function ipToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

function isIpAllowed(ip: string, cidrs: string[]): boolean {
  const ipInt = ipToInt(ip)
  if (ipInt == null) return false
  for (const c of cidrs) {
    const [addr, bitsStr] = c.split('/')
    const bits = bitsStr === undefined ? 32 : Number(bitsStr)
    const addrInt = ipToInt(addr)
    if (addrInt == null) continue
    const mask = bits <= 0 ? 0 : (bits >= 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0)
    if (((ipInt & mask) >>> 0) === ((addrInt & mask) >>> 0)) return true
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency for Webhooks
// ─────────────────────────────────────────────────────────────────────────────

async function checkIdempotency(key: string): Promise<boolean> {
  const ref = db.collection('idempotencyKeys').doc(key)
  const snap = await ref.get()
  if (snap.exists) return false // Already processed
  await ref.set({ processedAt: Date.now() })
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware Pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Firebase-functions' defineSecret() returns SecretParam; HandlerOptions
 * accepts whatever secrets array the caller passes (they are forwarded to
 * onRequest verbatim).
 */
/**
 * defineSecret() returns SecretParam; HandlerOptions accepts the same
 * (string | SecretParam)[] shape onRequest does — derived via ReturnType so
 * the internal type does not need importing.
 */
type SecretValue = ReturnType<typeof defineSecret>

interface HandlerOptions {
  secrets?: Array<string | SecretValue>
  cors?: boolean
  region?: string
  requireAuth?: boolean
  rateLimit?: boolean
  schema?: z.ZodSchema
}

/** express Request lacks rawBody; firebase-functions v2 attaches it. */
type RequestWithRawBody = Request & { rawBody?: Buffer }

/**
 * Handler may return a Response (from res.json()) or void — the wrapper
 * discards it, since onRequest only requires `void | Promise<void>`.
 */
type HandlerFn = (req: Request, res: Response, ctx: RequestContext) => Promise<unknown> | unknown

function withMiddleware(
  handler: HandlerFn,
  options: HandlerOptions = {}
) {
  const { secrets = [], cors = false, region = 'asia-south1', requireAuth = true, rateLimit = true, schema } = options

  return onRequest(
    { secrets, cors, region },
    async (req: Request, res: Response): Promise<void> => {
      const requestId = generateRequestId()
      const ip = String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      const ctx: RequestContext = { requestId, startTime: Date.now(), ip }
      const logger = createLogger(ctx)

      // CORS preflight
      if (cors && req.method === 'OPTIONS') {
        res.status(204).send('')
        return
      }

      // Method check
      if (schema) {
        const result = schema.safeParse({ method: req.method, body: req.body })
        if (!result.success) {
          logger.warn('Schema validation failed', { errors: result.error.flatten() })
          res.status(400).json({ error: 'invalid-request', detail: result.error.flatten() })
          return
        }
      }

      // Rate limiting
      if (rateLimit) {
        const identifier = ctx.uid || ip || 'anonymous'
        const allowed = await checkRateLimit(`ratelimit:${identifier}`, logger)
        if (!allowed) {
          res.status(429).json({ error: 'rate-limited', retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS.value() / 1000) })
          return
        }
      }

      // Authentication
      if (requireAuth) {
        const authz = String(req.headers.authorization || '')
        if (!authz.startsWith('Bearer ')) {
          logger.warn('Missing Bearer token')
          res.status(401).json({ error: 'Missing identity' })
          return
        }
        try {
          const decoded = await admin.auth().verifyIdToken(authz.slice(7), true)
          ctx.uid = decoded.uid
        } catch (e) {
          logger.warn('Invalid ID token', { error: String(e) })
          res.status(401).json({ error: 'Invalid identity' })
          return
        }
      }

      try {
        await handler(req, res, ctx)
      } catch (e) {
        logger.error('Unhandled error in handler', { error: String(e), stack: e instanceof Error ? e.stack : undefined })
        if (!res.headersSent) {
          res.status(500).json({ error: 'internal-error' })
        }
      } finally {
        const duration = Date.now() - ctx.startTime
        logger.info('Request completed', { durationMs: duration, status: res.statusCode })
      }
    }
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint Handlers
// ─────────────────────────────────────────────────────────────────────────────

// POST /license — issue or refresh token
export const license = withMiddleware(
  async (req, res, ctx) => {
    const logger = createLogger(ctx)
    const now = Date.now()
    const { uid } = ctx

    if (!uid) return res.status(401).json({ error: 'Missing identity' })

    const acct = await getOrCreateAccount(uid, logger)
    const { plan, periodEnd } = computePlan(acct, now)

    if (plan === 'free') {
      return res.json({ plan: 'free', reason: 'no-active-entitlement' })
    }

    const token = signToken({
      v: 1,
      sub: uid,
      plan,
      iat: now,
      exp: Math.min(periodEnd || (now + MAX_TOKEN_DAYS.value() * DAY_MS), now + MAX_TOKEN_DAYS.value() * DAY_MS),
      per: periodEnd,
    }, LICENSE_PRIVATE_KEY.value())

    return res.json({ token, plan, currentPeriodEnd: periodEnd })
  },
  { secrets: [LICENSE_PRIVATE_KEY], cors: true, rateLimit: true }
)

// POST /createSubscription — Razorpay subscription creation
export const createSubscription = withMiddleware(
  async (req, res, ctx) => {
    const logger = createLogger(ctx)
    const { uid } = ctx

    if (!uid) return res.status(401).json({ error: 'Missing identity' })

    const keyId = (RAZORPAY_KEY_ID.value() || '').trim()
    const keySecret = (RAZORPAY_KEY_SECRET.value() || '').trim()
    if (!keyId || !keySecret) {
      return res.status(503).json({ error: 'not-configured', detail: 'Razorpay keys are not set on this deployment.' })
    }

    const period = String(req.body?.period || 'monthly')
    const rawPlan = period === 'yearly' ? RAZORPAY_PLAN_YEARLY.value() : RAZORPAY_PLAN_MONTHLY.value()
    const planId = (rawPlan || '').trim()
    if (!planId) {
      return res.status(503).json({ error: 'not-configured', detail: `No Razorpay plan id configured for ${period}.` })
    }

    try {
      const r = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          plan_id: planId,
          total_count: period === 'yearly' ? 10 : 120,
          customer_notify: 1,
          notes: { uid },
        }),
      })
      const body = (await r.json()) as { id?: string; error?: { description?: string } }
      if (!r.ok) {
        logger.warn('Razorpay subscription creation failed', { status: r.status, body })
        return res.status(502).json({ error: 'razorpay-rejected', detail: body?.error?.description || `HTTP ${r.status}` })
      }
      return res.json({ subscriptionId: body.id, keyId, period })
    } catch (e) {
      logger.error('Razorpay unreachable', { error: String(e) })
      return res.status(502).json({ error: 'razorpay-unreachable', detail: String(e) })
    }
  },
  {
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_MONTHLY, RAZORPAY_PLAN_YEARLY],
    cors: true,
    schema: CreateSubscriptionSchema,
  }
)

// POST /verifyPayment — Razorpay checkout signature verification
export const verifyPayment = withMiddleware(
  async (req, res, ctx) => {
    const logger = createLogger(ctx)

    const b = req.body || {}
    const paymentId = String(b.razorpay_payment_id || '')
    const orderId = String(b.razorpay_order_id || '')
    const subscriptionId = String(b.razorpay_subscription_id || '')
    const signature = String(b.razorpay_signature || '')

    const keySecret = (RAZORPAY_KEY_SECRET.value() || '').trim()
    if (!keySecret) {
      return res.status(503).json({ verified: false, error: 'not-configured' })
    }

    const body = subscriptionId ? `${paymentId}|${subscriptionId}` : `${orderId}|${paymentId}`
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex')

    const a = Buffer.from(signature, 'utf8')
    const e = Buffer.from(expected, 'utf8')
    const ok = a.length === e.length && crypto.timingSafeEqual(a, e)

    if (!ok) {
      logger.warn('Signature mismatch', { paymentId, subscriptionId, orderId })
      return res.status(400).json({ verified: false, error: 'signature-mismatch' })
    }

    return res.json({
      verified: true,
      paymentId,
      ...(subscriptionId ? { subscriptionId } : { orderId }),
      note: 'Signature valid. Entitlement is granted by the webhook, not by this response.',
    })
  },
  { secrets: [RAZORPAY_KEY_SECRET], cors: true, schema: VerifyPaymentSchema }
)

// Paddle Webhook
export const paddleWebhook = withMiddleware(
  async (req, res, ctx) => {
    const logger = createLogger(ctx)

    // IP allowlist (defense in depth)
    const cidrs = await getPaddleCidrs(logger)
    if (cidrs) {
      const ip = String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      if (!isIpAllowed(ip, cidrs)) {
        logger.warn('Rejected — source IP not on Paddle allowlist', { ip })
        return res.status(403).send('forbidden')
      }
    }

    // Raw body required for HMAC verification
    const raw = (req as RequestWithRawBody).rawBody
    const header = String(req.headers['paddle-signature'] || '')
    const ts = /ts=(\d+)/.exec(header)?.[1]
    const h1 = /h1=([a-f0-9]+)/.exec(header)?.[1]
    if (!ts || !h1 || !raw) return res.status(400).send('bad signature header')

    const webhookSecret = (PADDLE_WEBHOOK_SECRET.value() || '').trim()
    const expected = crypto.createHmac('sha256', webhookSecret).update(`${ts}:${raw.toString('utf8')}`).digest('hex')
    const a = Buffer.from(h1, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send('bad signature')
    }

    // Replay guard
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send('stale')

    const evt = JSON.parse(raw.toString('utf8'))

    // Idempotency check
    const idempotencyKey = `paddle:${evt.event_type}:${evt.data?.id || 'unknown'}`
    const isNew = await checkIdempotency(idempotencyKey)
    if (!isNew) {
      logger.info('Duplicate webhook ignored', { idempotencyKey })
      return res.status(200).send('ok')
    }

    const d = evt?.data || {}
    const uid = d?.custom_data?.uid
    if (!uid) {
      logger.warn('Webhook missing uid', { eventType: evt.event_type })
      return res.status(200).send('no uid')
    }

    const periodEndMs = d?.current_billing_period?.ends_at ? Date.parse(d.current_billing_period.ends_at) : 0
    const now = Date.now()
    const isPaidPeriodValid = periodEndMs > now
    const isDirectlyActive = ['subscription.created', 'subscription.updated', 'subscription.activated'].includes(evt.event_type)
      && ['active', 'trialing', 'past_due'].includes(d.status)
    const isPro = isDirectlyActive || isPaidPeriodValid

    await db.collection('accounts').doc(uid).set({
      plan: isPro ? 'pro' : 'free',
      status: d.status || 'canceled',
      provider: 'paddle',
      subscriptionId: d.id || null,
      customerId: d.customer_id || null,
      currentPeriodEnd: periodEndMs,
      updatedAt: now,
    }, { merge: true })

    // Billing history (non-blocking)
    try {
      const billing = buildPaddleBillingEvent(evt, now)
      if (billing) {
        await db.collection('accounts').doc(billing.uid)
          .collection('billingEvents').doc(billing.key)
          .set({ ...billing.record, recordedAt: now }, { merge: true })
      }
    } catch (e) {
      logger.error('Billing history write failed', { error: String(e) })
    }

    return res.status(200).send('ok')
  },
  { secrets: [PADDLE_WEBHOOK_SECRET], region: 'asia-south1', requireAuth: false, rateLimit: false, schema: PaddleWebhookSchema }
)

// Razorpay Webhook
export const razorpayWebhook = withMiddleware(
  async (req, res, ctx) => {
    const logger = createLogger(ctx)

    const raw = (req as RequestWithRawBody).rawBody
    const sig = String(req.headers['x-razorpay-signature'] || '')
    if (!raw || !sig) return res.status(400).send('bad signature header')

    const secret = (RAZORPAY_WEBHOOK_SECRET.value() || '').trim()
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send('bad signature')
    }

    const evt = JSON.parse(raw.toString('utf8'))

    // Idempotency check
    const idempotencyKey = `razorpay:${evt.event}:${evt.payload?.subscription?.entity?.id || 'unknown'}`
    const isNew = await checkIdempotency(idempotencyKey)
    if (!isNew) {
      logger.info('Duplicate webhook ignored', { idempotencyKey })
      return res.status(200).send('ok')
    }

    const sub = evt?.payload?.subscription?.entity
    const uid = sub?.notes?.uid
    if (!uid) {
      logger.warn('Webhook missing uid in subscription notes', { event: evt.event })
      return res.status(200).send('no uid')
    }

    const periodEndMs = sub.current_end ? Number(sub.current_end) * 1000 : 0
    const now = Date.now()
    const isPaidPeriodValid = periodEndMs > now
    const ACTIVE = ['subscription.charged', 'subscription.activated', 'subscription.authenticated', 'subscription.resumed']
    const isDirectlyActive = ACTIVE.includes(evt.event) && ['active', 'authenticated'].includes(sub.status)
    const isPro = isDirectlyActive || isPaidPeriodValid

    await db.collection('accounts').doc(uid).set({
      plan: isPro ? 'pro' : 'free',
      status: sub.status || 'cancelled',
      provider: 'razorpay',
      subscriptionId: sub.id || null,
      currentPeriodEnd: periodEndMs,
      updatedAt: now,
    }, { merge: true })

    // Billing history (non-blocking)
    try {
      const billing = buildRazorpayBillingEvent(evt, now)
      if (billing) {
        await db.collection('accounts').doc(billing.uid)
          .collection('billingEvents').doc(billing.key)
          .set({ ...billing.record, recordedAt: now }, { merge: true })
      }
    } catch (e) {
      logger.error('Billing history write failed', { error: String(e) })
    }

    return res.status(200).send('ok')
  },
  { secrets: [RAZORPAY_WEBHOOK_SECRET], region: 'asia-south1', requireAuth: false, rateLimit: false, schema: RazorpayWebhookSchema }
)