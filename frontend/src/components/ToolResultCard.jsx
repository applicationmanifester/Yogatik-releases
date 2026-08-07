import React from 'react'
import {
  Wrench, Image, Code, CloudSun, Calculator, Languages, Youtube, Link,
  ScanLine, QrCode, FileText, AudioLines, Hash, Regex, ArrowLeftRight,
  Palette, Search, GitCompare, Ruler, MapPin, Rss, Eye, FileDown, Volume2,
} from 'lucide-react'

export const TOOL_ICONS = {
  weather: CloudSun, image_generate: Image, code_execute: Code,
  calculator: Calculator, translate: Languages, youtube: Youtube,
  web_extract: Link, web_search: Search, chart: Image, tts: Volume2,
  ocr: ScanLine, qr_generate: QrCode, qr_read: QrCode,
  pdf_extract: FileText, stt: AudioLines, summarize: FileText,
  rss_feed: Rss, hash: Hash, regex: Regex, data_convert: ArrowLeftRight,
  color_palette: Palette, whois: Search, diagram: GitCompare,
  audio_edit: AudioLines, image_info: Eye, link_preview: Link,
  diff: GitCompare, unit_convert: Ruler, ip_lookup: MapPin,
  md_to_pdf: FileDown,
}

// ─── Tool Result Display ───
function ToolResultCard({ tool, result }) {
  const Icon = TOOL_ICONS[tool] || Wrench
  if (!result || result.success === false) {
    return (
      <div className="tool-result-card error">
        <div className="tool-result-header"><Icon size={14} /> {tool} — Failed</div>
        <p className="tool-error">{result?.error || 'Unknown error'}</p>
      </div>
    )
  }

  if (tool === 'image_generate' && result.image_url) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Generated Image</div>
        <img src={result.image_url} alt={result.prompt}
          className="generated-image" loading="lazy" />
        <p className="tool-prompt">Prompt: "{result.prompt}"</p>
      </div>
    )
  }

  if (tool === 'chart' && result.image_url) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Image size={14} /> Chart</div>
        <img src={result.image_url} alt={result.title || 'Chart'}
          className="generated-image" loading="lazy" />
      </div>
    )
  }

  if (tool === 'code_execute') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Code size={14} /> Code Output</div>
        {(result.output || result.stdout) && <pre className="code-output">{result.output || result.stdout}</pre>}
        {(result.error || result.stderr) && <pre className="code-output error">{result.error || result.stderr}</pre>}
      </div>
    )
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
        <div className="tool-result-header"><Languages size={14} /> Translation ({result.source_lang} → {result.target_lang})</div>
        <p className="translation-result">{result.translated}</p>
      </div>
    )
  }

  if (tool === 'unit_convert') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Ruler size={14} /> Unit Conversion</div>
        <div className="calc-result">{result.formatted || result.output}</div>
      </div>
    )
  }

  if (tool === 'hash') {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Hash size={14} /> {result.algorithm?.toUpperCase()}</div>
        <pre className="code-output" style={{ wordBreak: 'break-all' }}>{result.result}</pre>
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

  if (tool === 'diagram' && result.svg) {
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><GitCompare size={14} /> Diagram</div>
        {/* Mermaid renders to SVG in-browser; no backend image endpoint exists */}
        <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: result.svg }} />
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

  // Generic fallback for other tools
  if (result && result.success !== false) {
    const Icon = TOOL_ICONS[tool] || Wrench
    return (
      <div className="tool-result-card">
        <div className="tool-result-header"><Icon size={14} /> {tool.replace(/_/g, ' ')}</div>
        <pre className="code-output">{JSON.stringify(result, null, 2)}</pre>
      </div>
    )
  }

  return null
}

// ─── Message ───

export { ToolResultCard }
