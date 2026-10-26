import React, { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Lock, ExternalLink, Sparkles, LogIn } from 'lucide-react'
import { Modal } from './Modal'
import {
  PLANS, CAPABILITY_COPY, suggestedRegion, openCheckout, pollForUpgrade,
  entitlement, refreshEntitlement, getPaddleCustomerId,
} from '../entitlement'

/**
 * The upgrade screen.
 *
 * Two things it deliberately does NOT do:
 *
 *  1. It does not host a card form. Checkout opens in the user's real browser
 *     (shell.openExternal). A payment form inside a webview the app controls is
 *     both a PCI problem and a phishing shape, and the providers' 3-D Secure and
 *     UPI Autopay flows expect a real browser anyway.
 *
 *  2. It does not decide the user's country from their IP and enforce it. Both
 *     price tables are always reachable; the tab defaults to a guess from the
 *     timezone, and the PAYMENT METHOD is what actually determines which one
 *     applies. IP is one VPN away — the instrument is not.
 */
export default function UpgradeModal({ open, onClose, idToken, uid, onUnlocked, onSignIn }) {
  const [region, setRegion] = useState(() => suggestedRegion())
  const [cycle, setCycle] = useState('yearly')   // annual leads: see the fee note in entitlement.js
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [err, setErr] = useState(null)

  const ent = entitlement()
  const plan = PLANS[region]
  const sku = plan[cycle]

  // Stop polling when the modal closes, or a background timer keeps firing
  // refresh calls at a screen nobody is looking at.
  useEffect(() => {
    if (open) return undefined
    setWaiting(false)
    setErr(null)
    return undefined
  }, [open])

  const checkoutBase = useMemo(() => {
    // The hosted checkout page carries the SKU and the account. Entitlement is
    // granted by the provider's WEBHOOK, never by the redirect that follows —
    // a redirect is a browser navigation and can be forged.
    const base = import.meta.env.VITE_CHECKOUT_BASE || 'https://yogatik.web.app/checkout'
    const q = new URLSearchParams({ plan: sku.id, provider: plan.provider, uid: uid || '' })
    return `${base}?${q}`
  }, [sku.id, plan.provider, uid])

  const buy = async () => {
    setBusy(true); setErr(null)

    // Email is prefilled for BOTH providers — Paddle's checkout asks for one
    // too, and there is no reason an international customer should retype
    // an address Yogatik already has from sign-in. Best-effort: a failure to
    // read it must never block checkout, only leave the field blank.
    let userEmail = ''
    try {
      const { auth } = await import('../firebaseAuth')
      userEmail = auth?.currentUser?.email || ''
    } catch { /* checkout still works with an unprefilled email field */ }

    // Razorpay subscriptions must be created server-side (that is where
    // notes.uid is attached from a VERIFIED token — the webhook has no other
    // way to know whose account to upgrade), and the checkout page has no
    // Firebase session of its own. So it needs the ID token.
    //
    // In the FRAGMENT, not the query string: a fragment is never sent to the
    // server, so it stays out of access logs and out of the Referer header on
    // any request the page makes afterwards.
    let url = checkoutBase
    if (plan.provider === 'razorpay') {
      try {
        const { getIdToken } = await import('../firebaseAuth')
        const t = await getIdToken()
        if (!t) {
          setBusy(false)
          setErr('Sign in first — the payment has to be attached to your account.')
          return
        }
        // Only email is prefilled — the mobile number is left for the user to
        // type directly into Razorpay's own checkout, since that is the
        // number tied to the UPI Autopay mandate and Yogatik has no verified
        // number of its own to hand over on their behalf.
        const fragParams = new URLSearchParams({ t })
        if (userEmail) fragParams.set('email', userEmail)
        url += `#${fragParams.toString()}`
      } catch {
        setBusy(false)
        setErr('Could not verify your sign-in. Try signing out and back in.')
        return
      }
    } else {
      // Paddle needs no server-side step before opening checkout (no idToken
      // travels with it), so both ride the query string here — neither is
      // any more sensitive than the uid checkoutBase already carries there.
      const extra = {}
      if (userEmail) extra.email = userEmail
      // Best-effort, same as userEmail above: a first-time buyer or a read
      // failure both just mean no id rides along, never a blocked checkout.
      const customerId = await getPaddleCustomerId(uid).catch(() => null)
      if (customerId) extra.customerId = customerId
      if (Object.keys(extra).length) url += `&${new URLSearchParams(extra)}`
    }

    const res = await openCheckout(url)
    setBusy(false)
    if (!res?.success) { setErr(res?.error || 'Could not open the checkout page.'); return }
    // The purchase completes in another window. Poll until the webhook lands
    // rather than asking the user to restart the app.
    setWaiting(true)
    pollForUpgrade({
      idToken,
      uid,
      onUnlocked: (st) => { setWaiting(false); onUnlocked?.(st); onClose?.() },
    })
  }

  if (!open) return null

  return (
    <Modal onClose={onClose} title="Support Yogatik Development" icon={<Sparkles size={16} />} className="upgrade-modal">
      <div className="up-wrap">
        <div className="up-banner" style={{ background: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }}>
          <Sparkles size={14} />
          <strong>Yogatik Pro is 100% Free with Zero Restrictions!</strong>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-secondary, #aaa)', lineHeight: 1.5, margin: '8px 0 16px' }}>
          All Pro capabilities are unlocked on both Web and Desktop with zero paywalls. If you enjoy using Yogatik, consider making a voluntary charity donation to support ongoing development, maintenance, and server costs.
        </p>

        <ul className="up-caps">
          {Object.entries(CAPABILITY_COPY).map(([k, text]) => (
            <li key={k}><Check size={13} /> {text} (Unlocked)</li>
          ))}
        </ul>

        <div className="up-tabs" role="tablist" aria-label="Donation region">
          {Object.entries(PLANS).map(([key, p]) => (
            <button
              key={key}
              role="tab"
              aria-selected={region === key}
              className={`up-tab ${region === key ? 'active' : ''}`}
              onClick={() => setRegion(key)}
            >{p.region}</button>
          ))}
        </div>

        <div className="up-plans">
          {['yearly', 'monthly'].map(c => (
            <button
              key={c}
              className={`up-plan ${cycle === c ? 'active' : ''}`}
              onClick={() => setCycle(c)}
              aria-pressed={cycle === c}
            >
              <span className="up-price">{plan[c].label}</span>
              <span className="up-per">per {plan[c].per}</span>
              {plan[c].saveLabel && <span className="up-save">{plan[c].saveLabel}</span>}
            </button>
          ))}
        </div>

        <p className="up-note">{plan.note}</p>

        {err && <div className="ws-notice error">{err}</div>}

        {waiting ? (
          <div className="up-waiting">
            <Loader2 size={16} className="ws-spin" />
            <div>
              <strong>Complete contribution in your browser.</strong>
              <span>Thank you for supporting open AI development!</span>
            </div>
            <button className="ws-ghost-btn sm" onClick={() => refreshEntitlement({ idToken, uid })}>
              Check now
            </button>
          </div>
        ) : !uid ? (
          <button className="ws-primary-btn up-buy" onClick={() => onSignIn?.()}>
            <LogIn size={14} />
            Sign in to contribute
          </button>
        ) : (
          <button className="ws-primary-btn up-buy" disabled={busy} onClick={buy}>
            {busy ? <Loader2 size={14} className="ws-spin" /> : <ExternalLink size={14} />}
            Contribute {sku.label} / {sku.per}
          </button>
        )}

        <p className="up-fine">
          Voluntary developer support &amp; charity fund. All features remain 100% unlocked and unrestricted forever.
        </p>
      </div>
    </Modal>
  )
}

