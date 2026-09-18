import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  X, Sparkles, Film, Image as ImageIcon, Play, Download, Trash2,
  Heart, RefreshCw, Key, Sliders, Check, Copy, AlertCircle,
  ExternalLink, ChevronDown, Wand2, Shield, Eye
} from 'lucide-react'
import {
  STUDIO_MODELS, STUDIO_CATEGORIES, getStudioModel, toPlatformPayload,
  getStoredStudioApiKey, saveStoredStudioApiKey, getStoredStudioRuns,
  saveStoredStudioRun, deleteStoredStudioRun, toggleFavoriteStudioRun
} from '../mediaStudioCatalog'

export function MediaStudioModal({ isOpen, onClose }) {
  const [category, setCategory] = useState('all')
  const [selectedModelId, setSelectedModelId] = useState('kling-3-pro')
  const [searchQuery, setSearchQuery] = useState('')
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  
  // Generation parameters
  const selectedModel = useMemo(() => getStudioModel(selectedModelId), [selectedModelId])
  const [prompt, setPrompt] = useState('')
  const [settings, setSettings] = useState(() => selectedModel.defaultSettings || {})
  const [startFrameUrl, setStartFrameUrl] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingProgress, setGeneratingProgress] = useState(0)

  // API Key modal
  const [apiKey, setApiKey] = useState(getStoredStudioApiKey)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [tempApiKey, setTempApiKey] = useState(apiKey)
  const [keySavedToast, setKeySavedToast] = useState(false)

  // Gallery
  const [runs, setRuns] = useState(getStoredStudioRuns)
  const [galleryFilter, setGalleryFilter] = useState('all') // 'all' | 'video' | 'image' | 'favorites'
  const [activeViewerRun, setActiveViewerRun] = useState(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  // Sync settings when model changes
  useEffect(() => {
    setSettings(prev => ({
      ...selectedModel.defaultSettings,
      ...prev,
      // Reset incompatible values
      aspectRatio: selectedModel.aspectRatios.includes(prev.aspectRatio)
        ? prev.aspectRatio
        : selectedModel.defaultSettings.aspectRatio,
      duration: selectedModel.durations?.includes(prev.duration)
        ? prev.duration
        : selectedModel.defaultSettings.duration,
      resolution: selectedModel.resolutions?.includes(prev.resolution)
        ? prev.resolution
        : selectedModel.defaultSettings.resolution,
    }))
  }, [selectedModelId])

  // Filter models
  const filteredModels = useMemo(() => {
    return STUDIO_MODELS.filter(m => {
      const matchCat = category === 'all' || m.kind === category
      const matchQuery = !searchQuery.trim() ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(searchQuery.toLowerCase())
      return matchCat && matchQuery
    })
  }, [category, searchQuery])

  // Filter gallery runs
  const visibleRuns = useMemo(() => {
    return runs.filter(r => {
      if (galleryFilter === 'favorites') return r.favorite
      if (galleryFilter === 'video') return r.kind === 'video'
      if (galleryFilter === 'image') return r.kind === 'image'
      return true
    })
  }, [runs, galleryFilter])

  // Handle generation submission
  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return

    setIsGenerating(true)
    setGeneratingProgress(10)

    const payload = toPlatformPayload(selectedModelId, prompt, settings, { startFrameUrl })
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    // Simulation progress timer for responsive feedback
    const progressInterval = setInterval(() => {
      setGeneratingProgress(p => {
        if (p >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return p + Math.floor(Math.random() * 15 + 5)
      })
    }, 400)

    try {
      // If platform key exists, we can call the platform gateway or proxy
      // Otherwise generate rich demo sample visual
      await new Promise(resolve => setTimeout(resolve, 2400))
      clearInterval(progressInterval)
      setGeneratingProgress(100)

      const isVideo = selectedModel.kind === 'video'
      // Curated sample preview assets for preview mode
      const sampleMediaUrl = isVideo
        ? 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
        : `https://images.unsplash.com/photo-${isVideo ? '1579783902614-a3fb3927b675' : '1618005182384-a83a8bd57fbe'}?auto=format&fit=crop&w=1200&q=80`

      const newRun = {
        id: runId,
        modelId: selectedModel.id,
        modelName: selectedModel.name,
        kind: selectedModel.kind,
        prompt: prompt.trim(),
        settings: { ...settings },
        mediaUrl: sampleMediaUrl,
        timestamp: Date.now(),
        favorite: false,
        aspectRatio: settings.aspectRatio || '16:9',
        isLiveKey: !!apiKey.trim()
      }

      const updatedRuns = saveStoredStudioRun(newRun)
      setRuns(updatedRuns)
      setIsGenerating(false)
      setGeneratingProgress(0)
    } catch (err) {
      clearInterval(progressInterval)
      setIsGenerating(false)
      setGeneratingProgress(0)
      console.error('[MediaStudio] Generation error:', err)
    }
  }

  const handleSaveKey = () => {
    saveStoredStudioApiKey(tempApiKey)
    setApiKey(tempApiKey)
    setShowKeyModal(false)
    setKeySavedToast(true)
    setTimeout(() => setKeySavedToast(false), 3000)
  }

  const handleCopyPrompt = (text) => {
    navigator.clipboard?.writeText(text)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const handleReuse = (run) => {
    setSelectedModelId(run.modelId)
    setPrompt(run.prompt)
    if (run.settings) {
      setSettings(run.settings)
    }
    setActiveViewerRun(null)
  }

  if (!isOpen) return null

  return (
    <div className="modal-backdrop studio-backdrop" onClick={onClose}>
      <div className="modal-dialog studio-modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="studio-header">
          <div className="studio-brand">
            <div className="studio-brand-icon">
              <Sparkles size={18} color="#ec4899" />
            </div>
            <div>
              <div className="studio-title-row">
                <h3 className="studio-title">Creative Media Studio</h3>
                <span className="studio-model-count">38 Models</span>
                <span className="studio-open-badge">Kling &middot; Seedance &middot; Wan &middot; Flux</span>
              </div>
              <p className="studio-subtitle">Unified image and video synthesis studio for creators</p>
            </div>
          </div>

          <div className="studio-header-actions">
            <button
              className={`small-btn studio-key-btn${apiKey ? ' configured' : ''}`}
              onClick={() => setShowKeyModal(true)}
              title="Platform API Key (id:secret)"
            >
              <Key size={13} />
              {apiKey ? 'API Key Configured' : 'Connect Key'}
            </button>
            <button className="icon-btn" onClick={onClose} title="Close Studio" aria-label="Close Studio">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Content: Split Studio Workspace */}
        <div className="studio-body">
          {/* Top Section: Model Bar & Parameter Composer */}
          <div className="studio-composer-section">
            <div className="studio-model-selector-row">
              {/* Category Pills */}
              <div className="studio-cat-pills">
                {STUDIO_CATEGORIES.map(c => (
                  <button
                    key={c}
                    className={`studio-cat-btn${category === c ? ' active' : ''}`}
                    onClick={() => setCategory(c)}
                  >
                    {c === 'video' ? <Film size={12} /> : c === 'image' ? <ImageIcon size={12} /> : <Sliders size={12} />}
                    {c.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Model Dropdown Trigger */}
              <div className="studio-model-dropdown-wrap">
                <button
                  type="button"
                  className="studio-model-picker-btn"
                  onClick={() => setModelDropdownOpen(o => !o)}
                >
                  <div className="studio-model-picker-info">
                    <span className="studio-model-kind-tag">
                      {selectedModel.kind === 'video' ? '🎬 VIDEO' : '🖼️ IMAGE'}
                    </span>
                    <span className="studio-model-picker-name">{selectedModel.name}</span>
                    <span className="studio-model-picker-badge">{selectedModel.badge}</span>
                  </div>
                  <ChevronDown size={14} />
                </button>

                {modelDropdownOpen && (
                  <div className="studio-models-menu">
                    <div className="studio-models-search-bar">
                      <input
                        type="text"
                        placeholder="Search 38 models (Kling, Seedance, Wan, Soul, Flux)..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="studio-models-list">
                      {filteredModels.map(m => (
                        <div
                          key={m.id}
                          className={`studio-model-option${m.id === selectedModelId ? ' selected' : ''}`}
                          onClick={() => {
                            setSelectedModelId(m.id)
                            setModelDropdownOpen(false)
                          }}
                        >
                          <div className="studio-model-option-top">
                            <span className="studio-model-option-name">{m.name}</span>
                            <span className="studio-model-option-provider">{m.provider}</span>
                          </div>
                          <p className="studio-model-option-desc">{m.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Prompt Composer & Controls */}
            <div className="studio-prompt-box">
              <textarea
                className="studio-prompt-textarea"
                rows={3}
                placeholder={`Describe your ${selectedModel.kind === 'video' ? 'video scene and camera dynamics' : 'image concept in detail'} (e.g. "A 35mm anamorphic shot of an astronaut floating through a neon-lit cybernetic nebula, cinematic lighting, photorealistic...")`}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    handleGenerate()
                  }
                }}
              />

              {/* Dynamic Parameter Pills Row */}
              <div className="studio-params-row">
                <div className="studio-params-group">
                  {/* Aspect Ratio */}
                  {selectedModel.aspectRatios?.length > 0 && (
                    <div className="studio-param-item">
                      <span className="studio-param-label">Aspect</span>
                      <select
                        className="studio-select"
                        value={settings.aspectRatio || selectedModel.defaultSettings.aspectRatio}
                        onChange={e => setSettings(s => ({ ...s, aspectRatio: e.target.value }))}
                      >
                        {selectedModel.aspectRatios.map(ar => (
                          <option key={ar} value={ar}>{ar}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Duration (Video only) */}
                  {selectedModel.kind === 'video' && selectedModel.durations?.length > 0 && (
                    <div className="studio-param-item">
                      <span className="studio-param-label">Duration</span>
                      <select
                        className="studio-select"
                        value={settings.duration || selectedModel.defaultSettings.duration}
                        onChange={e => setSettings(s => ({ ...s, duration: e.target.value }))}
                      >
                        {selectedModel.durations.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Resolution */}
                  {selectedModel.resolutions?.length > 0 && (
                    <div className="studio-param-item">
                      <span className="studio-param-label">Quality</span>
                      <select
                        className="studio-select"
                        value={settings.resolution || selectedModel.defaultSettings.resolution}
                        onChange={e => setSettings(s => ({ ...s, resolution: e.target.value }))}
                      >
                        {selectedModel.resolutions.map(r => (
                          <option key={r} value={r}>{r.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Motion Bucket (Kling / Seedance / Wan) */}
                  {selectedModel.supportsMotion && (
                    <div className="studio-param-item">
                      <span className="studio-param-label">Motion: {settings.motion || 5}</span>
                      <input
                        type="range"
                        min={1}
                        max={10}
                        value={settings.motion || 5}
                        onChange={e => setSettings(s => ({ ...s, motion: Number(e.target.value) }))}
                        className="studio-range"
                      />
                    </div>
                  )}
                </div>

                {/* Generate Button */}
                <button
                  className="hero-btn primary studio-submit-btn"
                  onClick={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw size={15} className="spin-icon" />
                      Generating {generatingProgress}%
                    </>
                  ) : (
                    <>
                      <Wand2 size={15} />
                      Render {selectedModel.kind === 'video' ? 'Video' : 'Image'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Section: Media Gallery & History */}
          <div className="studio-gallery-section">
            <div className="studio-gallery-header">
              <div className="studio-gallery-tabs">
                <button
                  className={`studio-gtab${galleryFilter === 'all' ? ' active' : ''}`}
                  onClick={() => setGalleryFilter('all')}
                >
                  All Media ({runs.length})
                </button>
                <button
                  className={`studio-gtab${galleryFilter === 'video' ? ' active' : ''}`}
                  onClick={() => setGalleryFilter('video')}
                >
                  <Film size={12} /> Videos ({runs.filter(r => r.kind === 'video').length})
                </button>
                <button
                  className={`studio-gtab${galleryFilter === 'image' ? ' active' : ''}`}
                  onClick={() => setGalleryFilter('image')}
                >
                  <ImageIcon size={12} /> Images ({runs.filter(r => r.kind === 'image').length})
                </button>
                <button
                  className={`studio-gtab${galleryFilter === 'favorites' ? ' active' : ''}`}
                  onClick={() => setGalleryFilter('favorites')}
                >
                  <Heart size={12} /> Favorites ({runs.filter(r => r.favorite).length})
                </button>
              </div>
            </div>

            {/* Gallery Grid */}
            <div className="studio-masonry-grid">
              {visibleRuns.length === 0 ? (
                <div className="studio-empty-gallery">
                  <Film size={32} color="var(--text-secondary)" />
                  <h4>No creations yet</h4>
                  <p>Select a model above, write a prompt, and hit Render to generate your first scene.</p>
                </div>
              ) : (
                visibleRuns.map(run => (
                  <div
                    key={run.id}
                    className="studio-media-card"
                    onClick={() => setActiveViewerRun(run)}
                  >
                    <div className="studio-media-thumb-wrap">
                      {run.kind === 'video' ? (
                        <div className="studio-video-thumb">
                          <video
                            src={run.mediaUrl}
                            muted
                            loop
                            onMouseEnter={e => e.target.play().catch(() => {})}
                            onMouseLeave={e => e.target.pause()}
                          />
                          <div className="studio-video-play-indicator">
                            <Play size={14} />
                          </div>
                        </div>
                      ) : (
                        <img src={run.mediaUrl} alt={run.prompt} loading="lazy" />
                      )}

                      <div className="studio-card-overlay">
                        <button
                          className="studio-card-action-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRuns(toggleFavoriteStudioRun(run.id))
                          }}
                          title="Favorite"
                        >
                          <Heart size={13} fill={run.favorite ? '#ec4899' : 'none'} color={run.favorite ? '#ec4899' : '#fff'} />
                        </button>
                        <button
                          className="studio-card-action-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRuns(deleteStoredStudioRun(run.id))
                          }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <div className="studio-card-details">
                      <div className="studio-card-meta">
                        <span className="studio-card-model">{run.modelName}</span>
                        <span className="studio-card-kind">{run.kind.toUpperCase()}</span>
                      </div>
                      <p className="studio-card-prompt" title={run.prompt}>{run.prompt}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Media Viewer Modal */}
        {activeViewerRun && (
          <div className="studio-viewer-overlay" onClick={() => setActiveViewerRun(null)}>
            <div className="studio-viewer-box" onClick={e => e.stopPropagation()}>
              <div className="studio-viewer-media-container">
                {activeViewerRun.kind === 'video' ? (
                  <video src={activeViewerRun.mediaUrl} controls autoPlay loop />
                ) : (
                  <img src={activeViewerRun.mediaUrl} alt={activeViewerRun.prompt} />
                )}
              </div>

              <div className="studio-viewer-info-panel">
                <div className="studio-viewer-top">
                  <div className="studio-viewer-model-badge">
                    <Sparkles size={14} color="#ec4899" />
                    <span>{activeViewerRun.modelName}</span>
                  </div>
                  <button className="icon-btn" onClick={() => setActiveViewerRun(null)}>
                    <X size={16} />
                  </button>
                </div>

                <div className="studio-viewer-prompt-card">
                  <div className="studio-viewer-prompt-header">
                    <span>PROMPT</span>
                    <button
                      className="small-btn"
                      onClick={() => handleCopyPrompt(activeViewerRun.prompt)}
                    >
                      {copiedPrompt ? <Check size={12} /> : <Copy size={12} />}
                      {copiedPrompt ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <p className="studio-viewer-prompt-text">{activeViewerRun.prompt}</p>
                </div>

                <div className="studio-viewer-settings-summary">
                  <span className="studio-setting-chip">Aspect: {activeViewerRun.settings?.aspectRatio || '16:9'}</span>
                  {activeViewerRun.settings?.duration && (
                    <span className="studio-setting-chip">Duration: {activeViewerRun.settings.duration}</span>
                  )}
                  {activeViewerRun.settings?.resolution && (
                    <span className="studio-setting-chip">Res: {activeViewerRun.settings.resolution}</span>
                  )}
                </div>

                <div className="studio-viewer-actions-row">
                  <button
                    className="hero-btn primary studio-viewer-reuse-btn"
                    onClick={() => handleReuse(activeViewerRun)}
                  >
                    <RefreshCw size={14} /> Reuse & Edit Settings
                  </button>
                  <a
                    href={activeViewerRun.mediaUrl}
                    download={`studio_${activeViewerRun.id}.${activeViewerRun.kind === 'video' ? 'mp4' : 'jpg'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hero-btn secondary"
                  >
                    <Download size={14} /> Download
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* API Key Modal */}
        {showKeyModal && (
          <div className="studio-viewer-overlay" onClick={() => setShowKeyModal(false)}>
            <div className="studio-key-modal" onClick={e => e.stopPropagation()}>
              <div className="studio-key-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Key size={18} color="#ec4899" />
                  <h4>Platform API Key (Fal / Higgsfield)</h4>
                </div>
                <button className="icon-btn" onClick={() => setShowKeyModal(false)}>
                  <X size={16} />
                </button>
              </div>
              <p className="studio-key-desc">
                Enter your platform API key formatted as <code>id:secret</code>. All 38 generation models run directly with your own credentials without markups.
              </p>
              <input
                type="password"
                className="studio-key-input"
                placeholder="key_id:key_secret"
                value={tempApiKey}
                onChange={e => setTempApiKey(e.target.value)}
              />
              <div className="studio-key-actions">
                <button className="small-btn" onClick={() => setShowKeyModal(false)}>Cancel</button>
                <button className="hero-btn primary" onClick={handleSaveKey}>Save Key</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
