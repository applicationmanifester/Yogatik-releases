import React from 'react'
import { Sparkles, ArrowRight, Check, ShieldCheck } from 'lucide-react'

/**
 * First-run onboarding — set expectations and seed personalization before turn 1.
 * Three quick steps: pick a persona, choose interaction style + relationship
 * boundary, and see a plain privacy summary. The choices seed procedural memory
 * and set the boundary, so the very first reply already feels tailored.
 *
 * @param {{templates?: {id:string,name:string,description?:string}[],
 *          onComplete: (choices:{persona:string, style:string, boundary:string}) => void,
 *          onSkip: () => void}} props
 */
const STYLES = [
  { id: 'concise', label: 'Concise', hint: 'Short, to the point' },
  { id: 'balanced', label: 'Balanced', hint: 'A bit of both' },
  { id: 'detailed', label: 'Detailed', hint: 'Thorough explanations' },
]
const BOUNDARIES = [
  { id: 'assistant', label: 'A helpful assistant', hint: 'Task-focused, professional' },
  { id: 'companion', label: 'A friendly companion', hint: 'Warm, conversational' },
]

export default function OnboardingModal({ templates = [], onComplete, onSkip }) {
  const [step, setStep] = React.useState(0)
  const [persona, setPersona] = React.useState('default')
  const [style, setStyle] = React.useState('balanced')
  const [boundary, setBoundary] = React.useState('assistant')

  // The built-in Default is prepended, so drop any template that is also
  // called Default — otherwise the picker lists it twice.
  const personaOptions = [
    { id: 'default', name: 'Default', description: 'General-purpose' },
    ...templates.filter(t => String(t?.name || '').trim().toLowerCase() !== 'default').slice(0, 5),
  ]

  const finish = () => onComplete?.({ persona, style, boundary })

  return (
    <div className="palette-overlay" onClick={onSkip}>
      <div className="palette onboarding-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Welcome to Yogatik" style={{ width: 'min(560px, 96%)' }}>
        <div className="palette-input-bar" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <Sparkles size={18} style={{ color: 'var(--accent)' }} />
          <h3 style={{ margin: '0 0 0 10px', fontSize: 16, fontWeight: 600 }}>Welcome to Yogatik</h3>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>Step {step + 1} of 3</span>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 0 && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Pick a starting personality. You can change or create more anytime.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {personaOptions.map(t => (
                  <button key={t.id} className={`onb-option ${persona === t.id ? 'selected' : ''}`} onClick={() => setPersona(t.id)}>
                    <strong>{t.name}</strong>{t.description ? <span> — {t.description}</span> : null}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>How would you like Yogatik to talk with you?</p>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>Reply length</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {STYLES.map(s => (
                  <button key={s.id} className={`onb-pill ${style === s.id ? 'selected' : ''}`} onClick={() => setStyle(s.id)} title={s.hint}>{s.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8 }}>Relationship</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {BOUNDARIES.map(b => (
                  <button key={b.id} className={`onb-pill ${boundary === b.id ? 'selected' : ''}`} onClick={() => setBoundary(b.id)} title={b.hint}>{b.label}</button>
                ))}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Yogatik is a supportive tool — not a doctor, lawyer, or therapist. It will point you to professionals for those.</p>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} style={{ color: '#10b981' }} />
                <strong style={{ fontSize: 14 }}>Your data stays yours</strong>
              </div>
              <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li>Conversations and memory live on this device (IndexedDB).</li>
                <li>Cloud sync is optional and encrypted; emotional context never syncs.</li>
                <li>You can view, export, and delete everything from Settings → Your data.</li>
              </ul>
            </>
          )}
        </div>

        <div className="palette-footer" style={{ padding: '12px 20px', display: 'flex', gap: 8 }}>
          <button className="small-btn" onClick={onSkip} style={{ marginRight: 'auto' }}>Skip</button>
          {step > 0 && <button className="small-btn" onClick={() => setStep(step - 1)}>Back</button>}
          {step < 2 ? (
            <button className="small-btn primary" onClick={() => setStep(step + 1)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Next <ArrowRight size={12} />
            </button>
          ) : (
            <button className="small-btn primary" onClick={finish} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check size={12} /> Start
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
