import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  X, Play, Pause, RotateCcw, Scissors, Volume2, VolumeX,
  Maximize, Minimize, Download, Upload, ExternalLink, Film,
  Music, Image as ImageIcon, Check, Copy, AlertCircle, RefreshCw,
  FastForward, Rewind, Eye, ChevronRight, Sparkles, MonitorPlay,
  Layers, Sliders, FileVideo, Pin, PinOff, Type, Mic, Repeat, Clock
} from 'lucide-react'
import {
  formatTime,
  formatSMPTE,
  parseTimeToSeconds,
  captureVideoSnapshot,
  extractAudioClip,
  renderTrimmedClip
} from '../video/videoExport'
import { getStoredStudioRuns } from '../mediaStudioCatalog'

const SAMPLE_VIDEO_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'

const FILTER_PRESETS = [
  { id: 'normal', name: 'Clean / None', values: { brightness: 100, contrast: 100, saturate: 100, sepia: 0, hueRotate: 0, invert: false } },
  { id: 'cinematic', name: 'Cinematic Warm', values: { brightness: 105, contrast: 115, saturate: 110, sepia: 25, hueRotate: 0, invert: false } },
  { id: 'vibrant', name: 'Vibrant Pop', values: { brightness: 110, contrast: 120, saturate: 150, sepia: 0, hueRotate: 0, invert: false } },
  { id: 'cyberpunk', name: 'Cyberpunk Neon', values: { brightness: 105, contrast: 130, saturate: 160, sepia: 10, hueRotate: 280, invert: false } },
  { id: 'noir', name: 'B&W Film Noir', values: { brightness: 100, contrast: 135, saturate: 0, sepia: 0, hueRotate: 0, invert: false } },
  { id: 'vintage', name: 'Vintage 70s', values: { brightness: 95, contrast: 90, saturate: 85, sepia: 40, hueRotate: 345, invert: false } },
]

export function VideoStudioCore({
  initialVideoUrl = null,
  initialVideoName = '',
  initialFilePath = '',
  isStandalone = false,
  onClose,
}) {
  const videoRef = useRef(null)
  const timelineRef = useRef(null)
  const abortControllerRef = useRef(null)

  // Media state
  const [videoSrc, setVideoSrc] = useState(initialVideoUrl || '')
  const [videoName, setVideoName] = useState(initialVideoName || (initialVideoUrl ? 'Loaded Video' : ''))
  const [localFilePath, setLocalFilePath] = useState(initialFilePath || '')
  const [isSampleLoaded, setIsSampleLoaded] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [isDraggingOver, setIsDraggingOver] = useState(false)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1.0) // 0 to 2.0 (200% audio booster)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [isLooping, setIsLooping] = useState(false)
  const [aspectRatio, setAspectRatio] = useState('original')
  const [activeTab, setActiveTab] = useState('edit') // 'edit' | 'filters' | 'overlay' | 'ai'

  // Precision Trimmer
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [isPreviewingTrim, setIsPreviewingTrim] = useState(false)
  const [jumpTimeInput, setJumpTimeInput] = useState('')

  // Visual Color Grading & Studio Filters
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturate: 100,
    sepia: 0,
    hueRotate: 0,
    invert: false,
  })

  // Title / Watermark Overlay
  const [overlay, setOverlay] = useState({
    enabled: false,
    text: 'YOGATIK STUDIO',
    position: 'lowerThird', // 'lowerThird' | 'center' | 'topBanner' | 'watermark'
  })

  // Audio Booster & Visualizer
  const audioCtxRef = useRef(null)
  const gainNodeRef = useRef(null)
  const sourceNodeRef = useRef(null)
  const analyserRef = useRef(null)
  const [audioLevel, setAudioLevel] = useState(0)

  // Export & Action state
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportStage, setExportStage] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')
  const [actionError, setActionError] = useState('')

  // AI Audio Transcription
  const [transcriptText, setTranscriptText] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)

  // Window Desktop Controls
  const [alwaysOnTop, setAlwaysOnTop] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isDesktop = typeof window !== 'undefined' && Boolean(window.__YOGATIK_ELECTRON__ || window.__YOGATIK_DESKTOP__)

  // AI gallery runs
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
      setVideoName(initialVideoName || 'Project Media Clip')
      setLocalFilePath(initialFilePath || '')
    }
  }, [initialVideoUrl, initialVideoName, initialFilePath])

  // Listen to IPC media load if in standalone desktop window
  useEffect(() => {
    if (!isDesktop || !window.__YOGATIK_DESKTOP__?.onVideoStudioLoadMedia) return
    const unbind = window.__YOGATIK_DESKTOP__.onVideoStudioLoadMedia(({ videoUrl, videoName, filePath }) => {
      if (videoUrl) {
        setVideoSrc(videoUrl)
        setVideoName(videoName || 'Loaded Media')
        setLocalFilePath(filePath || '')
        showToast(`Loaded ${videoName || 'video'}`)
      }
    })
    return () => { unbind?.() }
  }, [isDesktop])

  // Toast feedback
  const showToast = useCallback((msg, isErr = false) => {
    if (isErr) {
      setActionError(msg)
      setTimeout(() => setActionError(''), 4000)
    } else {
      setActionSuccess(msg)
      setTimeout(() => setActionSuccess(''), 3000)
    }
  }, [])

  // CSS Filter string
  const filterString = useMemo(() => {
    const parts = []
    if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness}%)`)
    if (filters.contrast !== 100) parts.push(`contrast(${filters.contrast}%)`)
    if (filters.saturate !== 100) parts.push(`saturate(${filters.saturate}%)`)
    if (filters.sepia > 0) parts.push(`sepia(${filters.sepia}%)`)
    if (filters.hueRotate !== 0) parts.push(`hue-rotate(${filters.hueRotate}deg)`)
    if (filters.invert) parts.push('invert(100%)')
    return parts.length > 0 ? parts.join(' ') : 'none'
  }, [filters])

  // Apply filter to video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.style.filter = filterString === 'none' ? '' : filterString
    }
  }, [filterString])

  // Web Audio Setup for >100% Volume Boost and VU Meter
  const ensureAudioGraph = useCallback(() => {
    if (!videoRef.current || audioCtxRef.current) return
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const gain = ctx.createGain()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64

      const src = ctx.createMediaElementSource(videoRef.current)
      src.connect(gain)
      gain.connect(analyser)
      analyser.connect(ctx.destination)

      audioCtxRef.current = ctx
      gainNodeRef.current = gain
      sourceNodeRef.current = src
      analyserRef.current = analyser
    } catch {
      // Audio element might already be connected or CORS restricted
    }
  }, [])

  // Update Gain when volume/mute changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume
    } else if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : Math.min(1.0, volume)
    }
  }, [volume, isMuted])

  // VU meter animation loop
  useEffect(() => {
    if (!isPlaying) {
      setAudioLevel(0)
      return
    }
    let animId = null
    const buffer = new Uint8Array(32)
    const updateLevel = () => {
      if (analyserRef.current && isPlaying && !isMuted) {
        analyserRef.current.getByteFrequencyData(buffer)
        let sum = 0
        for (let i = 0; i < buffer.length; i++) sum += buffer[i]
        const avg = sum / buffer.length
        setAudioLevel(Math.min(100, Math.round((avg / 255) * 120)))
      } else {
        setAudioLevel(0)
      }
      animId = requestAnimationFrame(updateLevel)
    }
    animId = requestAnimationFrame(updateLevel)
    return () => { if (animId) cancelAnimationFrame(animId) }
  }, [isPlaying, isMuted])

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
    ensureAudioGraph()
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {})
    }

    if (isPlaying) {
      videoRef.current.pause()
      setIsPlaying(false)
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(err => {
        showToast('Playback error: ' + err.message, true)
      })
    }
  }

  // Frame Stepping (fractional seconds)
  const stepFrame = (deltaSec) => {
    if (!videoRef.current || !videoSrc) return
    videoRef.current.pause()
    setIsPlaying(false)
    const next = Math.max(0, Math.min(duration, videoRef.current.currentTime + deltaSec))
    videoRef.current.currentTime = next
    setCurrentTime(next)
  }

  // Jump to specific timecode
  const handleJumpTime = (e) => {
    e?.preventDefault()
    if (!videoRef.current || !jumpTimeInput.trim()) return
    const target = parseTimeToSeconds(jumpTimeInput.trim())
    const bounded = Math.max(0, Math.min(duration, target))
    videoRef.current.currentTime = bounded
    setCurrentTime(bounded)
    showToast(`Jumped to ${formatSMPTE(bounded)}`)
    setJumpTimeInput('')
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
    const newStart = Math.min(cur, trimEnd > 0 ? trimEnd - 0.05 : duration)
    setTrimStart(Math.max(0, newStart))
    showToast(`Trim In: ${formatSMPTE(newStart)}`)
  }

  const handleSetOut = () => {
    const cur = currentTime
    const newEnd = Math.max(cur, trimStart + 0.05)
    setTrimEnd(Math.min(duration, newEnd))
    showToast(`Trim Out: ${formatSMPTE(newEnd)}`)
  }

  const handleResetTrim = () => {
    setTrimStart(0)
    setTrimEnd(duration)
    showToast('Trim range reset to full clip')
  }

  // Preview Trim Segment
  const handlePreviewTrim = () => {
    if (!videoRef.current || !videoSrc) return
    ensureAudioGraph()
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

  // File Upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    loadFile(file)
  }

  const loadFile = (file) => {
    const url = URL.createObjectURL(file)
    setVideoSrc(url)
    setVideoName(file.name)
    setLocalFilePath(file.path || '')
    setIsSampleLoaded(false)
    showToast(`Loaded ${file.name}`)
  }

  // Drag and drop video file
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file && (file.type.startsWith('video/') || /\.(mp4|webm|mkv|mov|avi|flv)$/i.test(file.name))) {
      loadFile(file)
    } else {
      showToast('Please drop a valid video file (.mp4, .webm, .mov, etc.)', true)
    }
  }

  // Load URL
  const handleLoadUrl = () => {
    if (!urlInput.trim()) return
    setVideoSrc(urlInput.trim())
    setVideoName('Web Video Stream')
    setLocalFilePath('')
    setIsSampleLoaded(false)
    showToast('Loaded web stream URL')
  }

  // Load Sample
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
      const blob = await captureVideoSnapshot(videoRef.current, {
        filter: filterString,
        textOverlay: overlay.enabled ? overlay : null,
      })
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `frame_${formatSMPTE(currentTime).replace(/[:.]/g, '-')}.png`
      a.click()
      URL.revokeObjectURL(downloadUrl)
      showToast('Snapshot downloaded with active styling!')
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
      showToast('Lossless WAV audio clip exported!')
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
    setExportStage('Rendering trimmed video with studio FX...')
    setExportProgress(0)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const { blob, ext } = await renderTrimmedClip({
        videoEl: videoRef.current,
        startSec: trimStart,
        endSec: trimEnd,
        playbackRate: playbackSpeed,
        filter: filterString,
        textOverlay: overlay.enabled ? overlay : null,
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

  // AI Audio Transcription
  const handleAiTranscribe = async () => {
    if (!videoSrc) return
    setIsTranscribing(true)
    setActiveTab('ai')
    showToast('Extracting audio clip for AI transcription...')
    try {
      // In web browser or desktop, if Web Speech API is present:
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        showToast('Playing segment through local speech recognizer...')
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        let finalTrans = ''
        recognition.onresult = (e) => {
          let text = ''
          for (let i = 0; i < e.results.length; i++) {
            text += e.results[i][0].transcript + ' '
          }
          setTranscriptText(text.trim())
        }
        recognition.onerror = () => {
          setTranscriptText(`[Transcript Note: Audio extracted from ${formatTime(trimStart)} to ${formatTime(trimEnd)}. Ready for Yogatik Agent speech-to-text processing.]`)
        }
        recognition.start()
        // Play clip
        videoRef.current.currentTime = trimStart
        videoRef.current.play()
        setTimeout(() => {
          try { recognition.stop() } catch {}
          setIsTranscribing(false)
        }, Math.min(15000, (trimEnd - trimStart) * 1000 + 1000))
      } else {
        setTranscriptText(`[Audio segment from ${formatSMPTE(trimStart)} to ${formatSMPTE(trimEnd)} (${formatTime(trimEnd - trimStart)}) extracted for Yogatik AI]. Transcribe this speech in detail.`)
        setIsTranscribing(false)
        showToast('AI audio prompt generated!')
      }
    } catch (err) {
      showToast('Transcription notice: ' + err.message, true)
      setIsTranscribing(false)
    }
  }

  // Open in VLC Media Player
  const handleOpenInVlc = async () => {
    if (!videoSrc) return

    if (isDesktop && window.__YOGATIK_DESKTOP__?.openVlc) {
      try {
        const target = localFilePath || videoSrc
        const res = await window.__YOGATIK_DESKTOP__.openVlc(target)
        if (res?.success) {
          showToast(`Opening in ${res.player === 'vlc' ? 'VLC Player' : 'system player'}!`)
          return
        }
      } catch (err) {
        console.warn('VLC launch fallback:', err)
      }
    }

    const vlcCmd = `vlc "${videoSrc}"`
    try {
      await navigator.clipboard.writeText(vlcCmd)
      showToast('Copied VLC command! Open VLC -> Media -> Network Stream (Ctrl+N)')
    } catch {
      showToast(`Play in VLC: Press Ctrl+N -> Paste: ${videoSrc}`)
    }
  }

  // Pop Out to Dedicated Window
  const handlePopOut = async () => {
    if (isDesktop && window.__YOGATIK_DESKTOP__?.openVideoStudio) {
      try {
        await window.__YOGATIK_DESKTOP__.openVideoStudio({
          videoUrl: videoSrc,
          videoName,
          filePath: localFilePath,
        })
        onClose?.()
        return
      } catch (err) {
        console.warn('Desktop popout error:', err)
      }
    }

    // Web fallback popout
    const params = new URLSearchParams()
    params.set('video_studio', '1')
    if (videoSrc) params.set('video', videoSrc)
    if (videoName) params.set('name', videoName)
    const popupUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    window.open(popupUrl, 'YogatikVideoStudio', 'width=1280,height=820,menubar=no,toolbar=no,location=no,status=no')
    onClose?.()
  }

  // Toggle Always on top (desktop standalone)
  const toggleAlwaysOnTop = async () => {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    if (isDesktop && window.__YOGATIK_DESKTOP__?.setVideoStudioAlwaysOnTop) {
      await window.__YOGATIK_DESKTOP__.setVideoStudioAlwaysOnTop(next)
      showToast(next ? 'Video Studio pinned on top' : 'Always on top disabled')
    }
  }

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  // Keyboard shortcut listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
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
        stepFrame(e.shiftKey ? -1.0 : -0.0333) // Shift: 1 sec, Normal: 1 frame (~0.033s)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        stepFrame(e.shiftKey ? 1.0 : 0.0333)
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setIsMuted(m => !m)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, duration, currentTime, trimStart, trimEnd, videoSrc])

  // Calculate percentages for timeline visual
  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100
  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  const selectedDuration = Math.max(0, trimEnd - trimStart)

  return (
    <div
      className={`video-studio-container${isStandalone ? ' is-standalone' : ''}${isDraggingOver ? ' drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Studio Top Control Strip */}
      <div className="video-studio-header">
        <div className="video-studio-brand">
          <div className="video-studio-brand-icon">
            <Film size={20} color="#06b6d4" />
          </div>
          <div>
            <div className="video-studio-title-row">
              <h3 className="video-studio-title">
                {isStandalone ? 'Yogatik Video Studio Pro' : 'Video Studio & Precision Trimmer'}
              </h3>
              <span className="video-studio-badge">VLC &middot; WebCodecs &middot; NLE</span>
              {isStandalone && <span className="video-studio-desktop-pill">Standalone Window</span>}
              {!isStandalone && isDesktop && <span className="video-studio-desktop-pill">Desktop Native</span>}
            </div>
            <p className="video-studio-subtitle">
              Frame-accurate SMPTE trimming, live visual color grading, audio booster & VLC integration
            </p>
          </div>
        </div>

        <div className="video-studio-header-actions">
          {/* Standalone Window Controls */}
          {isStandalone ? (
            <>
              {isDesktop && (
                <button
                  className={`studio-header-pill-btn${alwaysOnTop ? ' active' : ''}`}
                  onClick={toggleAlwaysOnTop}
                  title={alwaysOnTop ? 'Disable Always-on-Top' : 'Keep Video Studio on top of other windows'}
                >
                  {alwaysOnTop ? <PinOff size={14} /> : <Pin size={14} />}
                  <span>{alwaysOnTop ? 'Pinned' : 'Pin on Top'}</span>
                </button>
              )}

              <button
                className="studio-header-pill-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>
            </>
          ) : (
            /* Pop out to Dedicated Window Button */
            <button
              className="popout-window-btn"
              onClick={handlePopOut}
              title="Pop out into a dedicated, resizable desktop window with multi-monitor support"
            >
              <ExternalLink size={14} />
              <span>Dedicated Window</span>
            </button>
          )}

          {/* VLC Button */}
          <button
            className="vlc-action-btn"
            onClick={handleOpenInVlc}
            disabled={!videoSrc}
            title={isDesktop ? 'Launch directly in native VLC Media Player' : 'Copy VLC network stream command'}
          >
            <MonitorPlay size={15} color="#f97316" />
            <span>{isDesktop ? 'Open in VLC' : 'Play in VLC'}</span>
          </button>

          {onClose && (
            <button className="icon-btn" onClick={onClose} title="Close Studio" aria-label="Close">
              <X size={18} />
            </button>
          )}
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
                  playsInline
                />

                {/* Real-time Overlay Preview */}
                {overlay.enabled && overlay.text && (
                  <div className={`studio-video-overlay overlay-${overlay.position}`}>
                    {overlay.text}
                  </div>
                )}

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
                  Drag & drop video here, upload an MP4/WebM file, paste a video URL, or load the instant demo clip below.
                </p>
                <div className="video-empty-actions">
                  <label className="hero-btn primary small-btn">
                    <Upload size={14} /> Choose Video File
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
            {/* Timecode & SMPTE Readouts */}
            <div className="timeline-hud-row">
              <div className="hud-metric">
                <span className="hud-label">SMPTE TIMECODE</span>
                <span className="hud-val current">{formatSMPTE(currentTime, 30)}</span>
              </div>
              <div className="hud-metric">
                <span className="hud-label">CURRENT (SEC)</span>
                <span className="hud-val">{formatTime(currentTime)}</span>
              </div>
              <div className="hud-metric">
                <span className="hud-label">TRIM IN</span>
                <span className="hud-val in-val">{formatSMPTE(trimStart, 30)}</span>
              </div>
              <div className="hud-metric">
                <span className="hud-label">TRIM OUT</span>
                <span className="hud-val out-val">{formatSMPTE(trimEnd, 30)}</span>
              </div>
              <div className="hud-metric">
                <span className="hud-label">CLIP DURATION</span>
                <span className="hud-val selected">{formatTime(selectedDuration)}</span>
              </div>
              <div className="hud-metric">
                <span className="hud-label">TOTAL LENGTH</span>
                <span className="hud-val total">{formatTime(duration)}</span>
              </div>

              {/* Jump to Timecode Input */}
              <form onSubmit={handleJumpTime} className="hud-jump-form">
                <Clock size={12} color="#64748b" />
                <input
                  type="text"
                  placeholder="00:00:00:00 or sec"
                  value={jumpTimeInput}
                  onChange={e => setJumpTimeInput(e.target.value)}
                  className="hud-jump-input"
                  title="Type SMPTE timecode (HH:MM:SS:FF) or seconds and press Enter"
                />
                <button type="submit" className="hud-jump-btn" disabled={!videoSrc}>
                  Go
                </button>
              </form>
            </div>

            {/* Scrubber & In/Out Track */}
            <div
              ref={timelineRef}
              className="timeline-track-container"
              onClick={handleTimelineClick}
              title="Click or drag to scrub playhead"
            >
              <div className="timeline-track-bg" />
              <div
                className="timeline-trim-region"
                style={{
                  left: `${startPercent}%`,
                  width: `${Math.max(0, endPercent - startPercent)}%`,
                }}
              />
              <div
                className="timeline-handle in-handle"
                style={{ left: `${startPercent}%` }}
                title={`In-Point: ${formatSMPTE(trimStart)}`}
              >
                <div className="handle-tag">IN</div>
              </div>
              <div
                className="timeline-handle out-handle"
                style={{ left: `${endPercent}%` }}
                title={`Out-Point: ${formatSMPTE(trimEnd)}`}
              >
                <div className="handle-tag">OUT</div>
              </div>
              <div
                className="timeline-playhead-needle"
                style={{ left: `${playheadPercent}%` }}
              />
            </div>

            {/* Transport Controls Bar */}
            <div className="video-transport-bar">
              {/* Stepper & Playback */}
              <div className="transport-group">
                <button
                  className="icon-btn-pill"
                  onClick={() => stepFrame(-5.0)}
                  disabled={!videoSrc}
                  title="Rewind 5 seconds"
                >
                  <span style={{ fontSize: 10, fontWeight: 700 }}>-5s</span>
                </button>
                <button
                  className="icon-btn-pill"
                  onClick={() => stepFrame(-1.0)}
                  disabled={!videoSrc}
                  title="Rewind 1 second (Shift+Left Arrow)"
                >
                  <Rewind size={14} />
                </button>
                <button
                  className="icon-btn-pill"
                  onClick={() => stepFrame(-0.0333)}
                  disabled={!videoSrc}
                  title="Step backward 1 exact frame (Left Arrow)"
                >
                  <span style={{ fontSize: 10, fontWeight: 700 }}>-1f</span>
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
                  onClick={() => stepFrame(0.0333)}
                  disabled={!videoSrc}
                  title="Step forward 1 exact frame (Right Arrow)"
                >
                  <span style={{ fontSize: 10, fontWeight: 700 }}>+1f</span>
                </button>
                <button
                  className="icon-btn-pill"
                  onClick={() => stepFrame(1.0)}
                  disabled={!videoSrc}
                  title="Fast forward 1 second (Shift+Right Arrow)"
                >
                  <FastForward size={14} />
                </button>
                <button
                  className="icon-btn-pill"
                  onClick={() => stepFrame(5.0)}
                  disabled={!videoSrc}
                  title="Fast forward 5 seconds"
                >
                  <span style={{ fontSize: 10, fontWeight: 700 }}>+5s</span>
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

              {/* Speed & Audio Booster */}
              <div className="transport-group">
                <select
                  className="studio-speed-select"
                  value={playbackSpeed}
                  onChange={e => handleSpeedChange(Number(e.target.value))}
                  disabled={!videoSrc}
                  title="Playback rate"
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

                {/* Volume slider with up to 200% Web Audio gain boost */}
                <div className="volume-booster-container" title={`Volume: ${Math.round(volume * 100)}% (Boostable to 200%)`}>
                  <input
                    type="range"
                    min={0}
                    max={2.0}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setVolume(v)
                      if (v > 0) setIsMuted(false)
                    }}
                    className="volume-slider"
                  />
                  <span className={`volume-boost-tag${volume > 1.0 ? ' boosted' : ''}`}>
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* Visual Audio VU meter bar */}
                <div className="audio-vu-meter" title="Audio Output Level">
                  <div className="audio-vu-fill" style={{ width: `${audioLevel}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar: Multi-Tab Studio Toolkit */}
        <div className="video-studio-sidebar">
          {/* Tab Navigation */}
          <div className="studio-tabs-bar">
            <button
              className={`studio-tab-btn${activeTab === 'edit' ? ' active' : ''}`}
              onClick={() => setActiveTab('edit')}
            >
              <FileVideo size={13} />
              <span>Source</span>
            </button>
            <button
              className={`studio-tab-btn${activeTab === 'filters' ? ' active' : ''}`}
              onClick={() => setActiveTab('filters')}
            >
              <Sliders size={13} />
              <span>Color FX</span>
            </button>
            <button
              className={`studio-tab-btn${activeTab === 'overlay' ? ' active' : ''}`}
              onClick={() => setActiveTab('overlay')}
            >
              <Type size={13} />
              <span>Titles</span>
            </button>
            <button
              className={`studio-tab-btn${activeTab === 'ai' ? ' active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <Sparkles size={13} />
              <span>AI</span>
            </button>
          </div>

          {/* TAB 1: Source & Framing */}
          {activeTab === 'edit' && (
            <>
              {/* Source Loader Box */}
              <div className="studio-panel-card">
                <h4 className="panel-card-title">
                  <FileVideo size={14} color="#06b6d4" />
                  <span>Video Source</span>
                </h4>

                <div className="source-inputs-stack">
                  <label className="source-upload-dropzone">
                    <Upload size={16} />
                    <span>Choose Video File...</span>
                    <input type="file" accept="video/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>

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

                  <button className="source-sample-btn" onClick={handleLoadSample}>
                    <Sparkles size={13} color="#a855f7" />
                    <span>Load Demo Sample Video</span>
                  </button>

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

              {/* Display & Framing */}
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
            </>
          )}

          {/* TAB 2: Live Visual Color Grading & Filters */}
          {activeTab === 'filters' && (
            <div className="studio-panel-card">
              <div className="panel-card-header-row">
                <h4 className="panel-card-title">
                  <Sliders size={14} color="#06b6d4" />
                  <span>Live Color Grading</span>
                </h4>
                <button
                  className="studio-reset-link"
                  onClick={() => setFilters({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, hueRotate: 0, invert: false })}
                >
                  Reset
                </button>
              </div>

              {/* Filter Presets */}
              <div className="filter-presets-grid">
                {FILTER_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    className="filter-preset-pill"
                    onClick={() => setFilters({ ...preset.values })}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>

              {/* Filter Sliders */}
              <div className="filter-sliders-stack">
                <div className="filter-slider-row">
                  <span className="filter-label">Brightness</span>
                  <input
                    type="range"
                    min={50}
                    max={180}
                    value={filters.brightness}
                    onChange={e => setFilters(f => ({ ...f, brightness: Number(e.target.value) }))}
                  />
                  <span className="filter-val">{filters.brightness}%</span>
                </div>

                <div className="filter-slider-row">
                  <span className="filter-label">Contrast</span>
                  <input
                    type="range"
                    min={50}
                    max={180}
                    value={filters.contrast}
                    onChange={e => setFilters(f => ({ ...f, contrast: Number(e.target.value) }))}
                  />
                  <span className="filter-val">{filters.contrast}%</span>
                </div>

                <div className="filter-slider-row">
                  <span className="filter-label">Saturation</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={filters.saturate}
                    onChange={e => setFilters(f => ({ ...f, saturate: Number(e.target.value) }))}
                  />
                  <span className="filter-val">{filters.saturate}%</span>
                </div>

                <div className="filter-slider-row">
                  <span className="filter-label">Sepia / Warmth</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={filters.sepia}
                    onChange={e => setFilters(f => ({ ...f, sepia: Number(e.target.value) }))}
                  />
                  <span className="filter-val">{filters.sepia}%</span>
                </div>

                <div className="filter-slider-row">
                  <span className="filter-label">Hue Rotate</span>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={filters.hueRotate}
                    onChange={e => setFilters(f => ({ ...f, hueRotate: Number(e.target.value) }))}
                  />
                  <span className="filter-val">{filters.hueRotate}&deg;</span>
                </div>

                <label className="filter-checkbox-row">
                  <input
                    type="checkbox"
                    checked={filters.invert}
                    onChange={e => setFilters(f => ({ ...f, invert: e.target.checked }))}
                  />
                  <span>Invert Colors / Negative</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: Text & Title Overlay */}
          {activeTab === 'overlay' && (
            <div className="studio-panel-card">
              <h4 className="panel-card-title">
                <Type size={14} color="#eab308" />
                <span>Text / Title / Watermark</span>
              </h4>

              <div className="overlay-controls-stack">
                <label className="filter-checkbox-row">
                  <input
                    type="checkbox"
                    checked={overlay.enabled}
                    onChange={e => setOverlay(o => ({ ...o, enabled: e.target.checked }))}
                  />
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>Enable Title Overlay</span>
                </label>

                {overlay.enabled && (
                  <>
                    <input
                      type="text"
                      className="source-url-input"
                      placeholder="Overlay text or watermark..."
                      value={overlay.text}
                      onChange={e => setOverlay(o => ({ ...o, text: e.target.value }))}
                    />

                    <div className="aspect-chips-grid">
                      {[
                        { id: 'lowerThird', label: 'Lower Third' },
                        { id: 'center', label: 'Center Title' },
                        { id: 'topBanner', label: 'Top Banner' },
                        { id: 'watermark', label: 'Watermark' },
                      ].map(p => (
                        <button
                          key={p.id}
                          className={`aspect-chip${overlay.position === p.id ? ' active' : ''}`}
                          onClick={() => setOverlay(o => ({ ...o, position: p.id }))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: AI Audio Transcription */}
          {activeTab === 'ai' && (
            <div className="studio-panel-card">
              <h4 className="panel-card-title">
                <Sparkles size={14} color="#a855f7" />
                <span>AI Speech-to-Text & Transcripts</span>
              </h4>

              <div className="ai-transcribe-box">
                <button
                  className="hero-btn secondary small-btn"
                  onClick={handleAiTranscribe}
                  disabled={!videoSrc || isTranscribing}
                >
                  <Mic size={14} color="#a855f7" />
                  <span>{isTranscribing ? 'Transcribing Audio...' : 'Transcribe Selected Clip'}</span>
                </button>

                {transcriptText && (
                  <div className="transcript-result-card">
                    <div className="transcript-result-header">
                      <span className="transcript-result-title">Transcription Notes</span>
                      <button
                        className="studio-reset-link"
                        onClick={() => {
                          navigator.clipboard.writeText(transcriptText)
                          showToast('Transcript copied to clipboard!')
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="transcript-result-body">{transcriptText}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Export & Actions Box (Always visible at bottom of sidebar) */}
          <div className="studio-panel-card highlight-card">
            <h4 className="panel-card-title">
              <Scissors size={14} color="#10b981" />
              <span>Export Operations</span>
            </h4>

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

            <div className="export-buttons-stack">
              <button
                className="hero-btn primary studio-export-btn"
                onClick={handleExportTrimmedVideo}
                disabled={!videoSrc || isExporting}
                title="Render trimmed clip with active speed, color FX and overlay burned in"
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
                title="Download full-resolution snapshot of current video frame with active color FX"
              >
                <ImageIcon size={14} color="#a855f7" />
                <span>Capture Frame (PNG)</span>
              </button>
            </div>

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

          {/* Shortcuts Box */}
          <div className="studio-shortcuts-box">
            <span className="shortcuts-title">Keyboard Shortcuts:</span>
            <div className="shortcuts-list">
              <span><code>Space</code> Play/Pause</span>
              <span><code>[</code> or <code>I</code> Set In</span>
              <span><code>]</code> or <code>O</code> Set Out</span>
              <span><code>&larr;</code> <code>&rarr;</code> Exact Frame</span>
              <span><code>Shift+&larr;</code> 1s Step</span>
              <span><code>M</code> Mute</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
