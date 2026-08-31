import React, { useState } from 'react'
import { Sliders, Volume2, Play, Square, LayoutGrid, RotateCcw, Globe } from 'lucide-react'
import { Modal } from './Modal'
import { localeSnapshot } from '../locale'
import { FEATURES, resolveFeatures, FEATURE_DEFAULTS } from '../features'
import { McpServers } from './McpServers'
import { PluginsManager } from './PluginsManager'
import { VOICE_LABELS, DEFAULT_VOICE } from '../video/speech'
import { requestTTS, stopTTS } from '../api'

const GENDER = {
  female: ['af_heart', 'af_nova', 'bf_emma'],
  male: ['am_michael', 'am_puck', 'bm_george'],
}

const SAMPLE = 'Hello — this is how I will sound when I read your answers aloud.'

/**
 * The small stuff, in one place: which voice speaks, and which parts of the app
 * you actually want on screen. Switching a feature off unmounts it rather than
 * hiding it, so the UI genuinely gets simpler.
 */
/**
 * A short list, not every ISO country. The point is to correct a wrong
 * detection or ask for somewhere else — anything beyond this is served by
 * "detect automatically", which is right for almost everyone.
 */
const REGION_CHOICES = [
  ['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['IE', 'Ireland'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IN', 'India'], ['SG', 'Singapore'],
  ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'],
  ['SE', 'Sweden'], ['PL', 'Poland'], ['PT', 'Portugal'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['HK', 'Hong Kong'],
  ['AE', 'United Arab Emirates'], ['ZA', 'South Africa'], ['NG', 'Nigeria'], ['KE', 'Kenya'],
  ['BR', 'Brazil'], ['MX', 'Mexico'], ['AR', 'Argentina'],
]

export function PersonalisePanel({ prefs, onChange, onClose }) {
  const L = localeSnapshot()
  const features = resolveFeatures(prefs.features)
  const voice = prefs.live_voice_local || DEFAULT_VOICE
  const neural = prefs.live_voice_engine !== 'system'
  const rawRounds = Number(prefs.max_tool_rounds)
  const isUnlimited = !rawRounds || rawRounds >= 100 || rawRounds === 0
  const rounds = isUnlimited ? 100 : Math.max(5, Math.min(95, rawRounds))
  const [previewing, setPreviewing] = useState(false)

  const gender = GENDER.male.includes(voice) ? 'male' : 'female'
  // These two were READ BUT NEVER DECLARED — `speed.toFixed()` and
  // `browserSurface` are ReferenceErrors the moment this panel renders, which
  // takes the whole app into the error boundary exactly like `askInCall` did.
  // eslint's no-undef reports all three; the lesson is to run `npm run lint`,
  // not to keep finding them one crash at a time.
  const speed = Number(prefs.voice_speed ?? 1) || 1
  const browserSurface = prefs.browser_display_mode === 'panel' ? 'panel' : 'window'

  const setFeature = (name, on) => onChange('features', { ...features, [name]: on })

  const pickGender = (g) => {
    // Keep the position in the list when switching sides, so "the bright one"
    // stays the bright one.
    const i = Math.max(0, GENDER[gender].indexOf(voice))
    onChange('live_voice_local', GENDER[g][i] || GENDER[g][0])
  }

  const preview = async () => {
    if (previewing) { stopTTS(); setPreviewing(false); return }
    setPreviewing(true)
    try {
      await requestTTS(SAMPLE, { onEnd: () => setPreviewing(false) })
    } catch {
      setPreviewing(false)
    }
  }

  const resetFeatures = () => onChange('features', { ...FEATURE_DEFAULTS })

  return (
    <Modal title="Personalise" icon={<Sliders size={16} />} onClose={onClose}>
      <section className="personalise-group">
        <h4><Volume2 size={13} /> Voice</h4>
        <p className="personalise-hint">
          Used for calls, read-aloud and narrated video. Runs on your device — no key, and
          it works offline after the first download.
        </p>

        <div className="toggle-row">
          <label htmlFor="p-neural">Natural voice</label>
          <label className="toggle" aria-label="Toggle the natural on-device voice">
            <input
              id="p-neural" type="checkbox" checked={neural}
              onChange={e => onChange('live_voice_engine', e.target.checked ? 'neural' : 'system')}
            />
            <span className="slider" />
          </label>
        </div>

        {neural && (
          <>
            <div className="segmented" role="radiogroup" aria-label="Voice gender">
              {['female', 'male'].map(g => (
                <button
                  key={g}
                  role="radio"
                  aria-checked={gender === g}
                  className={gender === g ? 'active' : ''}
                  onClick={() => pickGender(g)}
                >
                  {g === 'female' ? 'Female' : 'Male'}
                </button>
              ))}
            </div>

            <div className="toggle-row">
              <label htmlFor="p-voice">Character</label>
              <select
                id="p-voice" value={voice}
                onChange={e => onChange('live_voice_local', e.target.value)}
              >
                {GENDER[gender].map(id => (
                  <option key={id} value={id}>{VOICE_LABELS[id]}</option>
                ))}
              </select>
            </div>

            <div className="toggle-row">
              <label htmlFor="p-speed">Speed <span className="personalise-value">{speed.toFixed(2)}×</span></label>
              <input
                id="p-speed" type="range" min="0.7" max="1.3" step="0.05" value={speed}
                onChange={e => onChange('voice_speed', Number(e.target.value))}
              />
            </div>

            <button className="small-btn" onClick={preview}>
              {previewing ? <><Square size={12} /> Stop</> : <><Play size={12} /> Hear it</>}
            </button>
          </>
        )}
      </section>

      <section className="personalise-group">
        <h4><Sliders size={13} /> Tone &amp; Relationship Boundary</h4>
        <p className="personalise-hint">
          Tune how the companion or assistant communicates and connects with you.
        </p>

        <div className="toggle-row">
          <label htmlFor="p-boundary">Relationship role</label>
          <select
            id="p-boundary"
            className="style-select"
            value={prefs.companion_boundary || 'assistant'}
            onChange={e => onChange('companion_boundary', e.target.value)}
          >
            <option value="assistant">Helpful Assistant (Task-focused &amp; direct)</option>
            <option value="companion">Friendly Companion (Warm &amp; conversational)</option>
            <option value="mentor">Strict Mentor (Challenging &amp; rigorous)</option>
          </select>
        </div>

        <div className="toggle-row">
          <label htmlFor="p-emotional">
            Emotional engagement <span className="personalise-value">{Math.round((prefs.emotional_engagement ?? 0.5) * 100)}%</span>
          </label>
          <input
            id="p-emotional" type="range" min="0" max="1" step="0.1"
            value={prefs.emotional_engagement ?? 0.5}
            onChange={e => onChange('emotional_engagement', Number(e.target.value))}
          />
        </div>

        <div className="toggle-row">
          <label htmlFor="p-formality">
            Formality level <span className="personalise-value">{Math.round((prefs.formality_level ?? 0.5) * 100)}%</span>
          </label>
          <input
            id="p-formality" type="range" min="0" max="1" step="0.1"
            value={prefs.formality_level ?? 0.5}
            onChange={e => onChange('formality_level', Number(e.target.value))}
          />
        </div>
      </section>

      <section className="personalise-group">
        <h4><Sliders size={13} /> Answer depth</h4>
        <p className="personalise-hint">
          How many tool/refinement rounds the assistant may take before answering.
          Set to Unlimited so the agent executes continuously without stopping.
        </p>
        <div className="toggle-row">
          <label htmlFor="p-rounds">
            Max rounds <span className="personalise-value">{isUnlimited ? 'Unlimited (∞)' : rounds}</span>
          </label>
          <input
            id="p-rounds" type="range" min="5" max="100" step="5" value={rounds}
            onChange={e => {
              const val = Number(e.target.value)
              onChange('max_tool_rounds', val >= 100 ? 0 : val)
            }}
          />
        </div>
      </section>

      <section className="personalise-group">
        <h4><Sliders size={13} /> Browser surface</h4>
        <p className="personalise-hint">
          Where the assistant opens web pages it needs to actually use. A separate
          window gives it room; docked keeps it beside the conversation.
          Desktop app only.
        </p>
        <div className="toggle-row">
          <label htmlFor="p-browser-surface">Show the browser in</label>
          <select
            id="p-browser-surface"
            className="style-select"
            value={browserSurface}
            onChange={e => onChange('browser_display_mode', e.target.value)}
          >
            <option value="window">A separate window</option>
            <option value="panel">A panel in the app</option>
          </select>
        </div>
      </section>

      <section className="personalise-group">
        <h4><Globe size={13} /> Region &amp; units</h4>
        <p className="personalise-hint">
          Detected from this device: <strong>{L.regionLabel || 'unknown region'}</strong> ·
          {' '}{L.language} · {L.measurement} · {L.hourCycle === 'h12' ? '12-hour' : '24-hour'}
          {L.timeZone ? ` · ${L.timeZone}` : ''}.
          This is what the assistant is told, and it decides which units, currency,
          laws and helplines it assumes. Override it if the detection is wrong or
          you want answers for somewhere else.
        </p>
        <div className="toggle-row">
          <label htmlFor="p-region">Answer for</label>
          <select
            id="p-region"
            className="style-select"
            value={prefs.region_override || 'auto'}
            onChange={e => onChange('region_override', e.target.value)}
          >
            <option value="auto">Detect automatically{L.regionLabel ? ` (${L.regionLabel})` : ''}</option>
            {REGION_CHOICES.map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>
        <div className="toggle-row">
          <label htmlFor="p-units">Units</label>
          <select
            id="p-units"
            className="style-select"
            value={prefs.units_override || 'auto'}
            onChange={e => onChange('units_override', e.target.value)}
          >
            <option value="auto">Follow the region ({L.measurement})</option>
            <option value="metric">Metric (°C, km)</option>
            <option value="imperial">Imperial (°F, miles)</option>
          </select>
        </div>
        <div className="toggle-row">
          <label htmlFor="p-clock">Clock</label>
          <select
            id="p-clock"
            className="style-select"
            value={prefs.hour_cycle_override || 'auto'}
            onChange={e => onChange('hour_cycle_override', e.target.value)}
          >
            <option value="auto">Follow the locale ({L.hourCycle === 'h12' ? '12-hour' : '24-hour'})</option>
            <option value="12">12-hour</option>
            <option value="24">24-hour</option>
          </select>
        </div>
      </section>

      <section className="personalise-group">
        <h4><Sliders size={13} /> Accessibility &amp; Display</h4>
        <p className="personalise-hint">
          WCAG 2.1 AA compliant adjustments to enhance legibility and reduce cognitive strain.
        </p>

        <div className="toggle-row">
          <label htmlFor="p-high-contrast">High contrast mode</label>
          <label className="toggle" aria-label="Toggle high contrast mode">
            <input
              id="p-high-contrast"
              type="checkbox"
              checked={prefs.high_contrast === true}
              onChange={e => onChange('high_contrast', e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="toggle-row">
          <label htmlFor="p-simple-mode">Simplified interface mode
            <span className="personalise-sub">Hides dense technical metadata and badges</span>
          </label>
          <label className="toggle" aria-label="Toggle simplified interface mode">
            <input
              id="p-simple-mode"
              type="checkbox"
              checked={prefs.simple_mode === true}
              onChange={e => onChange('simple_mode', e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="toggle-row">
          <label htmlFor="p-reduce-motion">Reduced motion
            <span className="personalise-sub">Minimizes smooth animations &amp; transitions</span>
          </label>
          <label className="toggle" aria-label="Toggle reduced motion">
            <input
              id="p-reduce-motion"
              type="checkbox"
              checked={prefs.reduce_motion === true}
              onChange={e => onChange('reduce_motion', e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>
      </section>

      <section className="personalise-group">
        <h4><LayoutGrid size={13} /> What you see</h4>
        <p className="personalise-hint">
          Turn off anything you do not use. It disappears from the interface entirely.
        </p>

        {Object.entries(FEATURES).map(([name, meta]) => (
          <div className="toggle-row" key={name}>
            <label htmlFor={`p-${name}`} title={meta.hint}>
              {meta.label}
              <span className="personalise-sub">{meta.hint}</span>
            </label>
            <label className="toggle" aria-label={`Toggle ${meta.label}`}>
              <input
                id={`p-${name}`} type="checkbox" checked={features[name] !== false}
                onChange={e => setFeature(name, e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        ))}

        <button className="small-btn" onClick={resetFeatures}>
          <RotateCcw size={12} /> Reset to defaults
        </button>
      </section>

      <McpServers />
      <PluginsManager />
    </Modal>
  )
}
