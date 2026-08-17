import React from 'react'
import {
  Wrench, Image, Code, CloudSun, Calculator, Languages, Youtube, Link,
  ScanLine, QrCode, FileText, AudioLines, Hash, Regex, ArrowLeftRight,
  Palette, Search, GitCompare, Ruler, MapPin, Rss, Eye, FileDown, Volume2,
  Telescope, FileSearch, Files, ExternalLink, Sliders,
  BookOpen, GraduationCap, MessageSquare, Archive, BookA, Library,
  Package, BookMarked, Banknote, Activity, Film, Sparkles, Copy, Check, Users, Clock,
  Briefcase, Share2, AlarmClock, Bell, Plug, Monitor, MousePointer, Compass, Laptop
} from 'lucide-react'
import { getMedia } from '../db'
import { diagnoseError } from '../errorLog'
import { sanitizeSvg } from '../sanitize'

// Standardised, friendly failure card: a plain-language line from diagnoseError
// plus a collapsible "View details" holding the raw error for debugging.
// Replaces the bare `result.error` dump (Phase-1 pain-point: "error messages
// are cryptic"). Kept as a small local component so every tool failure — no
// matter which branch produced it — renders the same way.
function ToolErrorCard({ Icon, tool, error }) {
  const [open, setOpen] = React.useState(false)
  const raw = error || 'Unknown error'
  const d = diagnoseError(raw)
  return (
    <div className="tool-result-card error" role="alert">
      <div className="tool-result-header"><Icon size={14} /> {tool} — {d.category || 'Failed'}</div>
      <p className="tool-error-friendly">{d.title}</p>
      <p className="tool-error-hint">{d.suggestion}</p>
      <button
        className="tool-error-toggle"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'Hide details' : 'View details'}
      </button>
      {open && (
        <div className="tool-error-details" style={{ position: 'relative' }}>
          <CopyButton text={raw} title="Copy error" style={{ position: 'absolute', top: 4, right: 4 }} />
          <pre style={{ margin: 0, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{raw}</pre>
        </div>
      )}
    </div>
  )
}

// Diagram-SVG sanitisation now lives in ../sanitize (sanitizeSvg), shared with
// any other externally-sourced markup sink.

// Reusable copy button with transient "copied" feedback (replaces 7 duplicated inline handlers)
export function CopyButton({ text, title = 'Copy', className = 'copy-btn', style, iconSize = 10, label }) {
  const [copied, setCopied] = React.useState(false)
  const onClick = async () => {
    try { await navigator.clipboard.writeText((text ?? '').toString()) } catch { return }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={onClick} className={className} title={copied ? 'Copied' : title} style={style}>
      {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      {label ? ' ' + (copied ? 'Copied' : label) : ''}
    </button>
  )
}

export const TOOL_ICONS = {
  weather: CloudSun, image_generate: Image, code_execute: Code, video_render: Film,
  calculator: Calculator, translate: Languages, youtube: Youtube,
  web_extract: Link, web_search: Search, deep_research: Telescope,
  doc_search: FileSearch, doc_list: Files, chart: Image, tts: Volume2,
  package_info: Package, gutenberg: BookMarked, geocode: MapPin,
  currency: Banknote, earthquake: Activity,
  wikipedia: BookOpen, scholar: GraduationCap, stackoverflow: Code,
  hackernews: MessageSquare, archive: Archive, dictionary: BookA, books: Library,
  ocr: ScanLine, qr_generate: QrCode, qr_read: QrCode,
  pdf_extract: FileText, stt: AudioLines, summarize: FileText,
  rss_feed: Rss, hash: Hash, regex: Regex, data_convert: ArrowLeftRight,
  color_palette: Palette, whois: Search, diagram: GitCompare,
  audio_edit: AudioLines, image_info: Eye, link_preview: Link, text_to_audio: Volume2,
  air_quality: Activity, grammar_check: FileText, js_execute: Code, memory: BookMarked,
  diff: GitCompare, unit_convert: Ruler, ip_lookup: MapPin,
  md_to_pdf: FileDown, diagram_render: GitCompare, code_format: Code,
  text_analytics: FileText, data_stats: Activity, keyword_extract: Search,
  entity_extract: BookOpen, query_refine: Sliders, doc_export: FileDown,
  sticker_generate: Sparkles, spawn_agents: Users, terminal_run: Code,
  timer: AlarmClock, alarm: AlarmClock, scheduler: AlarmClock,
  social_search: Share2, job_search: Briefcase, social_post_generator: MessageSquare,
  // MCP tools get the Plug icon
  mcp: Plug,
  screen_inspect: Monitor,
  desktop_action: MousePointer,
  browser_autopilot: Compass,
}

/**
 * A rendered video, playable now and after a reload.
 *
 * The blob: URL in the result dies with the page, so the bytes are also stored
 * in IndexedDB; on a restored message we make a fresh object URL from them and
 * revoke it on unmount.
 */
function RenderedVideo({ result }) {
  const [src, setSrc] = React.useState(result.video_url || null)
  const [gone, setGone] = React.useState(false)

  React.useEffect(() => {
    if (src || !result.media_id) return
    let url = null
    let cancelled = false
    getMedia(result.media_id).then((row) => {
      if (cancelled) return
      if (!row?.blob) { setGone(true); return }
      url = URL.createObjectURL(row.blob)
      setSrc(url)
    }).catch(() => setGone(true))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [result.media_id, src])

  const mb = result.bytes ? (result.bytes / 1048576).toFixed(1) : null

  return (
    <div className="tool-result-card">
      <div className="tool-result-header"><Film size={14} /> Rendered Video</div>
      {src
        ? <video src={src} className="generated-video" controls playsInline preload="metadata" />
        : <p className="tool-detail">{gone ? 'This video was cleared to make room for newer ones.' : 'Loading video…'}</p>}
      <p className="tool-prompt">
        {result.resolution} · {result.fps}fps · {result.duration_sec}s{mb ? ` · ${mb} MB` : ''}
        {result.narrated ? ' · narrated' : ''}
        {result.render_ms ? ` · encoded in ${(result.render_ms / 1000).toFixed(1)}s` : ''}
      </p>
      {src && (
        <a className="small-btn" href={src} download={result.filename}>
          <FileDown size={12} /> Download {result.filename?.endsWith('.mp4') ? 'MP4' : 'WebM'}
        </a>
      )}
    </div>
  )
}

/** On-device narration audio. Same media-store recovery as video. */
function RenderedAudio({ result }) {
  const [src, setSrc] = React.useState(result.audio_url || null)
  const [gone, setGone] = React.useState(false)

  React.useEffect(() => {
    if (src || !result.media_id) return
    let url = null, cancelled = false
    getMedia(result.media_id).then((row) => {
      if (cancelled) return
      if (!row?.blob) { setGone(true); return }
      url = URL.createObjectURL(row.blob)
      setSrc(url)
    }).catch(() => setGone(true))
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [result.media_id, src])

  return (
    <div className="tool-result-card">
      <div className="tool-result-header"><Volume2 size={14} /> Narrated Audio</div>
      {src
        ? <audio src={src} controls preload="metadata" style={{ width: '100%', marginTop: 6 }} />
        : <p className="tool-detail">{gone ? 'This audio was cleared to make room for newer files.' : 'Loading audio…'}</p>}
      <p className="tool-prompt">
        {result.duration_sec}s · {result.voice}{result.bytes ? ` · ${(result.bytes / 1048576).toFixed(1)} MB` : ''}
      </p>
      {src && (
        <a className="small-btn" href={src} download={result.filename}>
          <FileDown size={12} /> Download WAV
        </a>
      )}
    </div>
  )
}

/** Files a tool produced (e.g. code_execute writing a PDF), as download links.
 *  Bytes live in the media store; a fresh object URL is minted on demand. */
function RenderedFiles({ files }) {
  const download = async (f) => {
    try {
      const row = await getMedia(f.media_id)
      if (!row?.blob) return
      const url = URL.createObjectURL(row.blob)
      const a = document.createElement('a')
      a.href = url; a.download = f.name; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch { /* cleared */ }
  }
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {files.map((f, i) => (
        <button key={i} className="small-btn" onClick={() => download(f)} title={`${f.mime} · ${f.bytes} bytes`}>
          <FileDown size={12} /> {f.name}{f.bytes ? ` (${(f.bytes / 1024).toFixed(0)} KB)` : ''}
        </button>
      ))}
    </div>
  )
}

// ─── Tool Result Display ───
/**
 * Memoised: a card can hold a rendered image, video or chart, and re-running
 * that for every animation frame of the surrounding answer was pure waste.
 * Results are immutable once produced, so identity comparison is enough.
 */
const ToolResultCard = React.memo(function ToolResultCard({ tool, result }) {
  if (tool === 'text_to_audio' && result?.success !== false && (result.audio_url || result.media_id)) {
    return <RenderedAudio result={result} />
  }
  const Icon = TOOL_ICONS[tool] || Wrench
  if (!result || result.success === false) {
    return <ToolErrorCard Icon={Icon} tool={tool} error={result?.error} />
  }

  if (tool === 'spawn_agents' && Array.isArray(result.results)) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Users size={14} /> Delegated to {result.delegated} agent{result.delegated === 1 ? '' : 's'}</div>
        {result.results.map((r, i) => (
          <div key={i} style={{ marginTop: 8 }}>
            <div className="personalise-sub" style={{ fontWeight: 600, marginBottom: 2 }}>{r.agent} <span style={{ opacity: .6 }}>· {r.role}</span></div>
            <div className="code-output" style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto', padding: 10, fontSize: 13 }}>{r.result}</div>
          </div>
        ))}
      </div>
    )
  }

  if (tool === 'image_generate' && result.image_url) {
    const imgSrc = result.display_url || result.image_url
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Generated Image</div>
        <img src={imgSrc} alt={result.prompt}
          className="generated-image" loading="lazy"
          onError={e => {
            if (result.image_url && e.currentTarget.src !== result.image_url) {
              e.currentTarget.src = result.image_url
            }
          }} />
        <p className="tool-prompt">Prompt: "{result.prompt}"</p>
        <a
          href={imgSrc}
          download="generated_image.png"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent-color, #ff6b35)', color: '#fff',
            textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, marginTop: 6,
          }}
        >
          <FileDown size={14} /> Download Image
        </a>
      </div>
    )
  }

  if (tool === 'sticker_generate' && (result.display_url || result.image_url)) {
    const imgSrc = result.display_url || result.image_url
    return (
      <div className="tool-result-card" style={{ borderLeft: '4px solid var(--accent-color, #ff6b35)' }}>
        <div className="tool-result-header"><Sparkles size={14} /> Sticker Graphic ({result.style || 'Vector'})</div>
        <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 8, margin: '8px 0' }}>
          <img src={imgSrc} alt={result.prompt} className="generated-image" style={{ maxHeight: 220, objectFit: 'contain' }} />
        </div>
        <p className="tool-prompt">Prompt: "{result.prompt}"</p>
        <a
          href={imgSrc}
          download={`sticker_${(result.prompt || 'graphic').toLowerCase().replace(/\s+/g, '_')}.png`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent-color, #ff6b35)', color: '#fff',
            textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, marginTop: 6,
          }}
        >
          <FileDown size={14} /> Download Sticker Graphic
        </a>
      </div>
    )
  }

  if (tool === 'video_render' && (result.video_url || result.media_id)) {
    return <RenderedVideo result={result} />
  }

  if (tool === 'chart' && result.image_url) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Chart</div>
        <img src={result.image_url} alt={result.title || 'Chart'}
          className="generated-image" loading="lazy" />
        <a
          href={result.image_url}
          download="chart.png"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent-color, #ff6b35)', color: '#fff',
            textDecoration: 'none', padding: '4px 10px', borderRadius: 6,
            fontSize: 12, fontWeight: 600, marginTop: 6,
          }}
        >
          <FileDown size={14} /> Download Chart
        </a>
      </div>
    )
  }

   if (tool === 'code_execute') {
     return (
       <div className="tool-result-card">
         <div className="tool-result-header">
           <Code size={14} /> Code Execution
           {result.execution_time && (
             <span className="tool-result-meta">
               {(result.execution_time / 1000).toFixed(2)}s
             </span>
           )}
         </div>
         {result.stdout && (
           <>
             <div className="tool-detail" style={{ marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
               Standard Output:
             </div>
             <div className="code-output" style={{ position: 'relative' }}>
               <CopyButton text={result.stdout} title="Copy output" style={{
                   position: 'absolute', top: 4, right: 4,
                   background: 'var(--bg-input)', border: '1px solid var(--border)',
                   borderRadius: 3, padding: '2px 4px', fontSize: 10, cursor: 'pointer'
                 }} />
               <pre className="code-output" style={{ margin: 0, overflowX: 'auto' }}>{result.stdout}</pre>
             </div>
           </>
         )}
         {result.stderr && (
           <>
             <div className="tool-detail" style={{ marginTop: 12, marginBottom: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
               Standard Error:
             </div>
             <div className="code-output error" style={{ position: 'relative' }}>
               <CopyButton text={result.stderr} title="Copy error" style={{
                   position: 'absolute', top: 4, right: 4,
                   background: 'var(--bg-input)', border: '1px solid var(--border)',
                   borderRadius: 3, padding: '2px 4px', fontSize: 10, cursor: 'pointer'
                 }} />
               <pre className="code-output error" style={{ margin: 0, overflowX: 'auto' }}>{result.stderr}</pre>
             </div>
           </>
         )}
         {(result.output && !result.stdout && !result.stderr) && (
           <>
             <div className="code-output" style={{ position: 'relative' }}>
               <CopyButton text={result.output} title="Copy output" style={{
                   position: 'absolute', top: 4, right: 4,
                   background: 'var(--bg-input)', border: '1px solid var(--border)',
                   borderRadius: 3, padding: '2px 4px', fontSize: 10, cursor: 'pointer'
                 }} />
               <pre className="code-output" style={{ margin: 0, overflowX: 'auto' }}>{result.output}</pre>
             </div>
           </>
         )}
         {result.files?.length > 0 && <RenderedFiles files={result.files} />}
       </div>
     );
   }

  if (tool === 'weather' && result.current) {
    const c = result.current
    return (
      <div className="tool-result-card weather-card">
        <div className="tool-result-header"><CloudSun size={14} /> {result.location}</div>
        <div className="weather-current">
          <span className="weather-temp">{c.temperature}°C</span>
          <span className="weather-condition">{c.condition}</span>
        </div>
        <div className="weather-details">
          Feels like {c.feels_like}°C · Humidity {c.humidity}% · Wind {c.wind_speed} km/h
        </div>
        {result.forecast && (
          <div className="weather-forecast">
            {result.forecast.slice(0, 5).map((f, i) => (
              <div key={i} className="forecast-day">
                <span className="forecast-date">{new Date(f.date).toLocaleDateString('en', { weekday: 'short' })}</span>
                <span>{f.low}°–{f.high}°</span>
                <span className="forecast-cond">{f.condition}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (tool === 'calculator') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Calculator size={14} /> Calculator</div>
        <div className="calc-result">{result.formatted || String(result.result)}</div>
      </div>
    )
  }

   if (tool === 'translate') {
     return (
       <div className="tool-result-card">
         <div className="tool-result-header">
           <Languages size={14} /> Translation ({result.source_lang} → {result.target_lang})
           {result.source_text && result.translated && (
             <div className="tool-result-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
               {Math.round((1 - (result.translated.length || 0) / (result.source_text.length || 1)) * 100)}% length change
             </div>
           )}
         </div>
         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '12px' }}>
           <div>
             <div className="tool-detail" style={{ marginBottom: '4px', fontSize: 12, color: 'var(--text-secondary)' }}>
               Original Text ({result.source_lang})
             </div>
             <div className="translation-original" style={{ position: 'relative', background: 'var(--bg-input)', borderRadius: 6, padding: '12px', minHeight: '60px' }}>
               <CopyButton text={result.source_text} title="Copy original" style={{
                   position: 'absolute', top: 8, right: 8,
                   background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                   borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer'
                 }} />
               <p style={{ margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{result.source_text}</p>
             </div>
           </div>
           <div>
             <div className="tool-detail" style={{ marginBottom: '4px', fontSize: 12, color: 'var(--text-secondary)' }}>
               Translated Text ({result.target_lang})
             </div>
             <div className="translation-result" style={{ position: 'relative', background: 'var(--bg-tertiary)', borderRadius: 6, padding: '12px', minHeight: '60px' }}>
               <CopyButton text={result.translated} title="Copy translation" style={{
                   position: 'absolute', top: 8, right: 8,
                   background: 'var(--bg-input)', border: '1px solid var(--border)',
                   borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer'
                 }} />
               <p style={{ margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{result.translated}</p>
             </div>
           </div>
         </div>
       </div>
     )
   }

   if (tool === 'unit_convert') {
     return (
       <div className="tool-result-card">
         <div className="tool-result-header">
           <Ruler size={14} /> Unit Conversion
           {result.formula && (
             <div className="tool-result-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
               {result.formula}
             </div>
           )}
         </div>
         <div className="calc-result">{result.formatted || result.output}</div>
         {result.explanation && (
           <div className="tool-detail" style={{ marginTop: '12px', fontSize: 12, color: 'var(--text-secondary)' }}>
             {result.explanation}
           </div>
         )}
         <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
           <CopyButton text={result.formatted || result.output} title="Copy Result"
             className="small-btn" iconSize={12} label="Copy Result"
             style={{ padding: '4px 8px', fontSize: 12 }} />
         </div>
       </div>
     )
   }

   if (tool === 'hash') {
     return (
       <div className="tool-result-card">
         <div className="tool-result-header">
           <Hash size={14} /> {result.algorithm?.toUpperCase()}
           {result.input_length && (
             <div className="tool-result-meta" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
               {result.input_length} characters hashed
             </div>
           )}
         </div>
         <div className="code-output" style={{ position: 'relative', wordBreak: 'break-all', background: 'var(--code-bg)', padding: '12px', borderRadius: 6, marginTop: '8px' }}>
           <CopyButton text={result.result} title="Copy hash" style={{
               position: 'absolute', top: 8, right: 8,
               background: 'var(--bg-input)', border: '1px solid var(--border)',
               borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer'
             }} />
           <div style={{ margin: 0, fontFamily: 'monospace' }}>{result.result}</div>
         </div>
         {result.alternatives && result.alternatives.length > 0 && (
           <div className="tool-detail" style={{ marginTop: '12px', fontSize: 12, color: 'var(--text-secondary)' }}>
             Also available as:
             <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
               {result.alternatives.map((alt, index) => (
                 <div key={index} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11 }}>
                   {alt.label}: <code style={{ fontFamily: 'monospace', background: 'var(--code-bg)', padding: '2px 4px', borderRadius: 3 }}>{alt.value}</code>
                 </div>
               ))}
             </div>
           </div>
         )}
       </div>
     )
   }

  if (tool === 'ip_lookup' && result.ip) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><MapPin size={14} /> IP Lookup: {result.ip}</div>
        <div className="tool-detail">{result.city}, {result.region}, {result.country}</div>
        <div className="tool-detail">ISP: {result.isp} · TZ: {result.timezone}</div>
      </div>
    )
  }

  if (tool === 'whois' && result.domain) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Search size={14} /> WHOIS: {result.domain}</div>
        <div className="tool-detail">Registrar: {result.registrar}</div>
        <div className="tool-detail">Created: {result.creation_date} · Expires: {result.expiration_date}</div>
      </div>
    )
  }

  if (tool === 'rss_feed' && result.items) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Rss size={14} /> {result.feed_title || 'RSS Feed'}</div>
        {result.items.slice(0, 5).map((item, i) => (
          <div key={i} className="tool-detail">
            <a href={item.link} target="_blank" rel="noopener">{item.title}</a>
          </div>
        ))}
      </div>
    )
  }

  if (tool === 'qr_generate' && result.image_url) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><QrCode size={14} /> QR Code</div>
        <img src={result.image_url} alt={`QR code for ${result.data || ''}`} className="generated-image" style={{ maxWidth: 200 }} />
      </div>
    )
  }

  if (tool === 'summarize' && result.summary) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><FileText size={14} /> Summary</div>
        <p className="translation-result">{result.summary}</p>
      </div>
    )
  }

  if (tool === 'keyword_extract' && (result.keywords || result.phrases)) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Search size={14} /> Keywords</div>
        {result.search_query && (
          <div className="tool-detail" style={{ margin: '8px 0', fontSize: 13 }}>
            Search query: <code>{result.search_query}</code>
          </div>
        )}
        {result.keywords?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {result.keywords.map(item => (
              <span key={item.term} style={{
                padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)', fontSize: 12,
              }}>
                {item.term}
              </span>
            ))}
          </div>
        )}
        {result.phrases?.length > 0 && (
          <div className="tool-detail" style={{ fontSize: 13 }}>
            <strong>Key phrases:</strong> {result.phrases.map(p => p.term).join(' · ')}
          </div>
        )}
      </div>
    )
  }

  if (tool === 'entity_extract' && (
    result.people?.length || result.organizations?.length || result.locations?.length ||
    result.dates?.length || result.urls?.length || result.emails?.length || result.numbers?.length
  )) {
    const renderGroup = (label, values) => values?.length ? (
      <div className="tool-detail" style={{ marginTop: 6, fontSize: 13 }}>
        <strong>{label}:</strong> {values.join(' · ')}
      </div>
    ) : null
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><BookOpen size={14} /> Entities</div>
        {renderGroup('People', result.people)}
        {renderGroup('Organizations', result.organizations)}
        {renderGroup('Locations', result.locations)}
        {renderGroup('Dates', result.dates)}
        {renderGroup('Numbers', result.numbers)}
        {renderGroup('Emails', result.emails)}
        {renderGroup('URLs', result.urls)}
        {result.acronyms?.length > 0 && renderGroup('Acronyms', result.acronyms)}
        {result.proper_nouns?.length > 0 && renderGroup('Other proper nouns', result.proper_nouns)}
      </div>
    )
  }

  if (tool === 'query_refine' && (result.search_query || result.cleaned_query || result.subqueries)) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Sliders size={14} /> Query Refiner</div>
        {result.intent && (
          <div className="tool-detail" style={{ margin: '4px 0', fontSize: 13 }}>
            Intent: <strong>{result.intent}</strong>
          </div>
        )}
        {result.cleaned_query && (
          <div className="tool-detail" style={{ margin: '4px 0', fontSize: 13 }}>
            Cleaned: {result.cleaned_query}
          </div>
        )}
        {result.search_query && (
          <div className="tool-detail" style={{ margin: '4px 0', fontSize: 13 }}>
            Search query: <code>{result.search_query}</code>
          </div>
        )}
        {result.subqueries?.length > 0 && (
          <div className="tool-detail" style={{ marginTop: 6, fontSize: 13 }}>
            <strong>Subqueries:</strong> {result.subqueries.join(' | ')}
          </div>
        )}
        {result.suggested_tools?.length > 0 && (
          <div className="tool-detail" style={{ marginTop: 6, fontSize: 13 }}>
            <strong>Suggested tools:</strong> {result.suggested_tools.join(', ')}
          </div>
        )}
      </div>
    )
  }

  if (tool === 'diagram' && result.svg) {
    const svg = sanitizeSvg(result.svg)
    if (!svg) return null
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><GitCompare size={14} /> Diagram</div>
        {/* Mermaid renders to SVG in-browser; no backend image endpoint exists */}
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    )
  }

  if (tool === 'diff') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><GitCompare size={14} /> Diff — {(result.similarity * 100).toFixed(1)}% similar</div>
        <pre className="code-output">{result.diff}</pre>
      </div>
    )
  }

  if (tool === 'link_preview' && result.title) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Link size={14} /> Link Preview</div>
        {result.image && <img src={result.image} alt="" className="generated-image" style={{ maxHeight: 150 }} />}
        <div className="tool-detail"><strong>{result.title}</strong></div>
        {result.description && <div className="tool-detail">{result.description}</div>}
      </div>
    )
  }

  if (tool === 'md_to_pdf' && result.filename) {
    const handleDownloadPdf = () => {
      if (result.pdf_data_url) {
        const a = document.createElement('a')
        a.href = result.pdf_data_url
        a.download = result.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    }
    return (
      <div className="tool-result-card" style={{ borderLeft: '4px solid var(--accent-color, #ff6b35)' }}>
        <div className="tool-result-header">
          <FileDown size={14} /> PDF Document Ready
        </div>
        <div className="tool-detail" style={{ margin: '8px 0', fontSize: 13 }}>
          File: <strong>{result.filename}</strong> ({result.size || 'PDF'})
        </div>
        {result.pdf_data_url && (
          <button
            className="small-btn primary-btn"
            onClick={handleDownloadPdf}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--accent-color, #ff6b35)', color: '#fff',
              border: 'none', padding: '6px 12px', borderRadius: 6,
              fontWeight: 600, cursor: 'pointer', marginTop: 4,
            }}
          >
            <FileDown size={14} /> Download {result.filename}
          </button>
        )}
      </div>
    )
  }

  if ((tool === 'doc_export' || tool === 'doc_enhance') && result.exported_text) {
    const handleDownload = () => {
      if (result.pptx_data_url) {
        const a = document.createElement('a')
        a.href = result.pptx_data_url
        a.download = result.filename || 'presentation.pptx'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        return
      }
      const isCsv = result.format === 'csv' || result.filename?.endsWith('.csv')
      const content = isCsv ? '\uFEFF' + result.exported_text : result.exported_text
      const blob = new Blob([content], { type: result.mime_type || 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename || `export.${result.format || 'txt'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return (
      <div className="tool-result-card" style={{ borderLeft: '4px solid var(--accent-color, #ff6b35)' }}>
        <div className="tool-result-header">
          <Sparkles size={14} /> {tool === 'doc_enhance' ? 'Enhanced Document & Presentation' : `Generated ${result.format?.toUpperCase()} Document`}
        </div>
        {result.enhanced_type && (
          <div className="tool-detail" style={{ color: 'var(--accent-color, #ff6b35)', fontWeight: 600, fontSize: 12, margin: '4px 0' }}>
            ✨ {result.enhanced_type}
          </div>
        )}
        <div className="tool-detail" style={{ margin: '8px 0', fontSize: 13 }}>
          File: <strong>{result.filename}</strong> ({result.exported_text.length.toLocaleString()} characters)
        </div>
        <button
          className="small-btn primary-btn"
          onClick={handleDownload}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--accent-color, #ff6b35)', color: '#fff',
            border: 'none', padding: '6px 12px', borderRadius: 6,
            fontWeight: 600, cursor: 'pointer', marginTop: 4,
          }}
        >
          <FileDown size={14} /> Download {result.filename}
        </button>
      </div>
    )
  }

  if (tool === 'timer' || tool === 'alarm') {
    return (
      <div className="tool-result-card timer-result-card">
        <div className="tool-result-header">
          <AlarmClock size={15} style={{ color: '#10b981' }} /> Alarm &amp; Timer Confirmation
          {result.duration && <span className="tool-result-meta">{result.duration}</span>}
        </div>
        <div className="timer-body">
          <div className="timer-msg">{result.message}</div>
          {result.firesAt && <div className="timer-sub">Fires at: <strong>{result.firesAt}</strong></div>}
        </div>
      </div>
    )
  }

  if (tool === 'social_search' && result.results) {
    return (
      <div className="tool-result-card social-search-result-card">
        <div className="tool-result-header">
          <Share2 size={14} /> Social Intelligence: "{result.query}"
          <span className="tool-result-meta">{result.platformName} · {result.count} posts</span>
        </div>
        <div className="social-search-list">
          {result.results.map((item, i) => (
            <div key={i} className="social-search-item">
              <div className="social-search-item-header">
                <span className={`platform-pill platform-${item.platform}`}>{item.platformName}</span>
                {item.published && <span className="social-search-date">{item.published}</span>}
              </div>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="social-search-link">
                <strong>{item.title}</strong>
              </a>
              {item.snippet && <p className="social-search-snippet">{item.snippet}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (tool === 'job_search' && result.jobs) {
    return (
      <div className="tool-result-card job-search-result-card">
        <div className="tool-result-header">
          <Briefcase size={14} /> Careers & Job Portals: "{result.role}"
          <span className="tool-result-meta">{result.location} · {result.count} openings</span>
        </div>
        <div className="job-search-list">
          {result.jobs.map((job, i) => {
            const jobUrl = job.url && job.url.startsWith('http')
              ? job.url
              : `https://www.google.com/search?q=${encodeURIComponent(job.title + ' ' + (job.company || '') + ' ' + (job.location || ''))}`
            return (
              <div key={i} className="job-search-item">
                <div className="job-search-item-top">
                  <div className="job-title-group">
                    <a
                      href={jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="job-title-link"
                      onClick={(e) => {
                        if (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__?.openExternal) {
                          e.preventDefault()
                          window.__YOGATIK_DESKTOP__.openExternal(jobUrl)
                        }
                      }}
                    >
                      <strong>{job.title}</strong>
                    </a>
                    <div className="job-company-loc">
                      <span className="job-company">{job.company}</span> · <span className="job-location">{job.location}</span>
                      {job.experience && <span className="job-exp"> · {job.experience}</span>}
                    </div>
                  </div>
                  <span className={`portal-badge portal-${job.portal}`}>{job.portalName}</span>
                </div>
                {job.snippet && <p className="job-snippet">{job.snippet}</p>}
                <div className="job-action-row">
                  <a
                    href={jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="job-apply-btn"
                    onClick={(e) => {
                      if (typeof window !== 'undefined' && window.__YOGATIK_DESKTOP__?.openExternal) {
                        e.preventDefault()
                        window.__YOGATIK_DESKTOP__.openExternal(jobUrl)
                      }
                    }}
                  >
                    View & Apply on {job.portalName} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (tool === 'social_post_generator') {
    return (
      <div className="tool-result-card social-post-card">
        <div className="tool-result-header">
          <MessageSquare size={14} /> Social Content Blueprint: {result.platformName}
          <span className="tool-result-meta">{result.contentType?.replace('_', ' ')} · {result.characterLimit} chars max</span>
        </div>
        <div className="social-post-info">
          <div><strong>Topic:</strong> {result.topic}</div>
          <div><strong>Tone:</strong> {result.tone} · <strong>Audience:</strong> {result.audience}</div>
          {result.guidelines && <div className="social-post-guideline">{result.guidelines}</div>}
        </div>
      </div>
    )
  }

  if ((tool === 'deep_research' || tool === 'web_search') && (result.pages || result.results)) {
    const items = result.pages || result.results
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          {tool === 'deep_research' ? <Telescope size={14} /> : <Search size={14} />}
          {tool === 'deep_research' ? 'Researched' : 'Searched'} "{result.query}"
          <span className="tool-result-meta">
            {items.length} {tool === 'deep_research' ? 'pages read' : 'results'}
            {result.engine ? ` · ${result.engine}` : ''}
          </span>
        </div>
        <ol className="source-list">
          {items.map((item, i) => {
            let host = ''
            try { host = new URL(item.url).hostname.replace(/^www\./, '') } catch { host = '' }
            return (
              <li key={i} className="source-row">
                <img className="source-favicon" alt="" aria-hidden="true" loading="lazy"
                  src={`https://www.google.com/s2/favicons?sz=32&domain=${host}`}
                  onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="source-link">
                  <span className="source-name">{item.title || host}</span>
                  <span className="source-host">{host} <ExternalLink size={10} /></span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  if (tool === 'doc_search' && result.passages) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          <FileSearch size={14} /> Searched documents
          <span className="tool-result-meta">{result.passages.length} passages</span>
        </div>
        {result.passages.map((p, i) => (
          <div key={i} className="passage">
            <div className="passage-src">{p.document} · chunk {p.chunk}/{p.of}</div>
            <p className="passage-text">{p.passage.slice(0, 260)}{p.passage.length > 260 ? '…' : ''}</p>
          </div>
        ))}
      </div>
    )
  }

  if (tool === 'doc_list' && result.documents) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Files size={14} /> Documents ({result.count})</div>
        {result.documents.map((d, i) => (
          <div key={i} className="tool-detail">{d.name} — {d.chars?.toLocaleString()} chars, {d.chunks} passages</div>
        ))}
      </div>
    )
  }

  // ── MCP tool result ──────────────────────────────────────────────────────────
  // Detected by the _mcpResult flag set in callMcpTool(); renders content parts
  // (text, image, resource) in a rich card instead of raw JSON.
  if (result?._mcpResult) {
    const serverId = tool.split('__')[1] || ''
    const toolName = tool.split('__')[2] || tool
    const contentParts = result.content || []
    const hasText = contentParts.some(c => c.type === 'text')
    const hasImage = contentParts.some(c => c.type === 'image')
    const hasResource = contentParts.some(c => c.type === 'resource')
    const textContent = contentParts.filter(c => c.type === 'text').map(c => c.text).join('\n')
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          <Plug size={14} />
          <span>{serverId} / {toolName}</span>
          <span className="tool-result-meta" style={{ fontSize: 10, color: '#38bdf8' }}>MCP</span>
          {textContent && <CopyButton text={textContent} />}
        </div>
        {contentParts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <pre key={i} className="code-output" style={{ maxHeight: 320, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {part.text}
              </pre>
            )
          }
          if (part.type === 'image' && part.data) {
            const mimeType = part.mimeType || 'image/png'
            return (
              <img key={i} src={`data:${mimeType};base64,${part.data}`}
                alt="MCP image result" style={{ maxWidth: '100%', borderRadius: 6, marginTop: 6 }} />
            )
          }
          if (part.type === 'resource' && part.resource) {
            const res = part.resource
            return (
              <div key={i} className="tool-detail" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={12} />
                {res.uri ? (
                  <a href={res.uri} target="_blank" rel="noopener noreferrer" className="source-link">{res.name || res.uri}</a>
                ) : (
                  <span>{res.name || 'Resource'}</span>
                )}
                {res.mimeType && <span style={{ fontSize: 10, color: '#94a3b8' }}>{res.mimeType}</span>}
              </div>
            )
          }
          return null
        })}
        {result.structured && (
          <pre className="code-output" style={{ maxHeight: 240, overflowY: 'auto', fontSize: 11 }}>
            {JSON.stringify(result.structured, null, 2)}
          </pre>
        )}
        {!hasText && !hasImage && !hasResource && result.text && (
          <pre className="code-output" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{result.text}</pre>
        )}
      </div>
    )
  }

  // ── Screen Inspect result ──────────────────────────────────────────────────
  if (tool === 'screen_inspect' && result) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          <Monitor size={14} /> Screen Inspected
          <span className="tool-result-meta" style={{ fontSize: 10, color: '#38bdf8' }}>
            {result.activeApp || 'Desktop'} · {result.screenWidth ? `${result.screenWidth}x${result.screenHeight}` : 'OS Window'}
          </span>
        </div>
        {result.activeTitle && (
          <div className="tool-detail" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            🪟 {result.activeTitle}
          </div>
        )}
        {result.dataUrl && (
          <div style={{ marginTop: 6, marginBottom: 6 }}>
            <img src={result.dataUrl} alt="Screen frame" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        )}
        {result.ocrPreview && (
          <pre className="code-output" style={{ maxHeight: 160, overflowY: 'auto', fontSize: 11 }}>
            {result.ocrPreview}
          </pre>
        )}
        {result.message && <div className="tool-detail" style={{ color: 'var(--text-secondary)' }}>{result.message}</div>}
      </div>
    )
  }

  // ── Desktop Action result ──────────────────────────────────────────────────
  if (tool === 'desktop_action' && result) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          <MousePointer size={14} /> Desktop Action: {result.action || 'dispatched'}
          <span className="tool-result-meta" style={{ fontSize: 10, color: result.success ? '#10b981' : '#f87171' }}>
            {result.success ? '✓ Executed' : '✕ Failed'}
          </span>
        </div>
        {result.text && <div className="tool-detail">Typed / Pasted: <code>{result.text}</code></div>}
        {result.keys && <div className="tool-detail">Sent Hotkey: <code>{result.keys}</code></div>}
        {result.target && <div className="tool-detail">Target: {result.target}</div>}
        {result.note && <div className="tool-detail" style={{ color: '#94a3b8' }}>{result.note}</div>}
      </div>
    )
  }

  // ── Browser Autopilot result ───────────────────────────────────────────────
  if (tool === 'browser_autopilot' && result) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header">
          <Compass size={14} /> Browser Autopilot
          <span className="tool-result-meta" style={{ fontSize: 10, color: '#38bdf8' }}>
            {result.contentLength ? `${result.contentLength.toLocaleString()} chars` : 'Navigated'}
          </span>
        </div>
        {result.title && (
          <div className="tool-detail" style={{ fontWeight: 600 }}>
            🌐 <a href={result.url} target="_blank" rel="noopener noreferrer" className="source-link">{result.title}</a>
          </div>
        )}
        {result.excerpt && (
          <pre className="code-output" style={{ maxHeight: 200, overflowY: 'auto', fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {result.excerpt}
          </pre>
        )}
        {result.message && <div className="tool-detail" style={{ color: 'var(--text-secondary)' }}>{result.message}</div>}
      </div>
    )
  }

  // Generic fallback for other tools
  if (result && result.success !== false) {
    const Icon = TOOL_ICONS[tool] || (tool.startsWith('mcp__') ? Plug : Wrench)
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Icon size={14} /> {tool.replace(/_/g, ' ')}</div>
        <pre className="code-output">{JSON.stringify(result, null, 2)}</pre>
      </div>
    )
  }

  return null
})

// ─── Message ───

export { ToolResultCard }
