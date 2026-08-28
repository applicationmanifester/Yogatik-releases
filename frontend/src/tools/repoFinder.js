/**
 * GitHub Repo Finder & Open-Source Discovery Engine
 * 
 * Empowers AI agents to find similar repositories, explore trending AI/dev tools,
 * inspect repository health metrics, analyze tech stacks, and compare alternative open-source projects.
 */

export const CURATED_REPO_CATEGORIES = {
  'autonomous_computer_agents': [
    { name: 'OpenClaw/OpenClaw', stars: '3.2k', desc: 'Personal AI assistant that clears inbox, sends emails, manages calendar, checks in for flights via messaging apps.', url: 'https://github.com/OpenClaw/OpenClaw' },
    { name: 'anthropics/anthropic-quickstarts', stars: '8.1k', desc: 'Claude Computer Use reference: screenshot → thought → action loop controlling full desktop (mouse, keyboard, apps).', url: 'https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo' },
    { name: 'holaboss-ai/holaOS', stars: '10.9k', desc: 'Agentic OS: 100+ MCP integrations, shared memory, multi-agent workflows, local-first. Electron + browser.', url: 'https://github.com/holaboss-ai/holaOS' },
    { name: 'siddsachar/row-bot', stars: '1.5k', desc: 'Personal AI sovereignty: knowledge graph, voice, vision, browser automation, scheduled tasks, persistent memory.', url: 'https://github.com/siddsachar/row-bot' },
    { name: 'taracodlabs/aiden', stars: '790', desc: 'Autonomous computer agent: browser control, terminal, workflows, persistent memory, AGPL-3.0.', url: 'https://github.com/taracodlabs/aiden' },
  ],
  'browser_native_agents': [
    { name: 'browser-use/browser-use', stars: '22k', desc: 'High-level autonomous web browsing for AI agents with self-healing actions.', url: 'https://github.com/browser-use/browser-use' },
    { name: 'browserbase/stagehand', stars: '7.8k', desc: 'Deterministic, self-healing web automation via CDP + accessibility tree (used by OpenAI Operator).', url: 'https://github.com/browserbase/stagehand' },
    { name: 'NativeMindBrowser/NativeMindExtension', stars: '1.1k', desc: 'Chrome extension with on-device LLM (WebLLM) + Ollama in browser sidebar.', url: 'https://github.com/NativeMindBrowser/NativeMindExtension' },
    { name: 'Ryan-yang125/ChatLLM-Web', stars: '629', desc: 'PWA chat + agent workspace powered by WebGPU/WebLLM.', url: 'https://github.com/Ryan-yang125/ChatLLM-Web' },
    { name: 'RunanywhereAI/on-device-browser-agent', stars: '299', desc: '100% local browser agent via WebLLM. Zero API keys, zero cloud.', url: 'https://github.com/RunanywhereAI/on-device-browser-agent' },
  ],
  'companion_memory_personality': [
    { name: 'lobehub/lobe-chat', stars: '48.3k', desc: 'Multi-modal client, plugin ecosystem, agent marketplace, knowledge base, TTS/STT.', url: 'https://github.com/lobehub/lobe-chat' },
    { name: 'chatboxai/chatbox', stars: '41.6k', desc: 'Polished desktop/web AI client, multi-provider, prompt library, conversation branching.', url: 'https://github.com/chatboxai/chatbox' },
    { name: 'memgpt/memgpt', stars: '15.2k', desc: 'OS-like memory paging: main context ↔ external storage (SQLite/VecDB) for infinite agent context.', url: 'https://github.com/memgpt/memgpt' },
    { name: 'getzep/zep', stars: '3.8k', desc: 'Temporal knowledge graph: entities, relationships, time, contradictions for long-term memory.', url: 'https://github.com/getzep/zep' },
    { name: 'skalesapp/skales', stars: '1.7k', desc: 'Personal AI agent (desktop + browser), multi-agent workflows, 15+ providers, BYOK.', url: 'https://github.com/skalesapp/skales' },
  ],
  'voice_embodied_companions': [
    { name: 'kyutai/moshi', stars: '5.2k', desc: 'Real-time full-duplex speech model that thinks while listening with zero turn latency.', url: 'https://github.com/kyutai/moshi' },
    { name: 'livekit/agents', stars: '2.1k', desc: 'Voice AI framework: WebRTC, SIP, telephony, real-time multi-agent cascade.', url: 'https://github.com/livekit/agents' },
    { name: 'huggingface/transformers.js-examples', stars: '2.1k', desc: 'Streaming in-browser ASR → LLM → TTS all client-side via WebRTC & WebAudio.', url: 'https://github.com/huggingface/transformers.js-examples/tree/main/realtime-voice' },
    { name: 'vishnumenon/ermine-ai', stars: '325', desc: '100% client-side live audio transcription (Whisper via Transformers.js).', url: 'https://github.com/vishnumenon/ermine-ai' },
  ],
  'specialized_work_bots': [
    { name: 'anthropics/claude-code', stars: '45k', desc: 'Agentic coding in terminal: autonomously read, edit, execute, and test codebases.', url: 'https://github.com/anthropics/claude-code' },
    { name: 'block/goose', stars: '6.5k', desc: 'Agentic IDE in browser: file tree, terminal, diff review, chat, and MCP tools.', url: 'https://github.com/block/goose' },
    { name: 'assafelovic/gpt-researcher', stars: '19k', desc: 'Autonomous research agent: browses multiple sources, summarizes, cites, and writes full reports.', url: 'https://github.com/assafelovic/gpt-researcher' },
    { name: 'e2b-dev/e2b', stars: '9.2k', desc: 'Secure sandboxed VMs (Firecracker) for autonomous code execution and data analysis.', url: 'https://github.com/e2b-dev/e2b' },
  ],
  'browser_native_llm': [
    { name: 'huggingface/transformers.js', stars: '16.3k', desc: 'Run any 🤗 model in-browser (embeddings, classification, generation, speech). Zero server.', url: 'https://github.com/huggingface/transformers.js' },
    { name: 'mlc-ai/web-llm', stars: '12k+', desc: 'WebGPU-accelerated in-browser LLM inference (Llama, Gemma, Phi, Qwen).', url: 'https://github.com/mlc-ai/web-llm' },
  ],
  'chat_ui_clients': [
    { name: 'open-webui/open-webui', stars: '150k', desc: 'Full-featured self-hosted AI UI: RAG, tools, auth, Ollama/OpenAI.', url: 'https://github.com/open-webui/open-webui' },
    { name: 'ChatGPTNextWeb/NextChat', stars: '88.7k', desc: 'Cross-platform AI chat client (Web, iOS, Android, Desktop), light & fast.', url: 'https://github.com/ChatGPTNextWeb/NextChat' },
  ],
  'in_browser_rag_memory': [
    { name: 'do-me/SemanticFinder', stars: '325', desc: 'Live semantic search in browser using Transformers.js + CodeMirror.', url: 'https://github.com/do-me/SemanticFinder' },
    { name: 'nico-martin/gemma4-browser-extension', stars: '1.2k', desc: 'Chrome extension with on-device Gemma + Transformers.js.', url: 'https://github.com/nico-martin/gemma4-browser-extension' },
    { name: 'ryancodrai/turbovec', stars: '2.9k', desc: 'TurboQuant-powered randomized vector quantization & ultra-low latency RAG.', url: 'https://github.com/ryancodrai/turbovec' },
  ],
  'ai_agents': [
    { name: 'Panniantong/Agent-Reach', stars: '4.2k', desc: 'Universal open-web reader & intelligence gatherer across 13+ networks', url: 'https://github.com/Panniantong/Agent-Reach' },
    { name: 'crewAIInc/crewAI', stars: '28k', desc: 'Framework for orchestrating role-playing autonomous AI agent crews', url: 'https://github.com/crewAIInc/crewAI' },
    { name: 'geekan/MetaGPT', stars: '45k', desc: 'Multi-agent framework assigning product manager, architect, and engineer roles', url: 'https://github.com/geekan/MetaGPT' },
  ],
  'security_defense': [
    { name: 'guardrails-ai/guardrails', stars: '5.2k', desc: 'Structured validation, hallucination guards, and PII filters for LLM outputs', url: 'https://github.com/guardrails-ai/guardrails' },
    { name: 'perplexityai/numbat', stars: '3.5k', desc: 'Agent security suite for visibility, pre-action blocking, and session forensics', url: 'https://github.com/perplexityai/numbat' },
    { name: 'protectai/rebuff', stars: '2.1k', desc: 'Multi-layered prompt injection detection and canary defense engine', url: 'https://github.com/protectai/rebuff' },
    { name: 'vercel-labs/deepsec', stars: '2.8k', desc: 'Automated 5-stage application security testing and vulnerability audit harness', url: 'https://github.com/vercel-labs/deepsec' },
  ],
  'vector_rag': [
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
