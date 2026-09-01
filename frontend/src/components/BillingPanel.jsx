import React, { useState, useEffect, useCallback } from 'react'
import { DollarSign, X, ExternalLink, RefreshCw, Loader2, AlertTriangle, Check, LogIn } from 'lucide-react'
import { loadBillingHistory, describeEvent, openReceipt } from '../billing'

/**
 * Billing history — "similar to Claude's own billing page": current plan at
 * the top, a chronological list of every charge/failure/cancellation below,
 * each linking out to the provider's own hosted receipt when one exists.
 *
 * This is READ-ONLY history, not a payment form, so unlike UpgradeModal's
 * checkout it renders the same way in the desktop app's own window as on
 * the web — no card entry happens here, so there is nothing that needs a
 * real external browser. "View receipt" still opens externally (via
 * billing.js's openReceipt), matching the app-wide rule that a provider's
 * own page is never framed inside Yogatik.
 *
 * Shell is .yg-panel-*, NOT .palette — that family is the Ctrl+K command
 * palette's own hardcoded-dark identity, and mixing it with theme-aware
 * content (var(--text-primary), which goes near-black in light mode) is
 * what made the title bar unreadable in light theme. See styles.css for
 * the fuller note.
 *
 * See functions/billingEvents.js and frontend/src/billing.js for the scope
 * decision: this reads what Razorpay/Paddle already generate and already
 * email to the customer. It does not generate a second invoice.
 */

const PLAN_LABEL = { pro: 'Yogatik Pro', trial: 'Trial', free: 'Free' }
const PLAN_ACCENT = { pro: '#10b981', trial: '#f59e0b', free: 'var(--text-muted)' }

function formatDate(ts) {
  if (!ts) return null
  try {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return null }
}

export default function BillingPanel({ onClose, onUpgrade }) {
  const [state, setState] = useState({ loading: true, account: null, events: [], error: null })

  const load = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    loadBillingHistory().then(res => setState({ loading: false, ...res }))
  }, [])

  useEffect(() => { load() }, [load])

  const { loading, account, events, error } = state
  const planKey = account?.plan || 'free'

  return (
    <div className="yg-panel-overlay" onClick={onClose}>
      <div
        className="yg-panel billing-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Billing"
        style={{ width: 'min(560px, 96%)', maxHeight: '82vh' }}
      >
        <div className="yg-panel-header">
          <DollarSign size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <h3>Billing</h3>
          <button type="button" className="yg-panel-icon-btn" onClick={load} title="Refresh" aria-label="Refresh" disabled={loading}>
            <RefreshCw size={14} className={loading ? 'ws-spin' : ''} />
          </button>
          <button type="button" className="yg-panel-icon-btn" onClick={onClose} title="Close" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="ws-spin" style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>Loading billing history…</div>
          </div>
        ) : error === 'signed-out' ? (
          <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <LogIn size={20} style={{ marginBottom: 8 }} />
            <div style={{ fontSize: 13 }}>Sign in to see your billing history.</div>
          </div>
        ) : (
          <>
            {/* Current plan */}
            <div style={{
              margin: '14px 18px 0', borderRadius: 10,
              background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
              borderLeft: `3px solid ${PLAN_ACCENT[planKey] || 'var(--text-muted)'}`,
              padding: '12px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              {account ? (
                <>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {PLAN_LABEL[planKey] || planKey}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {planKey === 'pro' && account.currentPeriodEnd
                        ? `Renews ${formatDate(account.currentPeriodEnd)}`
                        : planKey === 'trial' && account.trialEndsAt
                          ? `Trial ends ${formatDate(account.trialEndsAt)}`
                          : 'No active subscription'}
                      {account.provider && ` · billed by ${account.provider === 'razorpay' ? 'Razorpay' : 'Paddle'}`}
                    </div>
                  </div>
                  {planKey !== 'pro' && onUpgrade && (
                    <button className="ws-primary-btn sm" onClick={onUpgrade}>Upgrade</button>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    No account on file yet — you're on the free tier.
                  </div>
                  {onUpgrade && <button className="ws-ghost-btn sm" onClick={onUpgrade}>Upgrade</button>}
                </>
              )}
            </div>

            {error && error !== 'signed-out' && (
              <div style={{
                margin: '10px 18px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12,
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                Could not load billing history right now ({error}). Your subscription is unaffected — try refreshing.
              </div>
            )}

            {/* History */}
            <div className="yg-panel-body">
              {events.length === 0 && !error ? (
                <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-muted)' }}>
                  <Check size={20} style={{ marginBottom: 6, opacity: 0.6 }} />
                  <div style={{ fontSize: 12.5 }}>No billing history yet.</div>
                </div>
              ) : (
                events.map(ev => {
                  const d = describeEvent(ev)
                  return (
                    <div
                      key={ev.id}
                      className="yg-panel-card"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: d.tone === 'ok' ? 'rgba(16,185,129,0.15)' : d.tone === 'err' ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)',
                            color: d.tone === 'ok' ? '#10b981' : d.tone === 'err' ? '#ef4444' : 'var(--text-secondary)',
                          }}>
                            {d.label}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{d.provider}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>
                          {formatDate(ev.occurredAt) || '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{d.amountText}</strong>
                        {d.hasReceipt ? (
                          <button
                            type="button"
                            className="error-copy-btn"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                            onClick={() => openReceipt(ev.receiptUrl)}
                            title="Open the receipt on the provider's own page"
                          >
                            <ExternalLink size={11} /> Receipt
                          </button>
                        ) : (
                          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }} title="This charge shipped its own receipt by email; Yogatik was not given a link to it.">
                            no link
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </>
        )}

        <div className="yg-panel-footer">
          <span>Receipts are emailed by the payment provider directly — this list mirrors what they sent.</span>
          <button className="small-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
