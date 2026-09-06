import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, Globe, Compass, Trash2, Play, RefreshCw, CheckCircle,
  ExternalLink, FileText, Layers, ShieldCheck, AlertCircle, Database,
  Sparkles, Clock, ArrowRight, BookOpen, Filter, X
} from 'lucide-react'
import {
  searchLocalIndex,
  indexUrlDirect,
  crawlSite,
  getLocalIndexStats,
} from '../tools/localIndexEngine.js'
import {
  getIndexedPages,
  deleteIndexedPage,
  clearIndexedPages,
  getAllIndexedDomains,
} from '../db.js'

export function SearchEnginePanel() {
  const [activeTab, setActiveTab] = useState('search') // 'search' | 'crawler' | 'pages'
  const [stats, setStats] = useState({ totalPages: 0, totalDomains: 0, topDomains: [] })
  const [loadingStats, setLoadingStats] = useState(true)

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedDomain, setSelectedDomain] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Quick Index state
  const [singleUrl, setSingleUrl] = useState('')
  const [singleLoading, setSingleLoading] = useState(false)
  const [singleMsg, setSingleMsg] = useState(null)

  // Crawler state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawlMaxPages, setCrawlMaxPages] = useState(8)
  const [crawlDepth, setCrawlDepth] = useState(2)
  const [crawling, setCrawling] = useState(false)
  const [crawlProgress, setCrawlProgress] = useState(null)
  const [crawlError, setCrawlError] = useState(null)

  // Pages manager state
  const [pages, setPages] = useState([])
  const [pagesLoading, setPagesLoading] = useState(false)
  const [previewPage, setPreviewPage] = useState(null)
  const [pageFilter, setPageFilter] = useState('')

  const refreshStats = useCallback(async () => {
    try {
      setLoadingStats(true)
      const s = await getLocalIndexStats()
      setStats(s)
    } catch (e) {
      console.warn('Failed to load search stats:', e)
    } finally {
      setLoadingStats(false)
    }
  }, [])

  const loadPages = useCallback(async () => {
    try {
      setPagesLoading(true)
      const list = await getIndexedPages({ limit: 100, domain: selectedDomain || null, query: pageFilter || null })
      setPages(list)
    } catch (e) {
      console.warn('Failed to load indexed pages:', e)
    } finally {
      setPagesLoading(false)
    }
  }, [selectedDomain, pageFilter])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  useEffect(() => {
    if (activeTab === 'pages') {
      loadPages()
    }
  }, [activeTab, loadPages])

  // Run Search
  const handleSearch = async (e) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setHasSearched(true)
    try {
      const res = await searchLocalIndex({
        query: searchQuery,
        count: 15,
        domain: selectedDomain || null,
      })
      setSearchResults(res.results || [])
    } catch (err) {
      console.error('Search error:', err)
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // Quick Single Page Index
  const handleIndexSingle = async (e) => {
    e.preventDefault()
    if (!singleUrl.trim()) return
    setSingleLoading(true)
    setSingleMsg(null)
    try {
      const saved = await indexUrlDirect(singleUrl.trim())
      setSingleMsg({ type: 'success', text: `Successfully indexed: "${saved.title}" (${saved.wordCount} words)` })
      setSingleUrl('')
      refreshStats()
      if (activeTab === 'pages') loadPages()
    } catch (err) {
      setSingleMsg({ type: 'error', text: err.message || 'Failed to index URL' })
    } finally {
      setSingleLoading(false)
    }
  }

  // Start Crawler
  const handleStartCrawler = async (e) => {
    e.preventDefault()
    if (!crawlUrl.trim()) return
    setCrawling(true)
    setCrawlError(null)
    setCrawlProgress({ status: 'Starting crawler...', currentUrl: crawlUrl, crawledCount: 0 })

    try {
      const result = await crawlSite({
        startUrl: crawlUrl.trim(),
        maxPages: Number(crawlMaxPages) || 8,
        maxDepth: Number(crawlDepth) || 2,
        onProgress: (p) => {
          setCrawlProgress(p)
        },
      })
      setCrawlProgress({ status: 'completed', crawledCount: result.pagesCrawled })
      refreshStats()
      if (activeTab === 'pages') loadPages()
    } catch (err) {
      setCrawlError(err.message || 'Crawl failed')
    } finally {
      setCrawling(false)
    }
  }

  // Delete page
  const handleDeletePage = async (id) => {
    try {
      await deleteIndexedPage(id)
      setPages(prev => prev.filter(p => p.id !== id))
      if (previewPage?.id === id) setPreviewPage(null)
      refreshStats()
    } catch (e) {
      alert('Could not delete page: ' + e.message)
    }
  }

  // Clear all
  const handleClearAll = async () => {
    if (!window.confirm('Are you sure you want to delete all indexed pages? This cannot be undone.')) return
    try {
      await clearIndexedPages()
      setPages([])
      setSearchResults([])
      setPreviewPage(null)
      refreshStats()
    } catch (e) {
      alert('Could not clear index: ' + e.message)
    }
  }

  return (
    <section className="settings-pane" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Pane Header */}
      <div className="settings-pane-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 className="settings-pane-title">Yogatik Private Search Engine</h3>
            <span style={{
              background: 'rgba(34, 197, 94, 0.15)',
              color: '#4ade80',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '999px',
              padding: '2px 8px',
              fontSize: '11px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              <ShieldCheck size={12} /> $0 Cost · 100% On-Device
            </span>
          </div>
          <p className="settings-pane-subtitle">
            Index, crawl, and search websites purely inside your local browser memory (IndexedDB + BM25 + TurboVec vectors). Zero cloud dependencies, zero cost, and complete privacy.
          </p>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
      }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(99, 102, 241, 0.15)',
            color: '#818cf8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Database size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
              {loadingStats ? '...' : stats.totalPages}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Indexed Pages</div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(168, 85, 247, 0.15)',
            color: '#c084fc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Globe size={18} />
          </div>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc' }}>
              {loadingStats ? '...' : stats.totalDomains}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Unique Domains</div>
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#4ade80',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#4ade80' }}>
              IndexedDB + TurboVec
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>BM25 &amp; Vector Scoring</div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '8px',
      }}>
        <button
          onClick={() => setActiveTab('search')}
          style={{
            background: activeTab === 'search' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'search' ? '#818cf8' : '#94a3b8',
            border: activeTab === 'search' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <Search size={14} /> Search Playground
        </button>

        <button
          onClick={() => setActiveTab('crawler')}
          style={{
            background: activeTab === 'crawler' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'crawler' ? '#818cf8' : '#94a3b8',
            border: activeTab === 'crawler' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <Compass size={14} /> Web Crawler &amp; Indexer
        </button>

        <button
          onClick={() => setActiveTab('pages')}
          style={{
            background: activeTab === 'pages' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'pages' ? '#818cf8' : '#94a3b8',
            border: activeTab === 'pages' ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid transparent',
            padding: '7px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <Layers size={14} /> Manage Index ({stats.totalPages})
        </button>
      </div>

      {/* TAB 1: SEARCH PLAYGROUND */}
      {activeTab === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
              <input
                type="text"
                placeholder="Search across your private indexed web pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                }}
              />
            </div>

            {stats.topDomains?.length > 0 && (
              <select
                value={selectedDomain}
                onChange={(e) => setSelectedDomain(e.target.value)}
                style={{
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  padding: '0 12px',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                <option value="">All Domains</option>
                {stats.topDomains.map(d => (
                  <option key={d.domain} value={d.domain}>{d.domain} ({d.count})</option>
                ))}
              </select>
            )}

            <button
              type="submit"
              disabled={searching || !searchQuery.trim()}
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '0 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: searching || !searchQuery.trim() ? 'not-allowed' : 'pointer',
                opacity: searching || !searchQuery.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {searching ? <RefreshCw size={14} className="spin" /> : <Search size={14} />}
              Search
            </button>
          </form>

          {/* Results List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {hasSearched && searchResults.length === 0 && !searching && (
              <div style={{
                textAlign: 'center',
                padding: '30px 20px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px dashed rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                fontSize: '13px',
              }}>
                <AlertCircle size={24} style={{ margin: '0 auto 8px', color: '#64748b' }} />
                No matching local pages found. Try broader terms or crawl sites in the <strong>Web Crawler</strong> tab.
              </div>
            )}

            {searchResults.map((res, i) => (
              <div
                key={res.url + i}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#60a5fa',
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    {res.title}
                    <ExternalLink size={12} style={{ opacity: 0.6 }} />
                  </a>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: '#818cf8',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}>
                      Score: {res.score}
                    </span>
                    <span style={{
                      background: 'rgba(34, 197, 94, 0.15)',
                      color: '#4ade80',
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                    }}>
                      Private Memory
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  {res.url}
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: '1.5' }}>
                  {res.snippet}
                </div>

                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  {res.domain && <span>Domain: {res.domain}</span>}
                  {res.wordCount && <span>{res.wordCount} words</span>}
                  {res.published && <span>Indexed: {res.published}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: WEB CRAWLER & INDEXER */}
      {activeTab === 'crawler' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Quick 1-Click Page Indexer */}
          <div className="settings-section-card" style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={15} color="#818cf8" /> Index a Single Page
            </h4>
            <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#94a3b8' }}>
              Fetch and extract any web article or documentation page directly into your private index.
            </p>
            <form onSubmit={handleIndexSingle} style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                required
                placeholder="https://example.com/documentation/guide"
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={singleLoading || !singleUrl.trim()}
                style={{
                  background: 'rgba(99, 102, 241, 0.25)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  borderRadius: '6px',
                  color: '#a5b4fc',
                  padding: '0 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: singleLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {singleLoading ? <RefreshCw size={12} className="spin" /> : <Play size={12} />}
                Index Page
              </button>
            </form>

            {singleMsg && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                background: singleMsg.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: singleMsg.type === 'success' ? '#4ade80' : '#f87171',
                border: singleMsg.type === 'success' ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                {singleMsg.text}
              </div>
            )}
          </div>

          {/* Targeted Domain Crawler */}
          <div className="settings-section-card" style={{ padding: '16px' }}>
            <h4 style={{ margin: '0 0 4px', fontSize: '14px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Compass size={15} color="#c084fc" /> Targeted Domain Crawler
            </h4>
            <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#94a3b8' }}>
              Automatically crawl internal links on a target domain and index all pages in the background with respectful rate-limiting.
            </p>

            <form onSubmit={handleStartCrawler} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Starting URL
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://docs.anthropic.com or https://news.ycombinator.com"
                  value={crawlUrl}
                  onChange={(e) => setCrawlUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    color: '#f8fafc',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Max Pages Limit ({crawlMaxPages})
                  </label>
                  <input
                    type="range"
                    min="2"
                    max="30"
                    value={crawlMaxPages}
                    onChange={(e) => setCrawlMaxPages(Number(e.target.value))}
                    style={{ width: '100%' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                    Link Traversal Depth ({crawlDepth} hops)
                  </label>
                  <select
                    value={crawlDepth}
                    onChange={(e) => setCrawlDepth(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  >
                    <option value={1}>1 Hop (Direct root links)</option>
                    <option value={2}>2 Hops (Standard subpages)</option>
                    <option value={3}>3 Hops (Deep section crawl)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={crawling || !crawlUrl.trim()}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: crawling ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
                {crawling ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                {crawling ? 'Crawling Domain...' : 'Start Background Crawler'}
              </button>
            </form>

            {/* Live Crawler Feed */}
            {crawlProgress && (
              <div style={{
                marginTop: '14px',
                padding: '12px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {crawling ? <RefreshCw size={12} className="spin" color="#818cf8" /> : <CheckCircle size={12} color="#4ade80" />}
                    {crawlProgress.status === 'completed' ? 'Crawl Finished!' : 'Crawler Active'}
                  </span>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                    {crawlProgress.crawledCount} pages indexed
                  </span>
                </div>
                {crawlProgress.currentUrl && (
                  <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Current: {crawlProgress.currentUrl}
                  </div>
                )}
              </div>
            )}

            {crawlError && (
              <div style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                {crawlError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MANAGE INDEXED PAGES */}
      {activeTab === 'pages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Filter / Actions Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
              <input
                type="text"
                placeholder="Filter indexed pages by title or URL..."
                value={pageFilter}
                onChange={(e) => setPageFilter(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 12px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  outline: 'none',
                }}
              />
              {stats.topDomains?.length > 0 && (
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  style={{
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    color: '#94a3b8',
                    padding: '0 10px',
                    fontSize: '12px',
                  }}
                >
                  <option value="">All Domains</option>
                  {stats.topDomains.map(d => (
                    <option key={d.domain} value={d.domain}>{d.domain}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={loadPages}
                title="Refresh list"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  padding: '7px 10px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <RefreshCw size={12} className={pagesLoading ? 'spin' : ''} /> Refresh
              </button>

              {pages.length > 0 && (
                <button
                  onClick={handleClearAll}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '6px',
                    color: '#f87171',
                    padding: '7px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Trash2 size={12} /> Clear Index
                </button>
              )}
            </div>
          </div>

          {/* Pages Count */}
          <div style={{ fontSize: '12px', color: '#94a3b8' }}>
            Showing {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </div>

          {/* Pages Grid/List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {pages.length === 0 && !pagesLoading && (
              <div style={{
                textAlign: 'center',
                padding: '30px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                color: '#64748b',
                fontSize: '13px',
              }}>
                No indexed pages found.
              </div>
            )}

            {pages.map((p) => (
              <div
                key={p.id}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: '#f8fafc',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.title}
                    </span>
                    <span style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#94a3b8',
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                    }}>
                      {p.domain}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.url}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => setPreviewPage(p)}
                    title="Read indexed content"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <BookOpen size={14} />
                  </button>

                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open live webpage"
                    style={{
                      color: '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px',
                    }}
                  >
                    <ExternalLink size={14} />
                  </a>

                  <button
                    onClick={() => handleDeletePage(p.id)}
                    title="Delete from index"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Preview Modal / Drawer */}
          {previewPage && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(4px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}>
              <div style={{
                background: '#0f172a',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '12px',
                width: '100%',
                maxWidth: '700px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              }}>
                <div style={{
                  padding: '16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '15px' }}>{previewPage.title}</h4>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>{previewPage.url}</span>
                  </div>
                  <button
                    onClick={() => setPreviewPage(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>
                <div style={{ padding: '16px', overflowY: 'auto', flex: 1, color: '#cbd5e1', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                  {previewPage.content || previewPage.snippet || 'No readable text content found.'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
