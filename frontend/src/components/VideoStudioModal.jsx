import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  X, Play, Pause, RotateCcw, Scissors, Volume2, VolumeX,
  Maximize, Minimize, Download, Upload, ExternalLink, Film,
  Music, Image as ImageIcon, Check, Copy, AlertCircle, RefreshCw,
  FastForward, Rewind, Eye, ChevronRight, Sparkles, MonitorPlay,
  Layers, Sliders, FileVideo
} from 'lucide-react'
import { formatTime, captureVideoSnapshot, extractAudioClip, renderTrimmedClip } from '../video/videoExport'
import { getStoredStudioRuns } from '../mediaStudioCatalog'

// Sample video source for immediate testing
const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'

export function VideoStudioModal({ isOpen, onClose, initialVideoUrl = null }) {
  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Media state
  const [videoSrc, setVideoSrc] = useState(initialVideoUrl || '')
  const [videoName, setVideoName] = useState(initialVideoUrl ? 'Loaded Video' : '')
  const [localFilePath, setLocalFilePath] = useState('')
  const [isSampleLoaded, setIsSampleLoaded] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [isLooping, setIsLooping] = useState(false)
  const [aspectRatio, setAspectRatio] = useState('original') // 'original' | '16:9' | '9:16' | '1:1'

  // Trimmer state
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isPreviewingTrim, setIsPreviewingTrim] = useState(false)

  // Export & Action state
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStage, setExportStage] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionError, setActionError] = useState('')

  // VLC state
  const [vlcStatus, setVlcStatus] = useState(null)
  const [copiedVlcCmd, setCopiedVlcCmd] = useState(false)
  const isDesktop = typeof window !== 'undefined' && Boolean(window.__YOGATIK_ELECTRON__ || window.__YOGATIK_DESKTOP__)

  // AI media gallery runs
  const galleryVideos = useMemo(() => {
    try {
      return getStoredStudioRuns().filter(r => r.kind === 'video' && r.mediaUrl)
    } catch {
      return []
    }
  }, [])

  // Sync initial video url if provided
  useEffect(() => {
    if (initialVideoUrl) {
      setVideoSrc(initialVideoUrl)
      setVideoName('Project Media Clip')
      setLocalFilePath('')
    }
  }, [initialVideoUrl])

  // Clear toast feedback
  const showToast = useCallback((msg, isErr = false) => {
    if (isErr) {
      setActionError(msg)
      setTimeout(() => setActionError(''), 4000)
    } else {
      setActionSuccess(msg)
      setTimeout(() => setActionSuccess(''), 3000)
    }
  }, [])

  // Handle Video Metadata Loaded
  const handleLoadedMetadata = () => {
    if (!videoRef.current) return
    const dur = videoRef.current.duration || 0
    setDuration(dur)
    setCurrentTime(0)
    setTrimStart(0)
    setTrimEnd(dur)
    setIsPlaying(false)
  }

  // Handle Time Update
  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const cur = videoRef.current.currentTime
    setCurrentTime(cur)

    // Handle trim preview loop/stop
    if (isPreviewingTrim && cur >= trimEnd) {
      if (isLooping) {
        videoRef.current.currentTime = trimStart
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
        setIsPreviewingTrim(false)
      }
    }
  }

  // Toggle Play / Pause
  const togglePlay = () => {
    if (!videoRef.current || !videoSrc) return
    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(err => {
        showToast('Playback error: ' + err.message, true)
      })
    }
  }

  // Step Frame
  const stepFrame = (deltaSec) => {
    if (!videoRef.current || !videoSrc) return
    videoRef.current.pause()
    setIsPlaying(false)
    const next = Math.max(0, Math.min(duration, videoRef.current.currentTime + deltaSec))
    videoRef.current.currentTime = next
    setCurrentTime(next)
  }

  // Set Speed
  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed)
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
    }
  }

  // Set In / Out Points
  const handleSetIn = () => {
    const cur = currentTime
    const newStart = Math.min(cur, trimEnd > 0 ? trimEnd - 0.1 : duration)
    setTrimStart(Math.max(0, newStart))
    showToast(`In-point set to ${formatTime(newStart)}`)
  }

  const handleSetOut = () => {
    const cur = currentTime
    const newEnd = Math.max(cur, trimStart + 0.1)
    setTrimEnd(Math.min(duration, newEnd))
    showToast(`Out-point set to ${formatTime(newEnd)}`)
  }

  const handleResetTrim = () => {
    setTrimStart(0)
    setTrimEnd(duration)
    showToast('Trim range reset to full video')
  }

  // Preview Trim Segment
  const handlePreviewTrim = () => {
    if (!videoRef.current || !videoSrc) return
    videoRef.current.currentTime = trimStart
    setCurrentTime(trimStart)
    setIsPreviewingTrim(true)
    videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {})
  }

  // Timeline Click / Scrub
  const handleTimelineClick = (e) => {
    if (!timelineRef.current || !duration || !videoRef.current) return
    const rect = timelineRef.current.getBoundingClientRect()
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const targetTime = (clickX / rect.width) * duration
    videoRef.current.currentTime = targetTime
    setCurrentTime(targetTime)
  }

  // Local File Upload Handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setVideoSrc(url)
    setVideoName(file.name)
    setLocalFilePath(file.path || '')
    setIsSampleLoaded(false)
    showToast(`Loaded ${file.name}`)
  }

  // Load Video URL
  const handleLoadUrl = () => {
    if (!urlInput.trim()) return
    setVideoSrc(urlInput.trim())
    setVideoName('Web Video Stream')
    setLocalFilePath('')
    setIsSampleLoaded(false)
    showToast('Loaded web stream URL')
  }

  // Load Sample Video
  const handleLoadSample = () => {
    setVideoSrc(SAMPLE_VIDEO_URL)
    setVideoName('Demo Sample (Blazes 1080p)')
    setLocalFilePath('')
    setIsSampleLoaded(true)
    showToast('Demo video loaded')
  }

  // Snapshot Frame
  const handleCaptureSnapshot = async () => {
    if (!videoRef.current || !videoSrc) return
    try {
      const blob = await captureVideoSnapshot(videoRef.current)
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `frame_${formatTime(currentTime).replace(/[:.]/g, '-')}.png`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      showToast('Frame snapshot downloaded')
    } catch (err) {
      showToast('Snapshot failed: ' + err.message, true)
    }
  }

  // Extract Audio
  const handleExtractAudio = async () => {
    if (!videoSrc) return
    setIsExporting(true)
    setExportStage('Extracting audio track as WAV...')
    setExportProgress(30)
    try {
      const blob = await extractAudioClip(videoSrc, trimStart, trimEnd)
      setExportProgress(100)
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${videoName || 'audio'}_clip_${formatTime(trimStart)}-${formatTime(trimEnd)}.wav`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      showToast('WAV audio clip exported successfully')
    } catch (err) {
      showToast('Audio extraction error: ' + err.message, true)
    } finally {
      setIsExporting(false)
      setExportStage('')
    }
  }

  // Trim and Export Video
  const handleExportTrimmedVideo = async () => {
    if (!videoRef.current || !videoSrc) return
    setIsExporting(true)
    setExportStage('Rendering trimmed video...')
    setExportProgress(0)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const { blob, ext } = await renderTrimmedClip({
        videoEl: videoRef.current,
        startSec: trimStart,
        endSec: trimEnd,
        playbackRate: playbackSpeed,
        onProgress: (p) => setExportProgress(p),
        signal: controller.signal,
      })

      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `${videoName.replace(/\.[^/.]+$/, '')}_trimmed_${formatTime(trimStart)}-${formatTime(trimEnd)}.${ext}`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      showToast(`Export complete! Saved as .${ext}`)
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Export error: ' + err.message, true)
      }
    } finally {
      setIsExporting(false)
      setExportStage('')
      setExportProgress(0)
      abortControllerRef.current = null
    }
  }

  // Open in VLC Media Player
  const handleOpenInVlc = async () => {
    if (!videoSrc) return

    // 1. Electron Desktop Environment
    if (isDesktop && window.__YOGATIK_DESKTOP__?.openVlc) {
      try {
        const target = localFilePath || videoSrc
        const res = await window.__YOGATIK_DESKTOP__.openVlc(target)
        if (res?.success) {
          setVlcStatus(`Launched in ${res.player === 'vlc' ? 'VLC Media Player' : 'Media Player'}`)
          showToast(`Opening in ${res.player === 'vlc' ? 'VLC' : 'system player'}!`)
          setTimeout(() => setVlcStatus(null), 5000)
          return
        }
      } catch (err) {
        console.warn('Electron VLC launch failed, using fallback:', err)
      }
    }

    // 2. Web Browser Environment: Copy VLC network command & show instructions
    const vlcCmd = `vlc "${videoSrc}"`
    try {
      await navigator.clipboard.writeText(vlcCmd)
      setCopiedVlcCmd(true)
      showToast('Copied VLC command! Open VLC -> Media -> Open Network Stream (Ctrl+N)')
      setTimeout(() => setCopiedVlcCmd(false), 3000)
    } catch {
      showToast(`To play in VLC: Open VLC -> Press Ctrl+N -> Paste: ${videoSrc}`)
    }
  }

  // Keyboard shortcut listeners
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === '[' || e.key === 'i' || e.key === 'I') {
        e.preventDefault()
        handleSetIn()
      } else if (e.key === ']' || e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        handleSetOut()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        stepFrame(e.shiftKey ? -1.0 : -0.1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepFrame(e.shiftKey ? 1.0 : 0.1)
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setIsMuted(m => !m)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isPlaying, duration, currentTime, trimStart, trimEnd, videoSrc])

  if (!isOpen) return null

  // Calculate percentages for timeline visual
  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const selectedDuration = Math.max(0, trimEnd - trimStart)

  return (
    <div className="modal-backdrop studio-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-dialog video-studio-container" onClick={e => e.stopPropagation()}>
        {/* Studio Header */}
        <div className="video-studio-header">
          <div className="video-studio-brand">
            <div className="video-studio-brand-icon">
              <Film size={20} color="#06b6d4" />
            </div>
            <div>
              <div className="video-studio-title-row">
                <h3 className="video-studio-title">Video Studio & Precision Trimmer</h3>
                <span className="video-studio-badge">VLC &middot; WebCodecs &middot; Trimmer</span>
                {isDesktop && <span className="video-studio-desktop-pill">Desktop Native</span>}
              </div>
              <p className="video-studio-subtitle">
                Play, scrub, trim in/out points, extract audio, and launch in VLC Media Player
              </p>
            </div>
          </div>

          <div className="video-studio-header-actions">
            {/* VLC Button */}
            <button
              className="vlc-action-btn"
              onClick={handleOpenInVlc}
              disabled={!videoSrc}
              title={isDesktop ? "Launch directly in native VLC Player" : "Copy VLC network stream command"}
            >
              <MonitorPlay size={15} color="#f97316" />
              <span>{isDesktop ? 'Open in VLC' : (copiedVlcCmd ? 'VLC Link Copied!' : 'Play in VLC')}</span>
            </button>

            <button className="icon-btn" onClick={onClose} title="Close Video Studio" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Studio Body: Split View */}
        <div className="video-studio-body">
          {/* Main Stage (Player & Timeline) */}
          <div className="video-studio-main-stage">
            {/* Video Canvas Box */}
            <div className={`video-player-wrapper aspect-${aspectRatio}`}>
              {videoSrc ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="video-element"
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => {
                      setIsPlaying(false)
                      setIsPreviewingTrim(false)
                    }}
                    muted={isMuted}
                    playsInline
                  />
                  {/* Floating Play/Pause Click Overlay */}
                  <div
                    className="video-player-click-overlay"
                    onClick={togglePlay}
                    title="Click to toggle playback (Spacebar)"
                  >
                    {!isPlaying && (
                      <div className="video-big-play-pill">
                        <Play size={24} fill="#fff" />
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="video-empty-state">
                  <FileVideo size={48} color="#475569" />
                  <p className="video-empty-title">No video loaded</p>
                  <p className="video-empty-desc">
                    Upload an MP4/WebM file, paste a video URL, or load the instant demo clip below.
                  </p>
                  <div className="video-empty-actions">
                    <label className="hero-btn primary small-btn">
                      <Upload size={14} /> Upload Video
                      <input type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    <button className="hero-btn secondary small-btn" onClick={handleLoadSample}>
                      <Sparkles size={14} /> Load Demo Video
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Precision Timeline & Trimmer Section */}
            <div className="video-timeline-card">
              {/* Timecode Readouts */}
              <div className="timeline-hud-row">
                <div className="hud-metric">
                  <span className="hud-label">CURRENT</span>
                  <span className="hud-val current">{formatTime(currentTime)}</span>
                </div>
                <div className="hud-metric">
                  <span className="hud-label">TRIM IN</span>
                  <span className="hud-val in-val">{formatTime(trimStart)}</span>
                </div>
                <div className="hud-metric">
                  <span className="hud-label">TRIM OUT</span>
                  <span className="hud-val out-val">{formatTime(trimEnd)}</span>
                </div>
                <div className="hud-metric">
                  <span className="hud-label">SELECTED LENGTH</span>
                  <span className="hud-val selected">{formatTime(selectedDuration)}</span>
                </div>
                <div className="hud-metric">
                  <span className="hud-label">TOTAL DURATION</span>
                  <span className="hud-val total">{formatTime(duration)}</span>
                </div>
              </div>

              {/* Scrubber & In/Out Track */}
              <div
                ref={timelineRef}
                className="timeline-track-container"
                onClick={handleTimelineClick}
                title="Click or drag to scrub playhead"
              >
                <div className="timeline-track-bg" />
                {/* Active Trimmed Interval Highlight */}
                <div
                  className="timeline-trim-region"
                  style={{
                    left: `${startPercent}%`,
                    width: `${Math.max(0, endPercent - startPercent)}%`,
                  }}
                />
                {/* In-Point Marker */}
                <div
                  className="timeline-handle in-handle"
                  style={{ left: `${startPercent}%` }}
                  title={`In-Point: ${formatTime(trimStart)}`}
                >
                  <div className="handle-tag">IN</div>
                </div>
                {/* Out-Point Marker */}
                <div
                  className="timeline-handle out-handle"
                  style={{ left: `${endPercent}%` }}
                  title={`Out-Point: ${formatTime(trimEnd)}`}
                >
                  <div className="handle-tag">OUT</div>
                </div>
                {/* Current Playhead Needle */}
                <div
                  className="timeline-playhead-needle"
                  style={{ left: `${playheadPercent}%` }}
                />
              </div>

              {/* Transport Controls Bar */}
              <div className="video-transport-bar">
                <div className="transport-group">
                  <button
                    className="icon-btn-pill"
                    onClick={() => stepFrame(-0.1)}
                    disabled={!videoSrc}
                    title="Step backward 1 frame / 0.1s (Left Arrow)"
                  >
                    <Rewind size={15} />
                  </button>
                  <button
                    className="transport-play-btn"
                    onClick={togglePlay}
                    disabled={!videoSrc}
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                  >
                    {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                  </button>
                  <button
                    className="icon-btn-pill"
                    onClick={() => stepFrame(0.1)}
                    disabled={!videoSrc}
                    title="Step forward 1 frame / 0.1s (Right Arrow)"
                  >
                    <FastForward size={15} />
                  </button>
                </div>

                <div className="transport-divider" />

                {/* In/Out Trim Actions */}
                <div className="transport-group">
                  <button
                    className="trim-cut-btn in-btn"
                    onClick={handleSetIn}
                    disabled={!videoSrc}
                    title="Set In-Point to current frame (Key: I or [)"
                  >
                    <Scissors size={13} />
                    <span>[ Set In</span>
                  </button>
                  <button
                    className="trim-cut-btn out-btn"
                    onClick={handleSetOut}
                    disabled={!videoSrc}
                    title="Set Out-Point to current frame (Key: O or ])"
                  >
                    <span>Set Out ]</span>
                    <Scissors size={13} />
                  </button>
                  <button
                    className={`trim-preview-btn${isPreviewingTrim ? ' active' : ''}`}
                    onClick={handlePreviewTrim}
                    disabled={!videoSrc}
                    title="Preview playback between Trim In and Trim Out"
                  >
                    <Eye size={13} />
                    <span>Preview Clip</span>
                  </button>
                  <button
                    className="icon-btn-pill"
                    onClick={handleResetTrim}
                    disabled={!videoSrc}
                    title="Reset trim markers to full video"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>

                <div className="transport-divider" />

                {/* Speed & Volume */}
                <div className="transport-group">
                  <select
                    className="studio-speed-select"
                    value={playbackSpeed}
                    onChange={e => handleSpeedChange(Number(e.target.value))}
                    disabled={!videoSrc}
                    title="Playback speed"
                  >
                    <option value={0.25}>0.25x</option>
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1.0}>1.0x (Normal)</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2.0}>2.0x</option>
                  </select>

                  <button
                    className="icon-btn-pill"
                    onClick={() => setIsMuted(m => !m)}
                    title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                  >
                    {isMuted ? <VolumeX size={15} color="#ef4444" /> : <Volume2 size={15} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setVolume(v)
                      if (videoRef.current) videoRef.current.volume = v
                      if (v > 0) setIsMuted(false)
                    }}
                    className="volume-slider"
                    title={`Volume: ${Math.round(volume * 100)}%`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Source Selector & Export Operations */}
          <div className="video-studio-sidebar">
            {/* Source Loader Box */}
            <div className="studio-panel-card">
              <h4 className="panel-card-title">
                <FileVideo size={14} color="#06b6d4" />
                <span>Video Source</span>
              </h4>

              <div className="source-inputs-stack">
                {/* Upload Button */}
                <label className="source-upload-dropzone">
                  <Upload size={16} />
                  <span>Choose Video File...</span>
                  <input type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>

                {/* URL Input */}
                <div className="source-url-row">
                  <input
                    type="text"
                    placeholder="https://.../video.mp4"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    className="source-url-input"
                  />
                  <button className="small-btn primary" onClick={handleLoadUrl}>
                    Load
                  </button>
                </div>

                {/* Instant Sample Button */}
                <button className="source-sample-btn" onClick={handleLoadSample}>
                  <Sparkles size={13} color="#a855f7" />
                  <span>Load Demo Sample Video</span>
                </button>

                {/* Loaded Video Name Indicator */}
                {videoSrc && (
                  <div className="loaded-clip-badge" title={videoName}>
                    <Check size={12} color="#10b981" />
                    <span className="truncate">{videoName || 'Custom Video'}</span>
                  </div>
                )}
              </div>
            </div>

            {/* AI Media Studio Gallery Import */}
            {galleryVideos.length > 0 && (
              <div className="studio-panel-card">
                <h4 className="panel-card-title">
                  <Sparkles size={14} color="#ec4899" />
                  <span>From AI Media Studio ({galleryVideos.length})</span>
                </h4>
                <div className="gallery-video-scroller">
                  {galleryVideos.slice(0, 4).map(run => (
                    <button
                      key={run.id}
                      className="gallery-video-item"
                      onClick={() => {
                        setVideoSrc(run.mediaUrl)
                        setVideoName(run.modelName + ' - ' + (run.prompt || 'Clip').slice(0, 20))
                        showToast(`Imported ${run.modelName} video`)
                      }}
                      title={run.prompt}
                    >
                      <Film size={12} />
                      <span className="truncate">{run.prompt || run.modelName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Crop & Aspect Presets */}
            <div className="studio-panel-card">
              <h4 className="panel-card-title">
                <Layers size={14} color="#3b82f6" />
                <span>Display & Framing</span>
              </h4>
              <div className="aspect-chips-grid">
                {[
                  { id: 'original', label: 'Original' },
                  { id: '16:9', label: '16:9 (Landscape)' },
                  { id: '9:16', label: '9:16 (Shorts/Reels)' },
                  { id: '1:1', label: '1:1 (Square)' },
                ].map(item => (
                  <button
                    key={item.id}
                    className={`aspect-chip${aspectRatio === item.id ? ' active' : ''}`}
                    onClick={() => setAspectRatio(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Export & Actions Box */}
            <div className="studio-panel-card highlight-card">
              <h4 className="panel-card-title">
                <Scissors size={14} color="#10b981" />
                <span>Export & Tools</span>
              </h4>

              {/* Progress readout */}
              {isExporting && (
                <div className="export-progress-box">
                  <div className="export-progress-label">
                    <RefreshCw size={13} className="spin-icon" />
                    <span>{exportStage} ({exportProgress}%)</span>
                  </div>
                  <div className="export-progress-bar-bg">
                    <div className="export-progress-fill" style={{ width: `${exportProgress}%` }} />
                  </div>
                </div>
              )}

              {/* Export Buttons */}
              <div className="export-buttons-stack">
                <button
                  className="hero-btn primary studio-export-btn"
                  onClick={handleExportTrimmedVideo}
                  disabled={!videoSrc || isExporting}
                  title="Render trimmed section from In to Out as a fresh video file"
                >
                  <Download size={15} />
                  <span>Trim & Export Clip ({formatTime(selectedDuration)})</span>
                </button>

                <button
                  className="studio-secondary-action-btn"
                  onClick={handleExtractAudio}
                  disabled={!videoSrc || isExporting}
                  title="Extract selected clip's audio channel into a lossless WAV file"
                >
                  <Music size={14} color="#06b6d4" />
                  <span>Extract Audio (WAV)</span>
                </button>

                <button
                  className="studio-secondary-action-btn"
                  onClick={handleCaptureSnapshot}
                  disabled={!videoSrc}
                  title="Download full-resolution snapshot of current video frame"
                >
                  <ImageIcon size={14} color="#a855f7" />
                  <span>Capture Frame (PNG)</span>
                </button>
              </div>

              {/* Toast Feedback */}
              {actionSuccess && (
                <div className="studio-toast-banner success">
                  <Check size={14} />
                  <span>{actionSuccess}</span>
                </div>
              )}
              {actionError && (
                <div className="studio-toast-banner error">
                  <AlertCircle size={14} />
                  <span>{actionError}</span>
                </div>
              )}
            </div>

            {/* Keyboard Shortcuts Hint */}
            <div className="studio-shortcuts-box">
              <span className="shortcuts-title">Keyboard Shortcuts:</span>
              <div className="shortcuts-list">
                <span><code>Space</code> Play / Pause</span>
                <span><code>[</code> or <code>I</code> Set In</span>
                <span><code>]</code> or <code>O</code> Set Out</span>
                <span><code>&larr;</code> <code>&rarr;</code> Frame Step</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
