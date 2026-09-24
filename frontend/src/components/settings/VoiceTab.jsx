import React, { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { VOICE_LABELS, DEFAULT_VOICE } from '../../video/speech'
import { requestTTS, stopTTS } from '../../api'
import {
  getElevenLabsApiKey, saveElevenLabsApiKey, testElevenLabsKey,
  fetchElevenLabsVoices, DEFAULT_ELEVENLABS_VOICE
} from '../../tools/elevenLabs'

const GENDER = {
  female: ['af_heart', 'af_nova', 'bf_emma'],
  male: ['am_michael', 'am_puck', 'bm_george'],
}

export function VoiceTab({
  prefs = {},
  onPrefChange,
}) {
  const [previewingVoice, setPreviewingVoice] = useState(false)
  const [elevenLabsKey, setElevenLabsKey] = useState('')
  const [elevenLabsKeyInput, setElevenLabsKeyInput] = useState('')
  const [showElevenKey, setShowElevenKey] = useState(false)
  const [testingElevenLabs, setTestingElevenLabs] = useState(false)
  const [elevenLabsStatus, setElevenLabsStatus] = useState(null)
  const [elevenLabsVoices, setElevenLabsVoices] = useState([])

  const voice = prefs.live_voice_local || DEFAULT_VOICE
  const neuralVoice = prefs.live_voice_engine !== 'system'
  const gender = GENDER.male.includes(voice) ? 'male' : 'female'

  useEffect(() => {
    getElevenLabsApiKey().then(k => {
      setElevenLabsKey(k)
      if (k) {
        fetchElevenLabsVoices(k).then(setElevenLabsVoices).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  const handleVoicePreview = async () => {
    if (previewingVoice) {
      stopTTS()
      setPreviewingVoice(false)
      return
    }
    setPreviewingVoice(true)
    try {
      await requestTTS('Welcome to Yogatik. Your high-performance AI workspace is active.', {
        onEnd: () => setPreviewingVoice(false)
      })
    } catch {
      setPreviewingVoice(false)
    }
  }

  return (
    <section className="settings-pane">
      <div className="settings-pane-header">
        <div>
          <h3 className="settings-pane-title">Voice &amp; Audio Synthesis</h3>
          <p className="settings-pane-subtitle">
            Configure local neural speech generation (Kokoro on-device) and live voice call audio.
          </p>
        </div>
      </div>

      <div className="settings-section-card">
        <h4>Speech Engine</h4>
        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">Natural Neural Voice (On-Device)</span>
            <span className="setting-desc">High-fidelity 24kHz neural synthesis. Runs 100% locally on your device without sending voice data to the cloud.</span>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={neuralVoice}
              onChange={e => onPrefChange?.('live_voice_engine', e.target.checked ? 'neural' : 'system')}
            />
            <span className="slider" />
          </label>
        </div>

        {neuralVoice && (
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-name">Voice Persona</span>
              <span className="setting-desc">Select the vocal timbre and personality for text-to-speech.</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                value={voice}
                onChange={e => onPrefChange?.('live_voice_local', e.target.value)}
              >
                {GENDER[gender].map(id => (
                  <option key={id} value={id}>{VOICE_LABELS[id] || id}</option>
                ))}
              </select>
              <button className="settings-btn secondary sm" onClick={handleVoicePreview}>
                {previewingVoice ? 'Stop' : 'Test Voice'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ElevenLabs Cloud Voices */}
      <div className="settings-section-card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4>ElevenLabs Studio Voices (Cloud API)</h4>
          <span className="settings-badge" style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            Studio Quality
          </span>
        </div>
        <p className="settings-pane-subtitle" style={{ marginTop: 4, marginBottom: 12 }}>
          Use ElevenLabs proprietary neural voices and custom clones for ultra-realistic speech synthesis.
        </p>

        <div className="setting-row">
          <div className="setting-info">
            <span className="setting-name">ElevenLabs API Key</span>
            <span className="setting-desc">
              {elevenLabsKey ? 'API key is securely stored in your local encrypted keychain.' : 'Add your xi-api-key from elevenlabs.io to unlock studio voices.'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showElevenKey ? 'text' : 'password'}
                placeholder={elevenLabsKey ? '••••••••••••••••' : 'Enter xi-api-key...'}
                value={elevenLabsKeyInput}
                onChange={e => setElevenLabsKeyInput(e.target.value)}
                style={{ paddingRight: 30, fontSize: 12, minWidth: 160 }}
              />
              <button
                type="button"
                onClick={() => setShowElevenKey(s => !s)}
                style={{ position: 'absolute', right: 6, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 2 }}
                aria-label="Toggle key visibility"
              >
                {showElevenKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            {elevenLabsKeyInput.trim() && (
              <button
                className="settings-btn sm primary"
                onClick={async () => {
                  await saveElevenLabsApiKey(elevenLabsKeyInput.trim())
                  setElevenLabsKey(elevenLabsKeyInput.trim())
                  setElevenLabsKeyInput('')
                  const v = await fetchElevenLabsVoices(elevenLabsKeyInput.trim())
                  setElevenLabsVoices(v)
                  setElevenLabsStatus({ success: true, message: 'Saved and verified!' })
                }}
              >
                Save
              </button>
            )}
            <button
              className="settings-btn sm secondary"
              disabled={testingElevenLabs || (!elevenLabsKey && !elevenLabsKeyInput.trim())}
              onClick={async () => {
                setTestingElevenLabs(true)
                setElevenLabsStatus(null)
                try {
                  const res = await testElevenLabsKey(elevenLabsKeyInput.trim() || elevenLabsKey)
                  setElevenLabsStatus({ success: true, message: `Connected (${res.tier} tier, ${res.characterCount.toLocaleString()} / ${res.characterLimit.toLocaleString()} chars)` })
                } catch (e) {
                  setElevenLabsStatus({ success: false, message: e.message })
                } finally {
                  setTestingElevenLabs(false)
                }
              }}
            >
              {testingElevenLabs ? 'Testing...' : 'Test Key'}
            </button>
          </div>
        </div>

        {elevenLabsStatus && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, fontSize: 11, background: elevenLabsStatus.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: elevenLabsStatus.success ? '#34d399' : '#f87171', border: elevenLabsStatus.success ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)' }}>
            {elevenLabsStatus.message}
          </div>
        )}

        {elevenLabsKey && (
          <div className="setting-row" style={{ marginTop: 12 }}>
            <div className="setting-info">
              <span className="setting-name">Default ElevenLabs Voice</span>
              <span className="setting-desc">Active cloud voice ID for text_to_audio and video narration.</span>
            </div>
            <select
              value={prefs.voice_elevenlabs_id || DEFAULT_ELEVENLABS_VOICE}
              onChange={e => onPrefChange?.('voice_elevenlabs_id', e.target.value)}
            >
              {(elevenLabsVoices.length > 0 ? elevenLabsVoices : [{ voice_id: DEFAULT_ELEVENLABS_VOICE, name: 'Rachel (Default)' }]).map(v => (
                <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </section>
  )
}
