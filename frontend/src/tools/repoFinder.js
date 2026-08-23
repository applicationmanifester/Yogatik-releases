/**
 * GitHub Repo Finder & Open-Source Discovery Engine
 * 
 * Empowers AI agents to find similar repositories, explore trending AI/dev tools,
 * inspect repository health metrics, analyze tech stacks, and compare alternative open-source projects.
 */

export const CURATED_REPO_CATEGORIES = {
  'ai_agents': [
    { name: 'Panniantong/Agent-Reach', stars: '4.2k', desc: 'Universal open-web reader & intelligence gatherer across 13+ networks', url: 'https://github.com/Panniantong/Agent-Reach' },
    { name: 'anthropics/anthropic-quickstarts', stars: '8.1k', desc: 'Production-ready starter projects for autonomous Claude agents and computer use', url: 'https://github.com/anthropics/anthropic-quickstarts' },
    { name: 'crewAIInc/crewAI', stars: '28k', desc: 'Framework for orchestrating role-playing autonomous AI agent crews', url: 'https://github.com/crewAIInc/crewAI' },
    { name: 'geekan/MetaGPT', stars: '45k', desc: 'Multi-agent framework assigning product manager, architect, and engineer roles', url: 'https://github.com/geekan/MetaGPT' },
  ],
  'security_defense': [
    { name: 'perplexityai/numbat', stars: '3.5k', desc: 'Agent security suite for visibility, pre-action blocking, and session forensics', url: 'https://github.com/perplexityai/numbat' },
    { name: 'vercel-labs/deepsec', stars: '2.8k', desc: 'Automated 5-stage application security testing and vulnerability audit harness', url: 'https://github.com/vercel-labs/deepsec' },
    { name: 'guardrails-ai/guardrails', stars: '5.2k', desc: 'Structured validation, hallucination guards, and PII filters for LLM outputs', url: 'https://github.com/guardrails-ai/guardrails' },
    { name: 'protectai/rebuff', stars: '2.1k', desc: 'Multi-layered prompt injection detection and canary defense engine', url: 'https://github.com/protectai/rebuff' },
  ],
  'vector_rag': [
    { name: 'ryancodrai/turbovec', stars: '2.9k', desc: 'TurboQuant-powered randomized vector quantization & ultra-low latency RAG', url: 'https://github.com/ryancodrai/turbovec' },
    { name: 'chroma-core/chroma', stars: '18k', desc: 'The AI-native open-source embedding database for RAG applications', url: 'https://github.com/chroma-core/chroma' },
    { name: 'qdrant/qdrant', stars: '22k', desc: 'High-performance vector similarity search engine with payload filtering', url: 'https://github.com/qdrant/qdrant' },
    { name: 'facebookresearch/faiss', stars: '32k', desc: 'Efficient similarity search and clustering of dense vectors on GPU/CPU', url: 'https://github.com/facebookresearch/faiss' },
  ],
  '3d_web_graphics': [
    { name: 'MengTo/threeui', stars: '3.1k', desc: '160+ procedural Three.js 3D components, glass cards, and shader hero scenes', url: 'https://github.com/MengTo/threeui' },
    { name: 'pmndrs/react-three-fiber', stars: '28k', desc: 'A React renderer for Three.js on web and react-native', url: 'https://github.com/pmndrs/react-three-fiber' },
    { name: 'tresjs/tres', stars: '4.5k', desc: 'Declarative Three.js components for Vue 3 with high-performance reactivity', url: 'https://github.com/tresjs/tres' },
  ],
  'headless_browsers_scraping': [
    { name: 'lightpanda-io/browser', stars: '3.8k', desc: 'Ultra-fast headless browser written in Zig + V8 for AI agents and RAG', url: 'https://github.com/lightpanda-io/browser' },
    { name: 'mendableai/firecrawl', stars: '24k', desc: 'Turn entire websites into clean Markdown and structured LLM-ready data', url: 'https://github.com/mendableai/firecrawl' },
    { name: 'browserbase/stagehand', stars: '8.4k', desc: 'AI web browsing framework built on Playwright with natural language actions', url: 'https://github.com/browserbase/stagehand' },
  ],
  'ocr_document_intelligence': [
    { name: 'baidu/Unlimited-OCR', stars: '2.4k', desc: 'Long-context document parsing & LaTeX math extraction via R-SWA attention', url: 'https://github.com/baidu/Unlimited-OCR' },
    { name: 'PaddlePaddle/PaddleOCR', stars: '45k', desc: 'Awesome multilingual OCR toolkits based on deep learning', url: 'https://github.com/PaddlePaddle/PaddleOCR' },
    { name: 'VikParuchuri/surya', stars: '14k', desc: 'Accurate multilingual OCR, layout analysis, and reading order detection', url: 'https://github.com/VikParuchuri/surya' },
  ],
  'embedded_aerospace': [
    { name: 'nasa/fprime', stars: '4.9k', desc: 'NASA JPL component-driven flight software framework for CubeSats and space missions', url: 'https://github.com/nasa/fprime' },
    { name: 'zephyrproject-rtos/zephyr', stars: '12k', desc: 'Scalable real-time operating system (RTOS) supporting multiple hardware architectures', url: 'https://github.com/zephyrproject-rtos/zephyr' },
    { name: 'PX4/PX4-Autopilot', stars: '8.8k', desc: 'Open-source flight control software for drones and autonomous aerospace vehicles', url: 'https://github.com/PX4/PX4-Autopilot' },
  ],
}

/**
 * Searches GitHub API or returns curated similar repositories
 */
export async function findSimilarRepos(query = '', category = '', limit = 6) {
  const normQuery = query.toLowerCase().trim()

  // 1. Check curated categories first
  if (category && CURATED_REPO_CATEGORIES[category]) {
    return {
      category,
      total: CURATED_REPO_CATEGORIES[category].length,
      repositories: CURATED_REPO_CATEGORIES[category].slice(0, limit),
    }
  }

  for (const [catKey, repos] of Object.entries(CURATED_REPO_CATEGORIES)) {
    if (repos.some(r => r.name.toLowerCase().includes(normQuery) || r.desc.toLowerCase().includes(normQuery))) {
      return {
        matchedCategory: catKey,
        total: repos.length,
        repositories: repos.slice(0, limit),
      }
    }
  }

  // 2. Query GitHub Public Search API
  try {
    const apiQuery = query ? encodeURIComponent(query) : 'stars:>500'
    const resp = await fetch(`https://api.github.com/search/repositories?q=${apiQuery}&sort=stars&order=desc&per_page=${limit}`, {
      headers: { 'User-Agent': 'YogatikRepoFinder/1.0' },
    })

    if (resp.ok) {
      const data = await resp.json()
      const repos = (data.items || []).map(item => ({
        name: item.full_name,
        stars: item.stargazers_count >= 1000 ? `${(item.stargazers_count / 1000).toFixed(1)}k` : `${item.stargazers_count}`,
        desc: item.description || 'No description provided.',
        url: item.html_url,
        language: item.language || 'Unknown',
        topics: item.topics || [],
        openIssues: item.open_issues_count,
        updatedAt: item.updated_at,
      }))
      return {
        query,
        total: repos.length,
        repositories: repos,
      }
    }
  } catch {
    // fallback
  }

  return {
    query,
    total: 0,
    repositories: [],
    message: `No external results returned for "${query}". Check curated categories.`,
  }
}

/**
 * Inspect detailed repository statistics and health metrics
 */
export async function inspectRepoHealth(repoFullName = '') {
  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) {
    return { success: false, error: 'Please provide repository in "owner/repo" format.' }
  }

  try {
    const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { 'User-Agent': 'YogatikRepoFinder/1.0' },
    })

    if (resp.ok) {
      const data = await resp.json()
      return {
        success: true,
        name: data.full_name,
        stars: data.stargazers_count,
        forks: data.forks_count,
        openIssues: data.open_issues_count,
        license: data.license?.spdx_id || data.license?.name || 'None',
        language: data.language,
        createdAt: data.created_at,
        pushedAt: data.pushed_at,
        topics: data.topics || [],
        defaultBranch: data.default_branch,
        url: data.html_url,
        archived: data.archived,
      }
    }
  } catch {
    // fallback
  }

  return {
    success: true,
    name: repoFullName,
    url: `https://github.com/${repoFullName}`,
    status: 'queried',
  }
}

export const repoFinderTool = {
  schema: {
    name: 'repo_finder',
    description: 'GitHub repository finder, similarity discovery, and open-source intelligence tool. Discovers trending AI/developer repositories, finds alternatives/similar libraries, and audits repository health metrics.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['find_similar', 'inspect_repo', 'list_categories', 'explore_trending'],
          description: 'Action to perform.',
        },
        query: {
          type: 'string',
          description: 'Search keyword, topic, or reference repository name (e.g. "turbovec", "numbat", "deepsec", "threeui", "fprime").',
        },
        category: {
          type: 'string',
          enum: ['ai_agents', 'security_defense', 'vector_rag', '3d_web_graphics', 'headless_browsers_scraping', 'ocr_document_intelligence', 'embedded_aerospace'],
          description: 'Curated category to explore.',
        },
        repo: {
          type: 'string',
          description: 'Full repository identifier in "owner/repo" format for inspect_repo (e.g. "nasa/fprime").',
        },
        limit: {
          type: 'number',
          description: 'Max repositories to return (default: 6).',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const { action, query = '', category = '', repo = '', limit = 6 } = args

    switch (action) {
      case 'find_similar':
      case 'explore_trending': {
        if (!query && !category) {
          return {
            success: true,
            action,
            categories: Object.keys(CURATED_REPO_CATEGORIES),
            allCurated: CURATED_REPO_CATEGORIES,
          }
        }
        const results = await findSimilarRepos(query, category, limit)
        return {
          success: true,
          action,
          ...results,
        }
      }

      case 'inspect_repo': {
        if (!repo) {
          return { success: false, error: 'Please provide "repo" in "owner/repo" format.' }
        }
        return await inspectRepoHealth(repo)
      }

      case 'list_categories': {
        return {
          success: true,
          action: 'list_categories',
          totalCategories: Object.keys(CURATED_REPO_CATEGORIES).length,
          categories: Object.keys(CURATED_REPO_CATEGORIES),
          catalog: CURATED_REPO_CATEGORIES,
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: find_similar, inspect_repo, list_categories, explore_trending.`,
        }
    }
  },
}
