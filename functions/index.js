/**
 * Yogatik licence server.
 *
 * The ONLY thing that grants entitlement is a provider WEBHOOK. A checkout
 * redirect is a browser navigation and can be forged by anyone who can type a
 * URL; the webhook is signed by the provider and is the money.
 *
 * Deploy:  firebase deploy --only functions
 * Secrets: firebase functions:secrets:set LICENSE_PRIVATE_KEY \
 *                                         PADDLE_WEBHOOK_SECRET \
 *                                         RAZORPAY_WEBHOOK_SECRET \
 *                                         RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET
 *
 * Generate the licence keypair once (the PUBLIC half goes in
 * frontend/electron/entitlementCore.cjs, the private half NEVER leaves here):
 *
 *   node -e "const{generateKeyPairSync}=require('crypto');\
 *   const{publicKey,privateKey}=generateKeyPairSync('ed25519');\
 *   console.log(publicKey.export({type:'spki',format:'pem'}));\
 *   console.log(privateKey.export({type:'pkcs8',format:'pem'}))"
 */

const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()
const db = admin.firestore()

const LICENSE_PRIVATE_KEY = defineSecret('LICENSE_PRIVATE_KEY')
const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET')
const RAZORPAY_WEBHOOK_SECRET = defineSecret('RAZORPAY_WEBHOOK_SECRET')
// Creating the subscription is what puts `notes.uid` on it, and notes.uid is
// the ONLY thing that lets razorpayWebhook know whose account to upgrade. A
// plain hosted payment-page link carries no uid, so the webhook would arrive,
// find nothing, and reply "no uid" — money taken, nobody upgraded.
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID')
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET')
const RAZORPAY_PLAN_MONTHLY = defineSecret('RAZORPAY_PLAN_MONTHLY')
const RAZORPAY_PLAN_YEARLY = defineSecret('RAZORPAY_PLAN_YEARLY')

const DAY = 24 * 60 * 60 * 1000
const TRIAL_DAYS = 30
/** Token lifetime cap. Short on purpose — see entitlementCore.cjs. */
const MAX_TOKEN_MS = 14 * DAY

/* ── token minting (mirrors entitlementCore.verifyToken) ─────────────────── */

const b64u = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

function signToken(payload, privateKeyPem) {
  const body = b64u(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), privateKeyPem)
  return `${body}.${b64u(sig)}`
}

/* ── entitlement resolution ──────────────────────────────────────────────── */

/**
 * The account document is the single source of truth. The client never writes
 * any of these fields — firestore.rules denies it — because a client-writable
 * `plan` is not a paywall, it is a suggestion.
 */
async function accountDoc(uid) {
  const ref = db.collection('accounts').doc(uid)
  const snap = await ref.get()
  if (snap.exists) return { ref, data: snap.data() }

  // First sight of this account: start the trial from the SERVER clock. A
  // client-supplied start resets with the system date.
  const now = Date.now()
  const fresh = {
    uid,
    createdAt: now,
    trialStartedAt: now,
    plan: 'trial',
    status: 'trialing',
    provider: null,
    subscriptionId: null,
    currentPeriodEnd: now + TRIAL_DAYS * DAY,
  }
  await ref.set(fresh)
  return { ref, data: fresh }
}

function planFor(acct, now) {
  // A paid subscription always wins over a trial, including a trial that has
  // not yet expired — someone who paid early must not be downgraded on renewal.
  if (acct.plan === 'pro' && ['active', 'past_due'].includes(acct.status)) {
    return { plan: 'pro', per: Number(acct.currentPeriodEnd) || 0 }
  }
  const trialEnd = Number(acct.trialStartedAt || 0) + TRIAL_DAYS * DAY
  if (acct.trialStartedAt && now < trialEnd) return { plan: 'trial', per: trialEnd }
  return { plan: 'free', per: 0 }
}

/* ── POST /license — issue or refresh ────────────────────────────────────── */

exports.license = onRequest(
  { secrets: [LICENSE_PRIVATE_KEY], cors: true, region: 'asia-south1' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    const authz = String(req.headers.authorization || '')
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing identity' })

    let uid
    try {
      // verifyIdToken checks the signature, the issuer, the audience AND
      // revocation. A decoded-but-unverified token is a string the caller
      // chose; this is the whole authentication boundary.
      const decoded = await admin.auth().verifyIdToken(authz.slice(7), true)
      uid = decoded.uid
    } catch { return res.status(401).json({ error: 'Invalid identity' }) }

    const now = Date.now()
    const { data: acct } = await accountDoc(uid)
    const { plan, per } = planFor(acct, now)

    if (plan === 'free') {
      // Answer honestly rather than 4xx: the client has to be able to tell
      // "your trial ended" apart from "the licence server is down", and those
      // must not look the same or a Firebase outage reads as an expiry.
      return res.json({ plan: 'free', reason: 'no-active-entitlement' })
    }

    const token = signToken({
      v: 1,
      sub: uid,
      plan,
      iat: now,
      // min(period end, now + 14d). A token that outlives the subscription is
      // a subscription that never ends.
      exp: Math.min(per || (now + MAX_TOKEN_MS), now + MAX_TOKEN_MS),
      per,
    }, LICENSE_PRIVATE_KEY.value())

    return res.json({ token, plan, currentPeriodEnd: per })
  },
)

/* ── POST /createSubscription — Razorpay, server-side ────────────────────── */

/**
 * Create a Razorpay subscription for the SIGNED-IN user and return its id.
 *
 * This has to happen on the server for two independent reasons:
 *  - The Razorpay key SECRET is required to create a subscription, and a secret
 *    in a page the user can view is not a secret.
 *  - `notes.uid` has to be attached HERE, from a verified ID token. It is the
 *    only link between the payment and the account: razorpayWebhook reads
 *    `sub.notes.uid` and, without it, replies "no uid" and upgrades nobody. A
 *    uid supplied by the browser would let anyone upgrade any account.
 *
 * Returns 503 with a plain reason when the Razorpay credentials are not
 * configured, rather than a generic failure — "payments are not set up yet" and
 * "your card was declined" must never look the same to the person paying.
 */
exports.createSubscription = onRequest(
  {
    secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_PLAN_MONTHLY, RAZORPAY_PLAN_YEARLY],
    cors: true,
    region: 'asia-south1',
  },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

    const authz = String(req.headers.authorization || '')
    if (!authz.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing identity' })
    let uid
    try {
      const decoded = await admin.auth().verifyIdToken(authz.slice(7), true)
      uid = decoded.uid
    } catch { return res.status(401).json({ error: 'Invalid identity' }) }

    const keyId = RAZORPAY_KEY_ID.value()
    const keySecret = RAZORPAY_KEY_SECRET.value()
    if (!keyId || !keySecret) {
      return res.status(503).json({ error: 'not-configured', detail: 'Razorpay keys are not set on this deployment.' })
    }

    const period = String(req.body?.period || 'monthly')
    const planId = period === 'yearly' ? RAZORPAY_PLAN_YEARLY.value() : RAZORPAY_PLAN_MONTHLY.value()
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
          // 120 monthly cycles / 10 yearly. Razorpay requires a finite count;
          // this is "until they cancel" expressed in its API.
          total_count: period === 'yearly' ? 10 : 120,
          customer_notify: 1,
          notes: { uid },
        }),
      })
      const body = await r.json()
      if (!r.ok) {
        return res.status(502).json({ error: 'razorpay-rejected', detail: body?.error?.description || `HTTP ${r.status}` })
      }
      // The key id is public by design (it goes into the checkout widget); the
      // secret never leaves this function.
      return res.json({ subscriptionId: body.id, keyId, period })
    } catch (e) {
      return res.status(502).json({ error: 'razorpay-unreachable', detail: e?.message || String(e) })
    }
  },
)

/* ── POST /verifyPayment — Razorpay checkout signature ───────────────────── */

/**
 * Verify the signature Razorpay Checkout hands back when a payment succeeds.
 *
 * THE OPERAND ORDER IS NOT THE SAME FOR BOTH FLOWS, and getting it wrong makes
 * every verification fail with nothing to say why:
 *
 *   one-time order:  HMAC_SHA256(order_id + '|' + payment_id, key_secret)
 *   subscription:    HMAC_SHA256(payment_id + '|' + subscription_id, key_secret)
 *
 * Yogatik sells subscriptions, so the second is the live path here; the first
 * is supported because Razorpay's own docs lead with it and anyone adding a
 * one-off purchase later will reach for this endpoint.
 *
 * THIS IS NOT WHAT GRANTS ACCESS. `razorpayWebhook` is, and it must stay that
 * way: the client can simply never call this, so treating a verified response
 * as the grant would mean access depends on the browser choosing to ask. What
 * this buys is an honest confirmation on the checkout page — "payment
 * confirmed" instead of "payment probably went through" — and a signal if
 * something is tampering with the response.
 */
exports.verifyPayment = onRequest(
  { secrets: [RAZORPAY_KEY_SECRET], cors: true, region: 'asia-south1' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

    const b = req.body || {}
    const paymentId = String(b.razorpay_payment_id || '')
    const orderId = String(b.razorpay_order_id || '')
    const subscriptionId = String(b.razorpay_subscription_id || '')
    const signature = String(b.razorpay_signature || '')

    if (!paymentId || !signature || (!orderId && !subscriptionId)) {
      return res.status(400).json({
        verified: false,
        error: 'missing-fields',
        detail: 'razorpay_payment_id, razorpay_signature and one of razorpay_order_id / razorpay_subscription_id are required.',
      })
    }

    const keySecret = RAZORPAY_KEY_SECRET.value()
    if (!keySecret) {
      // Distinguishable from a bad signature on purpose: "we cannot check" and
      // "this is forged" are different facts and must not read the same.
      return res.status(503).json({ verified: false, error: 'not-configured' })
    }

    const body = subscriptionId
      ? `${paymentId}|${subscriptionId}`
      : `${orderId}|${paymentId}`
    const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex')

    // timingSafeEqual, not ===. A plain comparison leaks the signature one byte
    // at a time to anyone who can measure the response.
    const a = Buffer.from(signature, 'utf8')
    const e = Buffer.from(expected, 'utf8')
    const ok = a.length === e.length && crypto.timingSafeEqual(a, e)

    if (!ok) {
      console.warn('[verifyPayment] signature mismatch', { paymentId, subscriptionId, orderId })
      return res.status(400).json({ verified: false, error: 'signature-mismatch' })
    }

    return res.json({
      verified: true,
      paymentId,
      ...(subscriptionId ? { subscriptionId } : { orderId }),
      // Said plainly so nobody later mistakes this for the entitlement grant.
      note: 'Signature valid. Entitlement is granted by the webhook, not by this response.',
    })
  },
)

/* ── Paddle webhook ──────────────────────────────────────────────────────── */

exports.paddleWebhook = onRequest(
  { secrets: [PADDLE_WEBHOOK_SECRET], region: 'asia-south1' },
  async (req, res) => {
    // rawBody, not the parsed body. JSON.stringify(req.body) re-serialises with
    // different key order and whitespace, so the HMAC never matches and every
    // webhook silently fails verification — a class of bug that looks like the
    // provider not sending anything.
    const raw = req.rawBody
    const header = String(req.headers['paddle-signature'] || '')
    const ts = /ts=(\d+)/.exec(header)?.[1]
    const h1 = /h1=([a-f0-9]+)/.exec(header)?.[1]
    if (!ts || !h1 || !raw) return res.status(400).send('bad signature header')

    const expected = crypto.createHmac('sha256', PADDLE_WEBHOOK_SECRET.value())
      .update(`${ts}:${raw.toString('utf8')}`).digest('hex')
    // timingSafeEqual, not ===. A plain comparison leaks the signature one byte
    // at a time to anyone willing to measure.
    const a = Buffer.from(h1, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send('bad signature')
    }
    // Replay guard: a captured webhook must not be re-postable forever.
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.status(400).send('stale')

    const evt = JSON.parse(raw.toString('utf8'))
    const d = evt?.data || {}
    const uid = d?.custom_data?.uid
    if (!uid) return res.status(200).send('no uid')   // 200: do not make Paddle retry forever

    const active = ['subscription.created', 'subscription.updated', 'subscription.activated'].includes(evt.event_type)
      && ['active', 'trialing', 'past_due'].includes(d.status)

    await db.collection('accounts').doc(uid).set({
      plan: active ? 'pro' : 'free',
      status: d.status || 'canceled',
      provider: 'paddle',
      subscriptionId: d.id || null,
      currentPeriodEnd: d?.current_billing_period?.ends_at
        ? Date.parse(d.current_billing_period.ends_at) : 0,
      updatedAt: Date.now(),
    }, { merge: true })

    return res.status(200).send('ok')
  },
)

/* ── Razorpay webhook ────────────────────────────────────────────────────── */

exports.razorpayWebhook = onRequest(
  { secrets: [RAZORPAY_WEBHOOK_SECRET], region: 'asia-south1' },
  async (req, res) => {
    const raw = req.rawBody
    const sig = String(req.headers['x-razorpay-signature'] || '')
    if (!raw || !sig) return res.status(400).send('bad signature header')

    const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET.value())
      .update(raw).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send('bad signature')
    }

    const evt = JSON.parse(raw.toString('utf8'))
    const sub = evt?.payload?.subscription?.entity
    const uid = sub?.notes?.uid
    if (!uid) return res.status(200).send('no uid')

    // `halted` is the one that matters and the one people forget: an e-mandate
    // debit that keeps failing halts the subscription rather than cancelling
    // it, so treating only `cancelled` as the end means a user who stopped
    // paying months ago still holds a licence.
    const ACTIVE = ['subscription.charged', 'subscription.activated', 'subscription.authenticated', 'subscription.resumed']
    const active = ACTIVE.includes(evt.event) && ['active', 'authenticated'].includes(sub.status)

    await db.collection('accounts').doc(uid).set({
      plan: active ? 'pro' : 'free',
      status: sub.status || 'cancelled',
      provider: 'razorpay',
      subscriptionId: sub.id || null,
      // Razorpay timestamps are SECONDS. Storing them as milliseconds puts the
      // period end in 1970 and locks every Indian customer out instantly.
      currentPeriodEnd: sub.current_end ? Number(sub.current_end) * 1000 : 0,
      updatedAt: Date.now(),
    }, { merge: true })

    return res.status(200).send('ok')
  },
)
