import React, { useState, useEffect } from 'react'
import {
  X, Search, Sparkles, Youtube, MessageSquare, Briefcase, Code,
  ExternalLink, Globe, Play, Flame, Send, ArrowRight, Share2, Compass,
  BookOpen, TrendingUp, Cpu, Zap, ShieldCheck, CheckCircle2, ChevronRight,
  ShoppingBag, Palette, Image as ImageIcon, Terminal, Plane, FileText,
  Bot, HelpCircle, Layers, Database, Activity
} from 'lucide-react'

const DOMAIN_CATEGORIES = [
  { id: 'all', label: 'All Portals', icon: Globe },
  { id: 'jobs', label: 'Jobs & Careers', icon: Briefcase },
  { id: 'social', label: 'Social & X', icon: MessageSquare },
  { id: 'tech', label: 'Tech & Dev', icon: Code },
  { id: 'video', label: 'Video & Media', icon: Play },
  { id: 'design', label: 'Design & Visuals', icon: Palette },
  { id: 'science', label: 'Science & Papers', icon: BookOpen },
  { id: 'finance', label: 'Finance & Crypto', icon: TrendingUp },
  { id: 'commerce', label: 'Commerce & Travel', icon: ShoppingBag },
  { id: 'productivity', label: 'Productivity & Docs', icon: FileText },
]

const DOMAIN_PRESETS = [
  // Jobs & Careers
  {
    id: 'naukri-jobs',
    category: 'jobs',
    domain: 'Naukri.com',
    badge: 'Trending in India',
    color: '#0a66c2',
    icon: Briefcase,
    title: 'Find Tech Jobs on Naukri',
    desc: 'Search software, AI, frontend, backend, and product roles across Bangalore, Hyderabad, Pune & Remote.',
    prompt: 'Search Naukri and Indeed for Senior React and AI Engineer jobs in Bangalore and Remote. List top openings with salaries and requirements.',
    externalUrl: 'https://www.naukri.com',
  },
  {
    id: 'indeed-jobs',
    category: 'jobs',
    domain: 'Indeed & Glassdoor',
    badge: 'Global Careers',
    color: '#2164f3',
    icon: Briefcase,
    title: 'Search Global Job Openings',
    desc: 'Explore salary benchmarks, interview insights, and verified company reviews on Indeed & Glassdoor.',
    prompt: 'Search Indeed and Glassdoor for Full Stack Developer and Python Engineer remote openings. Include company ratings and salary estimates.',
    externalUrl: 'https://www.indeed.com',
  },
  {
    id: 'linkedin-jobs',
    category: 'jobs',
    domain: 'LinkedIn Jobs',
    badge: 'Professional',
    color: '#0077b5',
    icon: Briefcase,
    title: 'Find Opportunities on LinkedIn',
    desc: 'Target hiring managers, industry roles, tech lead positions, and high-growth startup openings.',
    prompt: 'Search LinkedIn Jobs for Product Manager and AI Specialist roles posted this week. Include application requirements.',
    externalUrl: 'https://www.linkedin.com/jobs',
  },

  // Social & X
  {
    id: 'x-twitter-search',
    category: 'social',
    domain: 'X (Twitter)',
    badge: 'Real-time Pulse',
    color: '#1da1f2',
    icon: MessageSquare,
    title: 'Search X / Twitter Discussions',
    desc: 'Monitor breaking tech news, top creator tweets, model benchmarks, and community discourse.',
    prompt: 'Search X (Twitter) for latest announcements and community reactions regarding new AI model releases today.',
    externalUrl: 'https://x.com/explore',
  },
  {
    id: 'linkedin-post-gen',
    category: 'social',
    domain: 'LinkedIn',
    badge: 'Thought Leadership',
    color: '#0a66c2',
    icon: Share2,
    title: 'Draft High-Impact LinkedIn Post',
    desc: 'Generate insightful, hook-driven career and technology posts that drive organic reach and engagement.',
    prompt: 'Draft an engaging LinkedIn post about why AI agents and developer productivity are transforming software engineering in 2026. Use punchy formatting and end with a discussion question.',
    externalUrl: 'https://www.linkedin.com',
  },
  {
    id: 'x-thread-gen',
    category: 'social',
    domain: 'X (Twitter)',
    badge: 'Viral Content',
    color: '#0ea5e9',
    icon: MessageSquare,
    title: 'Create Viral X Thread',
    desc: 'Craft structured 5-part tweet threads with hook, core value nuggets, code snippets, and CTA.',
    prompt: 'Write a viral 5-tweet thread explaining how to build modern AI web apps with local tools and LLMs. Number each tweet [1/5] to [5/5] and keep under 280 chars.',
    externalUrl: 'https://x.com',
  },
  {
    id: 'reddit-discussions',
    category: 'social',
    domain: 'Reddit',
    badge: 'Community Intel',
    color: '#ff4500',
    icon: MessageSquare,
    title: 'Search Reddit Opinions & Threads',
    desc: 'Query r/technology, r/localllama, r/webdev for honest user experiences and technical debates.',
    prompt: 'Search Reddit discussions on r/LocalLLaMA and r/webdev for the best local AI tools and setups in 2026.',
    externalUrl: 'https://www.reddit.com',
  },
  {
    id: 'instagram-caption',
    category: 'social',
    domain: 'Instagram',
    badge: 'Hashtags & Reels',
    color: '#e1306c',
    icon: Compass,
    title: 'Instagram Captions & Viral Reels',
    desc: 'Create aesthetic captions with emojis, line spacing, callouts, and 25 targeted niche hashtags.',
    prompt: 'Generate an engaging Instagram caption and 25 high-traffic hashtags for launching an innovative AI productivity app.',
    externalUrl: 'https://www.instagram.com',
  },

  // Tech & Dev
  {
    id: 'huggingface-models',
    category: 'tech',
    domain: 'Hugging Face',
    badge: 'AI Models & Datasets',
    color: '#ffcc4d',
    icon: Cpu,
    title: 'Explore Open-Weight Models & Datasets',
    desc: 'Discover latest open-source LLMs, LoRA weights, quantization benchmarks, and Vision models on Hugging Face.',
    prompt: 'Search Hugging Face for the latest trending open-weight LLMs, vision models, and datasets released this month.',
    externalUrl: 'https://huggingface.co/models',
  },
  {
    id: 'github-trending',
    category: 'tech',
    domain: 'GitHub',
    badge: 'Open Source',
    color: '#6e5494',
    icon: Code,
    title: 'Search Trending GitHub Repositories',
    desc: 'Discover cutting-edge open-source repositories, developer tools, AI frameworks, and libraries.',
    prompt: 'Search GitHub for trending open source AI agent and LLM developer frameworks with their stars and key features.',
    externalUrl: 'https://github.com/trending',
  },
  {
    id: 'stackoverflow-debug',
    category: 'tech',
    domain: 'Stack Overflow',
    badge: 'Technical Solutions',
    color: '#f48024',
    icon: Terminal,
    title: 'Search Solutions & Debug Errors',
    desc: 'Query verified Stack Overflow solutions, GitHub issues, and compiler error fixes.',
    prompt: 'Search Stack Overflow and GitHub issues for solutions to common TypeScript, React 19, and Node.js concurrency bottlenecks.',
    externalUrl: 'https://stackoverflow.com',
  },
  {
    id: 'hackernews-search',
    category: 'tech',
    domain: 'Hacker News',
    badge: 'Tech Discussions',
    color: '#ff6600',
    icon: Flame,
    title: 'Hacker News Top Stories & Show HN',
    desc: 'Explore Y Combinator Hacker News front-page stories, Show HN projects, and engineering debates.',
    prompt: 'Search Hacker News for top Show HN projects and discussions about AI developer tools this month.',
    externalUrl: 'https://news.ycombinator.com',
  },
  {
    id: 'product-hunt-launches',
    category: 'tech',
    domain: 'Product Hunt',
    badge: 'Daily Launches',
    color: '#da552f',
    icon: Zap,
    title: 'Trending Tech & AI Product Launches',
    desc: 'Discover today\'s top upvoted AI tools, SaaS startups, and developer workflows on Product Hunt.',
    prompt: 'Search Product Hunt for top trending AI tools and developer productivity launches this week.',
    externalUrl: 'https://www.producthunt.com',
  },

  // Video & Media
  {
    id: 'youtube-summary',
    category: 'video',
    domain: 'YouTube',
    badge: 'Video Intelligence',
    color: '#ff0000',
    icon: Youtube,
    title: 'Summarize YouTube Video',
    desc: 'Extract full transcript, key bullet points, action items, and timestamps from any video URL.',
    prompt: 'Please explain how you summarize YouTube videos. What format do you provide when I paste a YouTube link?',
    externalUrl: 'https://www.youtube.com',
  },
  {
    id: 'tiktok-instagram-script',
    category: 'video',
    domain: 'TikTok & Shorts',
    badge: '60s Scripting',
    color: '#fe2c55',
    icon: Play,
    title: 'Shorts & TikTok Script Generator',
    desc: 'Generate 60-second video scripts with 3-second hook, visual cues, sound directions, and CTA.',
    prompt: 'Write a 60-second TikTok / YouTube Shorts script about 3 AI productivity tools everyone should know. Structure into Hook (0-3s), Problem (3-15s), Demo (15-45s), and CTA (45-60s) with visual cues.',
    externalUrl: 'https://www.tiktok.com',
  },

  // Design & Visuals
  {
    id: 'midjourney-flux-prompts',
    category: 'design',
    domain: 'Midjourney & Flux.1',
    badge: 'Visual Prompts',
    color: '#a855f7',
    icon: ImageIcon,
    title: 'Masterpiece Image & UI Prompt Generator',
    desc: 'Generate photographic, cinematic, 3D render, and UI mockup prompts optimized for Flux, Midjourney, and Stable Diffusion.',
    prompt: 'Generate 4 detailed cinematic Midjourney v6 and Flux.1 prompts for creating modern glassmorphic dashboard UI designs and futuristic AI avatars with lighting parameters and camera specs.',
    externalUrl: 'https://www.midjourney.com',
  },
  {
    id: 'unsplash-photography',
    category: 'design',
    domain: 'Unsplash & Pexels',
    badge: 'Stock Media',
    color: '#06b6d4',
    icon: Palette,
    title: 'Royalty-Free High-Res Stock Photography',
    desc: 'Search high-quality editorial, nature, technology, and commercial photography on Unsplash.',
    prompt: 'Search Unsplash for high-resolution minimal dark mode desktop wallpapers and aesthetic technology workspaces.',
    externalUrl: 'https://unsplash.com',
  },

  // Science & Research
  {
    id: 'arxiv-papers',
    category: 'science',
    domain: 'arXiv.org & Scholar',
    badge: 'Research Papers',
    color: '#8b5cf6',
    icon: BookOpen,
    title: 'Explore AI & Science Papers on arXiv',
    desc: 'Query research preprints, benchmarks, methodology, and citations from arXiv and Google Scholar.',
    prompt: 'Search arXiv and Google Scholar for latest 2026 research papers on reasoning LLMs, test-time compute, and autonomous agents. Provide summaries with links.',
    externalUrl: 'https://arxiv.org',
  },
  {
    id: 'pubmed-research',
    category: 'science',
    domain: 'PubMed & OpenAlex',
    badge: 'Biomedical Intel',
    color: '#0284c7',
    icon: BookOpen,
    title: 'Search Medical & Biology Literature',
    desc: 'Query peer-reviewed clinical trials, biotechnology breakthroughs, and biomedical research on PubMed.',
    prompt: 'Search academic biomedical literature for recent studies on longevity, metabolic health, and circadian rhythms.',
    externalUrl: 'https://pubmed.ncbi.nlm.nih.gov',
  },
  {
    id: 'wikipedia-deepdive',
    category: 'science',
    domain: 'Wikipedia & Knowledge',
    badge: 'Encyclopedic Intel',
    color: '#71717a',
    icon: Globe,
    title: 'Comprehensive Encyclopedia Deep Dive',
    desc: 'Synthesize historical timelines, scientific principles, and biographies from Wikipedia and authoritative sources.',
    prompt: 'Provide a comprehensive, structured deep dive on the history and mathematics of Quantum Computing, from Feynman\'s 1981 conjecture to modern topological qubits.',
    externalUrl: 'https://www.wikipedia.org',
  },

  // Finance & Markets
  {
    id: 'crypto-finance',
    category: 'finance',
    domain: 'CoinGecko & Markets',
    badge: 'Crypto & Assets',
    color: '#10b981',
    icon: TrendingUp,
    title: 'Live Crypto & Market Intelligence',
    desc: 'Track Bitcoin, Ethereum, market caps, 24h volume, DeFi yields, and macroeconomic financial trends.',
    prompt: 'Check current cryptocurrency market prices and trends for Bitcoin, Ethereum, and top L1/L2 ecosystems.',
    externalUrl: 'https://www.coingecko.com',
  },
  {
    id: 'stocks-macro',
    category: 'finance',
    domain: 'Google & Yahoo Finance',
    badge: 'Equities & Forex',
    color: '#059669',
    icon: TrendingUp,
    title: 'Global Equities & Currency Rates',
    desc: 'Inspect live exchange rates (USD, EUR, INR, GBP, JPY), index movements, commodities, and earnings.',
    prompt: 'Look up current foreign exchange rates for USD, EUR, INR, GBP, and JPY, plus major stock indices performance.',
    externalUrl: 'https://www.google.com/finance',
  },
  {
    id: 'tradingview-ta',
    category: 'finance',
    domain: 'TradingView & TA',
    badge: 'Technical Indicators',
    color: '#2962ff',
    icon: Activity,
    title: 'Technical Analysis & Chart Indicators',
    desc: 'Analyze support/resistance, RSI, MACD, Moving Averages, and breakout chart patterns for any stock or crypto.',
    prompt: 'Perform a technical analysis for Bitcoin (BTC) and NVIDIA (NVDA) using current 2026 price levels, support/resistance, RSI momentum, and 50/200 DMA trends.',
    externalUrl: 'https://www.tradingview.com',
  },
  {
    id: 'sec-edgar-filings',
    category: 'finance',
    domain: 'SEC EDGAR & Earnings',
    badge: 'Fundamental Analysis',
    color: '#0891b2',
    icon: FileText,
    title: '10-K Filings & Earnings Call Reports',
    desc: 'Extract balance sheets, revenue growth, cash flow, profit margins, and guidance from SEC filings.',
    prompt: 'Analyze the latest earnings reports and financial health of Apple (AAPL) and Microsoft (MSFT). Break down revenue, gross margins, free cash flow, and guidance.',
    externalUrl: 'https://www.sec.gov/edgar',
  },
  {
    id: 'defillama-yields',
    category: 'finance',
    domain: 'DeFi Llama',
    badge: 'TVL & Staking',
    color: '#3b82f6',
    icon: Database,
    title: 'DeFi Total Value Locked & Yield Protocols',
    desc: 'Track chain TVL (Ethereum, Solana, Arbitrum), stablecoin yields, DEX volumes, and protocol fees.',
    prompt: 'Check current Total Value Locked (TVL) rankings across Ethereum, Solana, and Layer 2s on DeFi Llama, along with top stablecoin staking APY rates.',
    externalUrl: 'https://defillama.com',
  },
  {
    id: 'budget-personal-finance',
    category: 'finance',
    domain: 'Personal Wealth & Tax',
    badge: 'Budget & ROI',
    color: '#14b8a6',
    icon: TrendingUp,
    title: 'Personal Budget & Investment Strategy',
    desc: 'Calculate savings allocations, emergency fund targets, debt payoff plans, and compounding projections.',
    prompt: 'Create a personalized monthly wealth building and budget plan using the 50/30/20 rule, including emergency fund allocation and compounding index fund projections over 10 years.',
    externalUrl: 'https://www.nerdwallet.com',
  },

  // Commerce & Travel
  {
    id: 'amazon-price-comparison',
    category: 'commerce',
    domain: 'Amazon & Deals',
    badge: 'Price Intel',
    color: '#ff9900',
    icon: ShoppingBag,
    title: 'Product Comparison & Best Deals',
    desc: 'Compare specifications, verified customer sentiment, price history, and budget alternatives.',
    prompt: 'Compare the top 3 best developer laptops and ultrawide monitors under $1,200 in 2026. Break down specs, battery life, display quality, and price-to-performance ratio.',
    externalUrl: 'https://www.amazon.com',
  },
  {
    id: 'flipkart-india-deals',
    category: 'commerce',
    domain: 'Flipkart & Myntra',
    badge: 'India Shopping',
    color: '#2874f0',
    icon: ShoppingBag,
    title: 'Flipkart Deals & Price Tracker',
    desc: 'Search electronics, smartphones, fashion, and appliances across Indian e-commerce platforms with discount codes.',
    prompt: 'Find the best deals and price comparison for 5G smartphones and wireless noise-cancelling headphones on Flipkart and Amazon India under ₹25,000.',
    externalUrl: 'https://www.flipkart.com',
  },
  {
    id: 'shopify-store-builder',
    category: 'commerce',
    domain: 'Shopify & D2C',
    badge: 'Conversion Copy',
    color: '#95bf47',
    icon: Layers,
    title: 'Shopify Product Research & High-Converting Copy',
    desc: 'Craft compelling product descriptions, SEO tags, bullet benefits, and conversion rate optimization strategies.',
    prompt: 'Write a high-converting Shopify product page for an ergonomic wireless mechanical keyboard, including a catchy hero title, 5 emotional bullet benefits, FAQ section, and trust badges.',
    externalUrl: 'https://www.shopify.com',
  },
  {
    id: 'ebay-refurb-deals',
    category: 'commerce',
    domain: 'eBay & Resale',
    badge: 'Refurbished & Deals',
    color: '#e53238',
    icon: ShoppingBag,
    title: 'Refurbished Electronics & Rare Finds',
    desc: 'Track price trends for pre-owned tech, vintage collectibles, camera gear, and certified refurbished items.',
    prompt: 'Search eBay and secondary markets for refurbished MacBook Pro M-series and mirrorless cameras. Provide fair market price ranges and seller verification tips.',
    externalUrl: 'https://www.ebay.com',
  },
  {
    id: 'alibaba-product-sourcing',
    category: 'commerce',
    domain: 'Alibaba & Sourcing',
    badge: 'Wholesale & B2B',
    color: '#ff6a00',
    icon: Globe,
    title: 'B2B Product Sourcing & Supplier RFQ',
    desc: 'Draft Request for Quotations (RFQs), evaluate Minimum Order Quantities (MOQ), and shipping logistics.',
    prompt: 'Draft a professional Request for Quotation (RFQ) letter to send to Alibaba suppliers for custom eco-friendly packaging, including MOQ inquiries, sample requests, and incoterms (FOB/DDP).',
    externalUrl: 'https://www.alibaba.com',
  },
  {
    id: 'travel-itinerary',
    category: 'commerce',
    domain: 'Travel & Flights',
    badge: 'Trip Planner',
    color: '#0ea5e9',
    icon: Plane,
    title: 'Smart Travel & Itinerary Intelligence',
    desc: 'Create day-by-day travel plans, discover hidden gems, estimate budgets, and check flight routes.',
    prompt: 'Plan a 5-day budget-friendly travel itinerary for Tokyo and Kyoto, including transit routes, daily must-see spots, top food recommendations, and estimated costs.',
    externalUrl: 'https://www.google.com/travel',
  },

  // Productivity & Docs
  {
    id: 'meeting-executive-summary',
    category: 'productivity',
    domain: 'Notion & Workspace',
    badge: 'Executive Docs',
    color: '#6366f1',
    icon: FileText,
    title: 'Executive Briefs & Meeting Notes',
    desc: 'Format messy conversation transcripts or notes into clean action items, owners, decisions, and deadlines.',
    prompt: 'Create a clean, executive meeting summary template with Key Decisions, Action Items (with Owners & Deadlines), Blockers, and Next Steps in Markdown.',
    externalUrl: 'https://www.notion.so',
  },
  {
    id: 'pitch-cold-email',
    category: 'productivity',
    domain: 'Pitch & Outreach',
    badge: 'High Conversion',
    color: '#ec4899',
    icon: Send,
    title: 'High-Converting Cold Outreach & Pitch Deck',
    desc: 'Draft personalized sales emails, investor pitch deck slides, and partnership inquiries that get responses.',
    prompt: 'Draft a compelling 3-part cold email sequence to pitch a B2B AI SaaS product to enterprise CTOs. Include subject lines with >40% expected open rate, personalized hook, value proposition, and low-friction CTA.',
    externalUrl: 'https://ycombinator.com',
  },
]

export function DomainHubModal({ isOpen, onClose, onExecutePrompt }) {
  const [activeTab, setActiveTab] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filteredPresets = DOMAIN_PRESETS.filter(p => {
    if (activeTab !== 'all' && p.category !== activeTab) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.title.toLowerCase().includes(q) ||
      p.desc.toLowerCase().includes(q) ||
      p.domain.toLowerCase().includes(q) ||
      p.badge.toLowerCase().includes(q)
    )
  })

  // Category counts
  const counts = DOMAIN_CATEGORIES.reduce((acc, cat) => {
    if (cat.id === 'all') acc[cat.id] = DOMAIN_PRESETS.length
    else acc[cat.id] = DOMAIN_PRESETS.filter(p => p.category === cat.id).length
    return acc
  }, {})

  const handleRunPreset = (preset) => {
    onClose()
    onExecutePrompt(preset.prompt)
  }

  const handleCustomSearch = (e) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    const promptText = `Search ${activeTab === 'all' ? 'social media, Naukri, Indeed, X, and YouTube' : activeTab} for: "${searchQuery.trim()}". Provide comprehensive insights and links.`
    onClose()
    onExecutePrompt(promptText)
  }

  const quickPrompts = [
    { label: 'Naukri Tech Jobs', query: 'Search Naukri for Senior AI Engineer jobs in Bangalore' },
    { label: 'Hugging Face Models', query: 'Search Hugging Face for latest open-weight reasoning LLMs' },
    { label: 'Viral Reels & Scripts', query: 'Write a 60s viral TikTok and Instagram script for AI tools' },
    { label: 'Trending X News', query: 'Search X (Twitter) for trending developer news today' },
    { label: 'arXiv AI Papers', query: 'Search arXiv for latest 2026 reasoning LLM research papers' },
    { label: 'Amazon Best Deals', query: 'Find the top 3 best developer monitors and laptops under $1200' },
    { label: 'Crypto & Forex Rates', query: 'Check current crypto market prices and USD/INR exchange rates' },
  ]

  return (
    <div className="domain-hub-overlay" onClick={onClose}>
      <div
        className="domain-hub-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Social Media & Domain Intelligence Hub"
      >
        {/* Header */}
        <div className="domain-hub-header">
          <div className="domain-hub-title-group">
            <div className="domain-hub-icon-wrap">
              <Globe size={22} className="domain-hub-glow-icon" />
              <span className="domain-hub-icon-pulse" />
            </div>
            <div>
              <div className="domain-hub-title-row">
                <h2 className="domain-hub-title">Social Media &amp; Domain Hub</h2>
                <span className="domain-hub-badge-counter">{DOMAIN_PRESETS.length} Integrations</span>
              </div>
              <p className="domain-hub-sub">
                Live AI search, content generation &amp; research across YouTube, X, Instagram, TikTok, LinkedIn, Naukri, arXiv &amp; GitHub
              </p>
            </div>
          </div>
          <button className="domain-hub-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Search & Action Bar */}
        <form className="domain-hub-search-form" onSubmit={handleCustomSearch}>
          <div className="domain-hub-input-wrap">
            <Search size={17} className="domain-hub-search-icon" />
            <input
              type="text"
              className="domain-hub-search-input"
              placeholder={`Search portals or type custom query (e.g. "React jobs in Bangalore", "viral X trends")...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery ? (
              <button
                type="submit"
                className="domain-hub-submit-btn"
                title="Execute with AI Agent"
              >
                <Zap size={14} /> Ask AI
              </button>
            ) : (
              <kbd className="domain-hub-kbd">/</kbd>
            )}
          </div>
        </form>

        {/* Category Tabs */}
        <div className="domain-hub-tabs-container">
          <div
            className="domain-hub-tabs"
            role="tablist"
            onWheel={(e) => {
              if (e.deltaY) {
                e.currentTarget.scrollLeft += e.deltaY * 0.8
              }
            }}
          >
            {DOMAIN_CATEGORIES.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              const count = counts[tab.id] || 0
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  className={`domain-hub-tab ${active ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon size={14} className="domain-hub-tab-icon" />
                  <span>{tab.label}</span>
                  <span className="domain-hub-tab-count">{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Preset Cards Grid */}
        <div className="domain-hub-grid">
          {filteredPresets.length === 0 ? (
            <div className="domain-hub-empty">
              <Search size={32} className="domain-hub-empty-icon" />
              <h3>No matching portals found</h3>
              <p>Try searching for a different keyword or ask AI directly using the search bar above.</p>
              <button
                type="button"
                className="domain-hub-custom-ask-btn"
                onClick={() => {
                  onClose()
                  onExecutePrompt(`Search for "${searchQuery}" across social media, jobs, and web research.`)
                }}
              >
                <Sparkles size={14} /> Ask AI about "{searchQuery}"
              </button>
            </div>
          ) : (
            filteredPresets.map(preset => {
              const Icon = preset.icon
              return (
                <div
                  key={preset.id}
                  className="domain-hub-card"
                  onClick={() => handleRunPreset(preset)}
                >
                  <div className="domain-hub-card-top">
                    <div
                      className="domain-hub-brand-badge"
                      style={{
                        backgroundColor: `${preset.color}18`,
                        borderColor: `${preset.color}40`,
                        color: preset.color
                      }}
                    >
                      <Icon size={13} />
                      <span>{preset.domain}</span>
                    </div>
                    <span className="domain-hub-status-pill">
                      <span className="domain-hub-status-dot" style={{ backgroundColor: preset.color }} />
                      {preset.badge}
                    </span>
                  </div>

                  <h3 className="domain-hub-card-title">{preset.title}</h3>
                  <p className="domain-hub-card-desc">{preset.desc}</p>

                  <div className="domain-hub-card-footer">
                    <button
                      type="button"
                      className="domain-hub-launch-btn"
                      onClick={(e) => { e.stopPropagation(); handleRunPreset(preset) }}
                    >
                      <Sparkles size={13} />
                      <span>Run with AI</span>
                      <ChevronRight size={13} className="launch-arrow" />
                    </button>
                    <a
                      href={preset.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="domain-hub-ext-btn"
                      onClick={e => e.stopPropagation()}
                      title={`Visit ${preset.domain} official site`}
                    >
                      <ExternalLink size={13} />
                    </a>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Quick prompt chips & Footer */}
        <div className="domain-hub-footer">
          <div className="domain-hub-quick-chips">
            <span className="quick-label">⚡ Quick ideas:</span>
            {quickPrompts.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                className="domain-hub-chip"
                onClick={() => {
                  onClose()
                  onExecutePrompt(qp.query)
                }}
              >
                {qp.label}
              </button>
            ))}
          </div>
          <div className="domain-hub-footer-actions">
            <span className="footer-shortcut"><kbd>Esc</kbd> to close</span>
            <button className="domain-hub-done-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
