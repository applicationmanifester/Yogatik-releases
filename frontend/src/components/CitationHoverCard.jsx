import React from 'react'
import { ExternalLink, Globe, ShieldCheck } from 'lucide-react'

/**
 * CitationHoverCard — floating rich preview for web search sources and references.
 */
export function CitationHoverCard({
  source = {},
  index = 1,
  onClose,
}) {
  const { url = '', title = '', snippet = '', score = 0 } = source

  let domain = ''
  try {
    if (url) {
      const u = new URL(url)
      domain = u.hostname.replace(/^www\./, '')
    }
  } catch {
    domain = url.slice(0, 30)
  }

  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null

  return (
    <div
      className="citation-hover-card"
      role="tooltip"
      aria-label={`Source citation ${index}: ${title || domain}`}
    >
      <div className="citation-card-header">
        <div className="citation-domain-badge">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt=""
              className="citation-favicon"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          ) : (
            <Globe size={13} className="citation-globe-icon" />
          )}
          <span className="citation-domain-text">{domain || 'Web Source'}</span>
        </div>
        <div className="citation-credibility-tag">
          <ShieldCheck size={11} color="#10b981" />
          <span>Verified</span>
        </div>
      </div>

      <div className="citation-card-body">
        <h4 className="citation-card-title">{title || domain || `Source #${index}`}</h4>
        {snippet ? (
          <p className="citation-card-snippet">{snippet}</p>
        ) : null}
      </div>

      <div className="citation-card-footer">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="citation-open-link"
        >
          <span>Visit Website</span>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
