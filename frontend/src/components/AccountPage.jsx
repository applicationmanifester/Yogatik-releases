import React from 'react'
import { User, LogIn, LogOut, Sparkles, ShieldCheck, Monitor, Globe, CreditCard, ArrowRight } from 'lucide-react'

const PLAN_COPY = {
  pro: { label: 'Yogatik Pro', tone: 'pro' },
  trial: { label: 'Free trial', tone: 'trial' },
  locked: { label: 'Trial ended', tone: 'locked' },
  free: { label: 'Free', tone: 'free' },
  anonymous: { label: 'Free', tone: 'free' },
}

// `locked` used to show "Trial ended" for EVERY lock reason — including a
// refresh that never reached the licence server, a signature it couldn't
// verify, or a token issued to a different account. Those read to the user
// exactly like "you paid nothing and your 30 days are up", which is the one
// explanation that is usually wrong when the account is actually Pro on
// another surface. Name the real reason instead of guessing at it.
const LOCKED_REASON_COPY = {
  'trial-ended': 'Your 30-day trial has ended.',
  'expired': 'Your subscription period has ended and the last renewal check did not go through.',
  'no-license': "This device hasn't received a licence from your account yet — try Sync Now, or sign out and back in.",
  'wrong-account': 'The licence on this device belongs to a different account than the one signed in.',
  'clock-rollback': "This device's clock looks like it moved backwards — the licence check refuses to trust that.",
  'awaiting-renewal': 'Your renewal is still processing — this should clear on its own shortly.',
}
function lockedDetail(ent) {
  return LOCKED_REASON_COPY[ent?.reason] ||
    "This device couldn't confirm your subscription — sign out and back in, or contact support if this account is Pro elsewhere."
}

/**
 * Account didn't have a page of its own — sign-in state, the plan you're on,
 * and which surface (web/desktop) you're looking at were each readable from
 * a different corner of the app (sidebar footer, a trial chip in the header,
 * a banner buried inside Billing) but never gathered in one place, the way
 * every other app's own "Account" tab does. This is that page: read-only
 * except for sign-in/out and a way into Billing — it deliberately does not
 * duplicate the plan-switching UI that already lives there.
 */
export function AccountPage({ user, ent, isDesktopBuild, isPersonal, onSignIn, onSignOut, onManageBilling, onUpgrade }) {
  const plan = PLAN_COPY[ent?.state] || PLAN_COPY.free
  const isPro = ent?.state === 'pro'
  const isTrial = ent?.state === 'trial'
  const isLocked = ent?.state === 'locked'

  return (
    <div className="dash-page-pad account-page">
      <section className="account-card">
        <div className="account-card-head">
          <h3><User size={14} /> Identity</h3>
        </div>
        {user ? (
          <div className="account-identity">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="account-avatar" />
            ) : (
              <div className="account-avatar account-avatar-fallback"><User size={20} /></div>
            )}
            <div className="account-identity-text">
              <strong>{user.displayName || 'Signed in'}</strong>
              <span>{user.email}</span>
            </div>
            <button className="ws-ghost-btn sm" onClick={onSignOut}>
              <LogOut size={13} /> Sign out
            </button>
          </div>
        ) : (
          <div className="account-signed-out">
            <p>
              You're not signed in. Yogatik works fully signed out — everything stays on this
              device — but signing in syncs your API keys across devices and is how a Pro
              subscription attaches to your account rather than just this browser.
            </p>
            <button className="ws-primary-btn sm" onClick={onSignIn}>
              <LogIn size={13} /> Sign in with Google
            </button>
          </div>
        )}
      </section>

      <section className="account-card">
        <div className="account-card-head">
          <h3><Sparkles size={14} /> Plan</h3>
          <span className={`account-plan-badge tone-${plan.tone}`}>{plan.label}</span>
        </div>
        <p className="account-plan-detail">
          {isPro && 'Full access on web and desktop — file, shell, browser and screen tools unlocked, no ads.'}
          {isTrial && `${ent.daysLeft} ${ent.daysLeft === 1 ? 'day' : 'days'} left in your trial. Chat and every browser-based tool work regardless of what happens after.`}
          {isLocked && `${lockedDetail(ent)} Chat and every browser-based tool still work — file, shell, browser and screen tools are locked until this is resolved.`}
          {!isPro && !isTrial && !isLocked && (ent?.surface === 'web'
            ? 'Free, ad-supported. Upgrading removes ads here and unlocks the full desktop app on this account.'
            : 'Free tier.')}
        </p>
        <div className="account-plan-actions">
          <button className="ws-ghost-btn sm" onClick={onManageBilling}>
            <CreditCard size={13} /> Billing &amp; invoices <ArrowRight size={12} />
          </button>
          {!isPro && (
            <button className="ws-primary-btn sm" onClick={onUpgrade}>
              {isLocked ? 'Upgrade' : 'Go Pro'}
            </button>
          )}
        </div>
      </section>

      <section className="account-card">
        <div className="account-card-head">
          <h3><ShieldCheck size={14} /> This device</h3>
        </div>
        <div className="account-device-row">
          <span className="account-device-chip">
            {isDesktopBuild ? <Monitor size={12} /> : <Globe size={12} />}
            {isDesktopBuild ? 'Desktop app' : 'Web app'}
          </span>
          {isPersonal && <span className="account-device-chip">Personal build — no licence check</span>}
        </div>
        <p className="account-plan-detail">
          One subscription covers both surfaces on the same signed-in account. Conversations,
          documents and settings stay local to this device either way — see the{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">privacy notice</a>.
        </p>
      </section>
    </div>
  )
}

export default AccountPage
