import { describe, it, expect, beforeEach } from 'vitest'
import { formatBibtex, formatCslJson, type CitationItem } from '../tools/citationManager'
import { jobQueue } from '../api/jobQueue'
import { useChatStore } from '../stores/chatStore'

describe('Citation Manager Pipeline', () => {
  const samplePaper: CitationItem = {
    doi: '10.1109/ICSE.2024.00012',
    title: 'Autonomous Multi-Agent Systems in Software Engineering',
    authors: ['Alan Turing', 'Ada Lovelace'],
    year: 2024,
    journal: 'IEEE Transactions on Software Engineering',
    volume: '50',
    pages: '100-115',
  }

  it('generates valid BibTeX format with proper citeKey', () => {
    const bib = formatBibtex(samplePaper)
    expect(bib).toContain('@article{turing2024autonomous,')
    expect(bib).toContain('title = {Autonomous Multi-Agent Systems in Software Engineering}')
    expect(bib).toContain('author = {Alan Turing and Ada Lovelace}')
    expect(bib).toContain('year = {2024}')
  })

  it('exports structured CSL-JSON compatible with Zotero/Mendeley', () => {
    const csl = formatCslJson([samplePaper])
    expect(csl).toHaveLength(1)
    expect(csl[0].DOI).toBe('10.1109/ICSE.2024.00012')
    expect(csl[0].author).toEqual([
      { given: 'Alan', family: 'Turing' },
      { given: 'Ada', family: 'Lovelace' },
    ])
    expect(csl[0].issued['date-parts'][0][0]).toBe(2024)
  })
})

describe('Async Job Queue & Progress Telemetry', () => {
  it('creates, runs, and resolves background jobs with logs', async () => {
    const job = jobQueue.createJob('latex_compile', { texFile: 'paper.tex' })
    expect(job.status).toBe('queued')

    const runPromise = jobQueue.runJob(job.id, async (payload: any, { updateProgress }) => {
      updateProgress(40, 'Compiling bibtex')
      updateProgress(80, 'Generating PDF pages')
      return { pdfUrl: 'blob:pdf_out' }
    })

    const completedJob = await runPromise
    expect(completedJob.status).toBe('completed')
    expect(completedJob.progress).toBe(100)
    expect(completedJob.result).toEqual({ pdfUrl: 'blob:pdf_out' })
    expect(completedJob.logs.some((l) => l.includes('Compiling bibtex'))).toBe(true)
  })
})

describe('Chat Store State Management & Branching', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeSessionId: 'test_sess',
      sessions: {
        test_sess: {
          id: 'test_sess',
          title: 'Test',
          activeLeafId: '',
          messages: {},
        },
      },
    })
  })

  it('creates sessions and records message branching', () => {
    const store = useChatStore.getState()
    const msg1Id = store.addMessage({ role: 'user', content: 'Explore quantum computing' })
    const msg2Id = store.addMessage({ role: 'assistant', content: 'Quantum computing uses qubits...' })

    expect(msg1Id).toBeDefined()
    expect(msg2Id).toBeDefined()

    const activeSession = useChatStore.getState().sessions['test_sess']
    expect(Object.keys(activeSession.messages)).toHaveLength(2)
    expect(activeSession.activeLeafId).toBe(msg2Id)

    // Branch conversation back to message 1
    useChatStore.getState().branchFromMessage(msg1Id)
    expect(useChatStore.getState().sessions['test_sess'].activeLeafId).toBe(msg1Id)
  })
})

describe('Auth & Scope Authorization Middleware', () => {
  it('parses developer API keys and authorizes admin scopes', () => {
    import('../api/auth').then(({ parseToken, authorizeScope }) => {
      const session = parseToken('Bearer yk_live_testkey123')
      expect(session).not.toBeNull()
      expect(session?.role).toBe('admin')
      expect(authorizeScope(session, 'tool:execute')).toBe(true)
      expect(authorizeScope(session, 'research:admin')).toBe(true)
    })
  })

  it('rejects invalid or missing auth headers', () => {
    import('../api/auth').then(({ parseToken, authorizeScope }) => {
      expect(parseToken(undefined)).toBeNull()
      expect(parseToken('Basic xyz')).toBeNull()
      expect(authorizeScope(null, 'tool:execute')).toBe(false)
    })
  })
})

describe('Sliding-Window Rate Limiter Middleware', () => {
  it('allows requests within threshold and blocks exceeding calls', () => {
    import('../api/rateLimiter').then(({ rateLimiter }) => {
      const key = 'test_user_quota'
      rateLimiter.resetKey(key)

      const res1 = rateLimiter.checkLimit(key, 2, 10000)
      expect(res1.allowed).toBe(true)
      expect(res1.remaining).toBe(1)

      const res2 = rateLimiter.checkLimit(key, 2, 10000)
      expect(res2.allowed).toBe(true)
      expect(res2.remaining).toBe(0)

      const res3 = rateLimiter.checkLimit(key, 2, 10000)
      expect(res3.allowed).toBe(false)
      expect(res3.remaining).toBe(0)
    })
  })
})

describe('Overleaf Multi-File Packager', () => {
  it('builds complete bundle with main.tex, references.bib, and latexmkrc', async () => {
    const { buildOverleafProject } = await import('../tools/overleafPackager')
    const bundle = buildOverleafProject({
      title: 'Neural Network Hardware Accelerator',
      authors: ['Alice Smith', 'Bob Jones'],
      abstract: 'An efficient systolic array design.',
      keywords: ['VLSI', 'Deep Learning'],
      introduction: 'Intro section text.',
      relatedWork: 'Related work review.',
      methodology: 'Proposed hardware architecture.',
      experimentalResults: 'Evaluation results on TSMC 28nm.',
      conclusion: 'Conclusion text.',
      bibtexEntries: ['@article{smith2024, title={Systolic Arrays}, author={Smith, A.}, year={2024}}'],
    })

    expect(bundle.files.length).toBeGreaterThanOrEqual(7)
    expect(bundle.files.some((f) => f.filename === 'main.tex')).toBe(true)
    expect(bundle.files.some((f) => f.filename === 'references.bib')).toBe(true)
    expect(bundle.files.some((f) => f.filename === 'latexmkrc')).toBe(true)
    expect(bundle.files.some((f) => f.filename === 'README.md')).toBe(true)
  })
})

describe('Hardware Verification & UVM Generator', () => {
  it('generates UVM sequence items, driver, monitor, and scoreboard', async () => {
    const { generateUVMTestbench } = await import('../tools/verilogTools')
    const uvmCode = generateUVMTestbench('alu_core', [
      { name: 'clk', direction: 'input', type: 'logic' },
      { name: 'rst_n', direction: 'input', type: 'logic' },
      { name: 'op_a', direction: 'input', type: 'logic', width: '[31:0]' },
      { name: 'result', direction: 'output', type: 'logic', width: '[31:0]' },
    ])

    expect(uvmCode).toContain('class alu_core_seq_item extends uvm_sequence_item;')
    expect(uvmCode).toContain('class alu_core_driver extends uvm_driver')
    expect(uvmCode).toContain('class alu_core_monitor extends uvm_monitor;')
    expect(uvmCode).toContain('class alu_core_scoreboard extends uvm_scoreboard;')
  })
})

describe('Multi-Agent Research Swarm', () => {
  it('conducts peer review with Algorithm Architect, Verifier, and IEEE Reviewer', async () => {
    const { runResearchSwarmReview } = await import('../tools/researchSwarm')
    const report = await runResearchSwarmReview({
      title: 'Fault-Tolerant Quantum Arithmetic Units',
      problemStatement: 'Decoherence causes high error rates in surface code implementations.',
      methodology: 'Syndrome extraction pipeline with low-latency decoding.',
      expectedOutcome: '99.9% logical fidelity on standard benchmarks.',
    })

    expect(report.overallConsensusScore).toBeGreaterThan(0)
    expect(report.reviews).toHaveLength(3)
    expect(report.synthesizedRefinements.length).toBeGreaterThan(0)
    expect(['Accept', 'Minor Revision', 'Major Revision', 'Reject']).toContain(report.verdict)
  })
})

describe('PDF Structured Data Extraction', () => {
  it('extracts DOIs, figure captions, and tabular data as CSV', async () => {
    const { extractDoisFromReferences, extractFigureCaptions, extractTablesToCsv } = await import(
      '../tools/pdfResolver'
    )

    const sampleText = `
    References:
    [1] J. Smith, "Accelerators," 10.1109/TVLSI.2024.123456.
    [2] A. Turing, "Computing," 10.1145/3618400.

    Fig. 3: Power consumption breakdown across clock gating domains.

    Table I: Benchmark Latency Comparison
    Benchmark | Baseline (ns) | Proposed (ns) | Speedup
    AES-128   | 45.2          | 12.1          | 3.7x
    SHA-256   | 88.0          | 22.4          | 3.9x
    `

    const dois = extractDoisFromReferences(sampleText)
    expect(dois).toContain('10.1109/TVLSI.2024.123456')
    expect(dois).toContain('10.1145/3618400')

    const figures = extractFigureCaptions(sampleText)
    expect(figures).toHaveLength(1)
    expect(figures[0].figureNumber).toBe('Fig. 3')
    expect(figures[0].caption).toContain('Power consumption breakdown')

    const tables = extractTablesToCsv(sampleText)
    expect(tables).toHaveLength(1)
    expect(tables[0].tableNumber).toBe('Table I')
    expect(tables[0].csv).toContain('AES-128,45.2,12.1,3.7x')
  })
})

describe('LaTeX Diagnostic Log Parser', () => {
  it('locates undefined control sequence and missing packages from compiler logs', async () => {
    const { parseLatexErrors } = await import('../tools/latexSolver')

    const sampleLog = `
    ! Undefined control sequence.
    l.42 \\nonexistentmacro
                           {argument}
    LaTeX Error: File \`microtype.sty' not found.
    `

    const diagnostics = parseLatexErrors(sampleLog)
    expect(diagnostics.length).toBeGreaterThanOrEqual(2)
    expect(diagnostics.some((d) => d.errorType === 'undefined_control_sequence' && d.line === 42)).toBe(true)
    expect(diagnostics.some((d) => d.errorType === 'missing_package' && d.message.includes('microtype'))).toBe(true)
  })
})



