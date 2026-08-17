import React, { useState } from 'react'
import { Sliders, Volume2, Play, Square, LayoutGrid, RotateCcw } from 'lucide-react'
import { Modal } from './Modal'
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
export function PersonalisePanel({ prefs, onChange, onClose }) {
  const features = resolveFeatures(prefs.features)
  const voice = prefs.live_voice_local || DEFAULT_VOICE
  const neural = prefs.live_voice_engine !== 'system'
  const speed = prefs.voice_speed ?? 1
  const rounds = Math.max(3, Math.min(20, Number(prefs.max_tool_rounds) || 8))
  const [previewing, setPreviewing] = useState(false)

  const gender = GENDER.male.includes(voice) ? 'male' : 'female'

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
        <h4><Sliders size={13} /> Answer depth</h4>
        <p className="personalise-hint">
          How many tool/refinement rounds the assistant may take before it must
          answer. Higher digs deeper on complex tasks but is slower.
        </p>
        <div className="toggle-row">
          <label htmlFor="p-rounds">
            Max rounds <span className="personalise-value">{rounds}</span>
          </label>
          <input
            id="p-rounds" type="range" min="3" max="20" step="1" value={rounds}
            onChange={e => onChange('max_tool_rounds', Number(e.target.value))}
          />
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
