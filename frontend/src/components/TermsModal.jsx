import React, { useState, useRef } from 'react'
import { FileText } from 'lucide-react'
import { Modal } from './Modal'

/** Bump when the terms change materially — users are asked to accept again. */
export const TERMS_VERSION = '1.0'
export const TERMS_UPDATED = '7 August 2026'
export const CONTACT_EMAIL = 'applicationmanifester@gmail.com'

/**
 * Shown before sign-in. Acceptance is required to continue, and the Accept
 * button stays disabled until the user has both scrolled the terms and ticked
 * the box — so "I agree" means something.
 */
export function TermsModal({ onAccept, onDecline }) {
  const [checked, setChecked] = useState(false)
  const [readToEnd, setReadToEnd] = useState(false)
  const bodyRef = useRef(null)

  const onScroll = () => {
    const el = bodyRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) setReadToEnd(true)
  }

  return (
    <Modal title="Terms of use" icon={<FileText size={18} />} onClose={onDecline} labelledBy="terms-title"
      footer={
        <div className="terms-footer">
          <label className="terms-check">
            <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
            <span>I have read and agree to the Terms of Use and Privacy Notice.</span>
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onDecline}>Decline</button>
            <button className="btn-primary" onClick={() => onAccept(TERMS_VERSION)}
              disabled={!checked || !readToEnd}
              title={!readToEnd ? 'Please scroll through the terms first' : undefined}>
              Accept and continue
            </button>
          </div>
          {!readToEnd && <span className="terms-hint">Scroll to the end to enable Accept.</span>}
        </div>
      }>
      <div className="terms-body" ref={bodyRef} onScroll={onScroll}>
        <p className="terms-meta">Version {TERMS_VERSION} · Last updated {TERMS_UPDATED}</p>

        <h4>1. What Yogatik is</h4>
        <p>
          Yogatik ("the App") is a free, browser-based interface to third-party artificial
          intelligence providers. It is provided by an independent developer, not a company.
          The App runs entirely in your web browser and does not operate an account system or
          a server that stores your conversations.
        </p>

        <h4>2. Accepting these terms</h4>
        <p>
          By ticking the box and continuing, you agree to these Terms of Use. If you do not
          agree, do not use the App. You must be at least 13 years old, or the minimum age of
          digital consent in your country, whichever is higher. If you are under 18, you
          confirm a parent or guardian has agreed to these terms on your behalf.
        </p>

        <h4>3. You bring your own API key</h4>
        <p>
          The App does not supply model access. You must obtain your own API key from a
          provider such as Groq, NVIDIA, Google, OpenRouter or OpenAI. Your use of those
          services is governed by <em>their</em> terms and privacy policies, not these. You are
          solely responsible for any charges, quota limits, or account actions taken by those
          providers, and for keeping your key confidential.
        </p>

        <h4>4. Your data</h4>
        <p>
          Conversations, uploaded documents, settings and API keys are stored locally in your
          browser (IndexedDB) on your own device. The developer does not receive, collect or
          store them.
        </p>
        <p>Two exceptions, both under your control:</p>
        <ul>
          <li>
            <strong>Message delivery.</strong> The text you send is transmitted to the AI provider
            you selected so it can generate a reply. For providers that cannot be called directly
            from a browser, requests pass through a proxy operated by the developer. That proxy
            forwards requests and does not intentionally store their contents; standard,
            short-lived infrastructure logs may exist at the hosting provider.
          </li>
          <li>
            <strong>Optional cloud sync.</strong> If you sign in and explicitly enable key sync,
            your API keys are encrypted in your browser with a passphrase only you know and stored
            in encrypted form. The passphrase is never transmitted or stored, and without it the
            data cannot be decrypted by anyone, including the developer.
          </li>
        </ul>
        <p>
          Signing in with Google shares your name, email address and profile picture with the
          App's Firebase project solely to identify your key vault. Clearing your browser data
          erases your local content permanently — use the Export backup feature to keep a copy.
        </p>

        <h4>5. AI output is not reliable</h4>
        <p>
          AI models generate text by prediction. Responses may be <strong>inaccurate, incomplete,
          outdated, biased or entirely fabricated</strong>, including citations, quotations,
          figures, code and links that look authoritative but are wrong.
        </p>
        <p>
          <strong>Always verify anything that matters before relying on it.</strong> Output from
          the App is not professional advice. Do not rely on it for medical, legal, financial,
          tax, safety-critical, or employment decisions. Consult a qualified professional
          instead. You are responsible for reviewing and testing any code, and for checking any
          web sources it cites.
        </p>

        <h4>6. Acceptable use</h4>
        <p>You agree not to use the App to:</p>
        <ul>
          <li>break any law, or infringe anyone's intellectual property or privacy rights;</li>
          <li>generate content that sexualises minors, incites violence, or harasses people;</li>
          <li>create malware, conduct attacks, or attempt to breach any system;</li>
          <li>produce deceptive content presented as human-made where that misleads or harms;</li>
          <li>upload documents you do not have the right to process;</li>
          <li>abuse, overload or circumvent the proxy, or use it for traffic unrelated to the App.</li>
        </ul>
        <p>
          The App's tools can fetch public web pages and run code in your browser sandbox. You are
          responsible for what you ask it to fetch or execute.
        </p>

        <h4>7. Availability</h4>
        <p>
          The App is a personal project offered free of charge. There is no uptime commitment or
          support obligation. Features may change, break, or be withdrawn at any time, and access
          to the proxy may be limited or discontinued without notice. Third-party providers may
          also retire models or change pricing without warning.
        </p>

        <h4>8. No warranty</h4>
        <p>
          THE APP IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
          IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, AND
          NON-INFRINGEMENT.
        </p>

        <h4>9. Limitation of liability</h4>
        <p>
          To the maximum extent permitted by law, the developer is not liable for any indirect,
          incidental, special or consequential damages, nor for lost data, lost profits, provider
          charges you incur, or decisions made in reliance on AI output. Nothing here excludes
          liability that cannot lawfully be excluded.
        </p>

        <h4>10. Content ownership</h4>
        <p>
          You keep whatever rights you have in what you enter. Rights in AI-generated output are
          governed by your provider's terms; the developer claims no ownership over it. Be aware
          that AI output may resemble existing material and is not guaranteed to be original or
          free of third-party rights.
        </p>

        <h4>11. Changes and termination</h4>
        <p>
          These terms may be updated; material changes will require acceptance again. You may stop
          using the App at any time, and delete everything by clearing your browser data for this
          site.
        </p>

        <h4>12. Contact</h4>
        <p>
          Questions, corrections, bug reports or privacy requests:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p className="terms-end">— end of terms —</p>
      </div>
    </Modal>
  )
}
