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
    <div className="ldp-backdrop" onClick={onClose} role="presentation">
      <div className="ldp-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="Live settings">
        <div className="ldp-head">
          <span>Live settings</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>

        {/* ── Vision ─────────────────────────────────────────────────────── */}
        <div className="ldp-group">
          <div className="ldp-group-title"><Eye size={13} /> What the model sees</div>

          {!modelCanSee && (
            <div className="ls-warn">
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
                  className="style-select ls-select"
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
                  <p className="ldp-empty">
                    None of this provider&rsquo;s models take images. Switching provider, or
                    turning on on-device vision in Personalise, are the two ways to improve
                    what it can tell you about the camera.
                  </p>
                )}
              </>
            )
          })()}

          <div className="ls-seg" role="group" aria-label="How often to look">
            <button
              className={`ls-seg-btn${visionMode === 'off' ? ' active' : ''}`}
              onClick={() => onVisionMode?.('off')}
            >
              Off
            </button>
            <button
              className={`ls-seg-btn${visionMode === 'auto' ? ' active' : ''}`}
              onClick={() => onVisionMode?.('auto')}
            >
              When relevant
            </button>
            <button
              className={`ls-seg-btn${visionMode === 'always' ? ' active' : ''}`}
              onClick={() => onVisionMode?.('always')}
            >
              Every turn
            </button>
          </div>
          <p className="ldp-empty">
            {visionMode === 'always'
              ? 'Looks at the camera on every turn. More accurate, and more tokens.'
              : visionMode === 'off'
              ? 'Camera is on but vision is disabled. No frames are sent or described.'
              : 'Looks when you ask something visual or the scene changes.'}
          </p>
        </div>

        {/* ── Voice ──────────────────────────────────────────────────────── */}
        <div className="ldp-group">
          <div className="ldp-group-title"><Volume2 size={13} /> Voice</div>
          <div className="ls-seg" role="group" aria-label="Voice engine">
            <button
              className={`ls-seg-btn${voiceEngine === 'system' ? ' active' : ''}`}
              onClick={() => onVoiceEngine?.('system')}
            >
              ⚡ System (Instant)
            </button>
            <button
              className={`ls-seg-btn${voiceEngine === 'neural' ? ' active' : ''}`}
              onClick={() => onVoiceEngine?.('neural')}
            >
              <Sparkles size={12} /> Neural
            </button>
          </div>
          <p className="ldp-empty">
            {voiceEngine === 'system'
              ? '⚡ Built-in browser speech. Ultra-fast (<50ms), zero lag.'
              : '🧠 On-device neural voice. Natural human tone, requires local compute.'}
          </p>

          {voices.length > 0 && (
            <select
              className="style-select ls-select"
              value={voice || ''}
              onChange={e => onVoice?.(e.target.value)}
              aria-label="Voice"
            >
              {voices.map(id => <option key={id} value={id}>{VOICE_LABELS?.[id] || id}</option>)}
            </select>
          )}
        </div>

        {/* ── Speech rate ────────────────────────────────────────────────── */}
        <div className="ldp-group">
          <div className="ldp-group-title"><Gauge size={13} /> Speaking speed</div>
          <div className="ls-row">
            <input
              type="range" min="0.7" max="1.3" step="0.05"
              value={rate}
              onChange={e => onRate?.(Number(e.target.value))}
              aria-label="Speaking speed"
            />
            <span className="ls-value">{Number(rate).toFixed(2)}×</span>
          </div>
        </div>

        {/* ── Noise Suppression ─────────────────────────────────────────── */}
        <div className="ldp-group">
          <div className="ldp-group-title"><Mic size={13} /> Noise suppression</div>
          <button
            className={`ldp-row${noiseSuppression ? ' active' : ''}`}
            onClick={() => onNoiseSuppression?.(!noiseSuppression)}
          >
            <span className="ldp-label">Filter background noise (fan, typing, room echo)</span>
            <span className="ldp-tag">{noiseSuppression ? 'On' : 'Off'}</span>
          </button>
          <p className="ldp-empty">
            Uses the browser's built-in noise suppression. Turning this off may improve
            voice pickup in very quiet environments but will let through more ambient sound.
          </p>
        </div>

        {/* ── Captions ───────────────────────────────────────────────────── */}
        <div className="ldp-group">
          <div className="ldp-group-title"><Captions size={13} /> Captions</div>
          <button
            className={`ldp-row${captions ? ' active' : ''}`}
            onClick={() => onCaptions?.(!captions)}
          >
            <span className="ldp-label">Show what is being said on screen</span>
            <span className="ldp-tag">{captions ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}