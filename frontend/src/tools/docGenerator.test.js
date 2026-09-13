import { describe, it, expect } from 'vitest'
import {
  generateWordDoc,
  generateExcelWorkbook,
  parseMarkdownTable,
  generateSlideDeck,
  generateInvoice,
  generateCertificate,
  generateMarkdownDoc,
  generateApiSpec,
  generateSystemReport,
  documentGeneratorTool,
} from './docGenerator'

describe('docGenerator suite (Independent Document Generation)', () => {
  describe('Word Document (.doc/.docx XML)', () => {
    it('generates standard Word document with docx format by default', () => {
      const res = generateWordDoc({
        title: 'Project Roadmap',
        content: '# Phase 1\n- Task A\n- Task B\n\n| Item | Cost |\n|---|---|\n| Server | $100 |',
        author: 'Lead Architect',
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('docx')
      expect(res.filename).toBe('project_roadmap.docx')
      expect(res.data_url).toContain('data:application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    })

    it('generates legacy .doc format when explicitly specified', () => {
      const res = generateWordDoc({
        title: 'Legacy Memo',
        content: 'Memo text',
        format: 'doc',
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('doc')
      expect(res.filename).toBe('legacy_memo.doc')
      expect(res.data_url).toContain('data:application/msword;charset=utf-8,')
    })
  })

  describe('Standard Excel Workbook (.xlsx Office XML Spreadsheet)', () => {
    it('generates valid multi-column XML Spreadsheet from rows and columns', () => {
      const res = generateExcelWorkbook({
        title: 'Q3 Financials',
        columns: ['Department', 'Budget', 'Actual', 'Variance'],
        rows: [
          ['Engineering', 120000, 115000, 5000],
          ['Marketing', 45000, 48000, -3000],
          ['Operations', 30000, 29500, 500],
        ],
        includeSummary: true,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('xlsx')
      expect(res.filename).toBe('q3_financials.xlsx')
      expect(res.xml).toContain('urn:schemas-microsoft-com:office:spreadsheet')
      expect(res.xml).toContain('<Worksheet ss:Name="Q3 Financials">')
      expect(res.xml).toContain('ss:StyleID="Header"')
      expect(res.xml).toContain('Total')
    })

    it('parses markdown tables and converts directly into styled Excel workbook', () => {
      const mdTable = `
| Quarter | Target Revenue | Actual Revenue | Growth |
| :--- | :--- | :--- | :--- |
| Q1 2026 | $100,000 | $108,000 | 8% |
| Q2 2026 | $130,000 | $142,000 | 9.2% |
`
      const parsed = parseMarkdownTable(mdTable)
      expect(parsed).not.toBeNull()
      expect(parsed.headers).toEqual(['Quarter', 'Target Revenue', 'Actual Revenue', 'Growth'])
      expect(parsed.rows.length).toBe(2)

      const res = generateExcelWorkbook({
        title: 'Quarterly Growth',
        content: mdTable,
      })
      expect(res.success).toBe(true)
      expect(res.rows_count).toBe(2)
      expect(res.filename).toBe('quarterly_growth.xlsx')
    })
  })

  describe('HTML5 Slide Deck (Marp/Reveal style)', () => {
    it('parses markdown slides separated by --- and generates interactive deck', () => {
      const res = generateSlideDeck({
        title: 'AI Product Strategy',
        slides: '# Introduction\n\nWelcome to the deck\n---\n# Architecture\n\n- Frontend\n- AI Core\n---\n# Conclusion\n\nThank you!',
        theme: 'midnight',
      })
      expect(res.success).toBe(true)
      expect(res.slides_count).toBe(3)
      expect(res.filename).toBe('ai_product_strategy_slides.html')
      expect(res.data_url).toContain('data:text/html;charset=utf-8,')
    })
  })

  describe('Business Invoice Generator', () => {
    it('calculates line item totals, tax, and generates printable invoice', () => {
      const res = generateInvoice({
        invoice_number: 'INV-2026-001',
        currency: 'USD',
        sender: { name: 'Acme Systems Inc' },
        client: { name: 'Globex Corp' },
        items: [
          { description: 'Cloud Engineering', quantity: 20, unit_price: 150 },
          { description: 'Security Audit', quantity: 1, unit_price: 1200 },
        ],
        tax_percent: 10,
        discount: 200,
      })
      expect(res.success).toBe(true)
      expect(res.invoice_number).toBe('INV-2026-001')
      expect(res.total_due).toBe('$4400.00')
      expect(res.filename).toContain('inv_2026_001.html')
    })
  })

  describe('Certificate Generator', () => {
    it('creates ornate award certificate with seal and signatory', () => {
      const res = generateCertificate({
        recipient_name: 'Dr. Jane Doe',
        title: 'Certificate of Excellence',
        achievement: 'Pioneering Research in Autonomous Multi-Agent Workflows',
        issuer_name: 'Global AI Institute',
        signatory: 'Prof. Alan Turing',
      })
      expect(res.success).toBe(true)
      expect(res.recipient_name).toBe('Dr. Jane Doe')
      expect(res.filename).toBe('certificate_dr_jane_doe.html')
      expect(res.cert_id).toMatch(/^CERT-/)
    })
  })

  describe('Structured Markdown Documentation', () => {
    it('creates formatted markdown doc with table of contents and metadata header', () => {
      const res = generateMarkdownDoc({
        title: 'API Architecture Guide',
        content: '## Overview\nSystem overview here.\n\n## Data Layer\nDatabase and caching details.\n\n### Indexing Strategy\nVector and BM25 index.',
        author: 'Chief Architect',
        tags: ['architecture', 'api'],
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('markdown')
      expect(res.filename).toBe('api_architecture_guide.md')
      expect(res.content).toContain('## Table of Contents')
      expect(res.content).toContain('[Overview](#overview)')
      expect(res.content).toContain('[Data Layer](#data-layer)')
      expect(res.content).toContain('tags: ["architecture", "api"]')
    })
  })

  describe('OpenAPI 3.0 API Specification', () => {
    it('creates valid OpenAPI 3.0 spec JSON document', () => {
      const res = generateApiSpec({
        title: 'Yogatik Core Service',
        version: '2.0.0',
        description: 'Microservice API endpoints',
        endpoints: [
          { path: '/api/v1/health', method: 'GET', summary: 'Health check' },
          { path: '/api/v1/chat', method: 'POST', summary: 'Send message' },
        ],
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('openapi_json')
      expect(res.spec.openapi).toBe('3.0.0')
      expect(res.spec.info.title).toBe('Yogatik Core Service')
      expect(res.spec.paths['/api/v1/health'].get).toBeDefined()
      expect(res.spec.paths['/api/v1/chat'].post).toBeDefined()
    })
  })

  describe('Executive System Report', () => {
    it('creates formatted architecture and audit report', () => {
      const res = generateSystemReport({
        title: 'Production Readiness Audit',
        target: 'Frontend Web & Electron Core',
        executiveSummary: 'System passed all readiness criteria.',
        findings: [
          { title: 'Test Coverage', severity: 'low', detail: '2,500+ tests passing.' }
        ],
        recommendations: [
          { action: 'Monitor WebSocket connections', detail: 'Ensure graceful reconnection.' }
        ],
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('markdown_report')
      expect(res.filename).toBe('production_readiness_audit.md')
      expect(res.content).toContain('## 1. Executive Summary')
      expect(res.content).toContain('## 2. Key Findings & Observations')
      expect(res.content).toContain('🟢 2.1 Test Coverage')
    })
  })

  describe('documentGeneratorTool execute dispatch', () => {
    it('dispatches to word_docx', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'word_docx',
        title: 'Summary Report',
        content: '# Executive Summary\nAll goals achieved.',
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('docx')
      expect(res.filename).toBe('summary_report.docx')
    })

    it('dispatches to excel_workbook', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'excel_workbook',
        title: 'Sales Forecast',
        spreadsheet_columns: ['Month', 'Sales', 'Target'],
        spreadsheet_rows: [
          ['January', 12000, 10000],
          ['February', 15000, 13000],
        ],
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('xlsx')
      expect(res.filename).toBe('sales_forecast.xlsx')
    })

    it('dispatches to csv_spreadsheet', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'csv_spreadsheet',
        title: 'Financial Model',
        spreadsheet_rows: [
          { quarter: 'Q1', revenue: 50000, expenses: 32000 },
          { quarter: 'Q2', revenue: 65000, expenses: 38000 },
        ],
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.rows_count).toBe(2)
      expect(res.filename).toBe('financial_model.csv')
    })

    it('dispatches to markdown_doc with auto-save', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'markdown_doc',
        title: 'Release Guide',
        content: '## Setup\nRun npm install.\n\n## Build\nRun npm run build.',
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('markdown')
      expect(res.headings_count).toBe(2)
    })

    it('dispatches to api_spec', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'api_spec',
        title: 'Gateway API',
        content: 'Main Bot Gateway API',
        endpoints: [{ path: '/api/chat', method: 'post' }],
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('openapi_json')
      expect(res.endpoints_count).toBe(1)
    })

    it('dispatches to system_report', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'system_report',
        title: 'System Health Check',
        executive_summary: 'All nodes green.',
        save_to_workspace: false,
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('markdown_report')
    })
  })
})

