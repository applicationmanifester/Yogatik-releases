import React from 'react'
import { Volume2, Eye, Captions, Gauge, Sparkles, AlertTriangle, X, Mic } from 'lucide-react'
import { VOICE_LABELS } from '../video/speech'
import { looksVisionCapable } from '../vision/capability'

// Mirrors PersonalisePanel's list. Kept local rather than imported from a
// component: a shared constant that lives in a React file drags the whole
// panel into this chunk for the sake of six strings.
const GENDER = {
  female: ['af_heart', 'af_nova', 'af_alloy', 'af_aoede', 'af_jessica', 'af_kore', 'af_nicole', 'af_river', 'bf_emma', 'bf_lily'],
  male: ['am_michael', 'am_puck', 'am_echo', 'am_fenrir', 'am_liam', 'am_onyx', 'am_santa', 'bm_george', 'bm_lewis'],
}

/**
 * In-call settings: voice, what the model can see, captions, speech rate.
 *
 * These all existed as preferences but only in the Personalise panel, which is
 * in the main app — you had to END THE CALL to change the voice. Everything
 * here applies to the live session immediately.
 *
 * The vision block is the important one. "Watching (on-device)" is an accurate
 * badge and a useless explanation: it does not tell you that your chat model is
 * text-only, that the frames are being read by OCR instead, or that picking a
 * different model is the fix. That confusion is what produces "why can't the AI
 * see me" while the app cheerfully reports it is watching.
 */
export function LiveSettings({
  open, onClose,
  modelCanSee, provider, model, availableModels = [], onModelChange,
  visionMode, onVisionMode,
  voiceEngine, voice, onVoice, onVoiceEngine,
  rate = 1, onRate,
  captions = true, onCaptions,
  noiseSuppression = true, onNoiseSuppression,
}) {
  if (!open) return null

  const voices = [...GENDER.female, ...GENDER.male]

  return (
    <div className="live-settings-backdrop" onClick={onClose} role="presentation">
      <div className="live-settings-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Live settings">
        <div className="live-settings-header">
          <span>Live settings</span>
          <button className="live-settings-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* ── Vision ─────────────────────────────────────────────────────── */}
        <div className="live-settings-group">
          <div className="live-settings-group-title"><Eye size={13} /> What the model sees</div>

          {!modelCanSee && (
            <div className="live-settings-warn">
              <AlertTriangle size={14} />
              <div>
                <b>{model || provider} cannot see images.</b>
                <p>
                  Your camera is on, but this model is text-only — so frames are read on
                  your device by OCR and a small vision model, and only a description is
                  sent. That description is rough, especially in low light, which is why
                  it can answer with garbled text instead of what is actually in front of
                  you. Pick a vision-capable model below for it to genuinely see.
                </p>
              </div>
            </div>
          )}

          {availableModels.length > 0 && (() => {
            // Sort the ones that can actually see to the top and MARK them.
            // Listing forty model names and expecting someone to know which
            // are multimodal is the whole reason this panel exists — a picker
            // that does not answer the question it was opened for is just a
            // longer way of not knowing.
            const seeing = availableModels.filter(looksVisionCapable)
            const blind = availableModels.filter(m => !looksVisionCapable(m))
            return (
              <>
                <select
                  className="live-settings-select"
                  value={model || ''}
                  onChange={e => onModelChange?.(e.target.value)}
                  aria-label="Model"
                >
                  {seeing.length > 0 && (
                    <optgroup label="Can see images">
                      {seeing.map(m => <option key={m} value={m}>👁 {m}</option>)}
                    </optgroup>
                  )}
                  {blind.length > 0 && (
                    <optgroup label="Text only">
                      {blind.map(m => <option key={m} value={m}>{m}</option>)}
                    </optgroup>
                  )}
                </select>
                {seeing.length === 0 && (
                  <p className="live-settings-empty">
                    None of this provider&rsquo;s models take images. Switching provider, or
                    turning on on-device vision in Personalise, are the two ways to improve
                    what it can tell you about the camera.
                  </p>
                )}
              </>
            )
          })()}

          <div className="live-settings-seg" role="group" aria-label="How often to look">
            <button
              className={`live-settings-seg-btn ${visionMode === 'off' ? 'active' : ''}`}
              onClick={() => onVisionMode?.('off')}
            >
              Off
            </button>
            <button
              className={`live-settings-seg-btn ${visionMode === 'auto' ? 'active' : ''}`}
              onClick={() => onVisionMode?.('auto')}
            >
              When relevant
            </button>
            <button
              className={`live-settings-seg-btn ${visionMode === 'always' ? 'active' : ''}`}
              onClick={() => onVisionMode?.('always')}
            >
              Every turn
            </button>
          </div>
          <p className="live-settings-empty">
            {visionMode === 'always'
              ? 'Looks at the camera on every turn — best for demos, uses more tokens.'
              : visionMode === 'auto'
              ? 'Looks only when the question seems visual ("what is this?", "read this").'
              : 'Camera is off for the model. You can still see yourself.'}
          </p>
        </div>

        {/* ── Voice ──────────────────────────────────────────────────────── */}
        <div className="live-settings-group">
          <div className="live-settings-group-title"><Mic size={13} /> Voice output</div>
          <select
            className="live-settings-select"
            value={voiceEngine || 'kokoro'}
            onChange={e => onVoiceEngine?.(e.target.value)}
            aria-label="Voice engine"
          >
            <option value="kokoro">Kokoro (local, fast, 82M)</option>
            <option value="browser">Browser SpeechSynthesis</option>
          </select>
          {voiceEngine === 'kokoro' && (
            <select
              className="live-settings-select"
              value={voice || ''}
              onChange={e => onVoice?.(e.target.value)}
              aria-label="Voice"
            >
              {voices.map(v => <option key={v} value={v}>{VOICE_LABELS[v] || v}</option>)}
            </select>
          )}
          <div className="live-settings-row">
            <label className="live-settings-label">Speech rate</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={rate}
              onChange={e => onRate?.(Number(e.target.value))}
              className="live-settings-range"
            />
            <span className="live-settings-value">{rate.toFixed(1)}x</span>
          </div>
        </div>

        {/* ── Captions ───────────────────────────────────────────────────── */}
        <div className="live-settings-group">
          <div className="live-settings-group-title"><Captions size={13} /> Live captions</div>
          <label className="live-settings-toggle">
            <input type="checkbox" checked={captions} onChange={e => onCaptions?.(e.target.checked)} />
            <span className="live-settings-toggle-slider" />
            <span>Show live captions on screen</span>
          </label>
        </div>

        {/* ── Noise suppression ─────────────────────────────────────────── */}
        <div className="live-settings-group">
          <div className="live-settings-group-title"><Gauge size={13} /> Noise suppression</div>
          <label className="live-settings-toggle">
            <input type="checkbox" checked={noiseSuppression} onChange={e => onNoiseSuppression?.(e.target.checked)} />
            <span className="live-settings-toggle-slider" />
            <span>Reduce background noise (may affect quality on slow devices)</span>
          </label>
        </div>
      </div>
    </div>
  )
}
