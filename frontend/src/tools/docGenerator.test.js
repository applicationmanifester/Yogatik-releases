import { describe, it, expect } from 'vitest'
import {
  generateWordDoc,
  generateSlideDeck,
  generateInvoice,
  generateCertificate,
  documentGeneratorTool,
} from './docGenerator'

describe('docGenerator suite (Independent Document Generation)', () => {
  describe('Word Document (.doc/.docx XML)', () => {
    it('generates standard Word document with HTML/MHTML styling', () => {
      const res = generateWordDoc({
        title: 'Project Roadmap',
        content: '# Phase 1\n- Task A\n- Task B\n\n| Item | Cost |\n|---|---|\n| Server | $100 |',
        author: 'Lead Architect',
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('doc')
      expect(res.filename).toBe('project_roadmap.doc')
      expect(res.data_url).toContain('data:application/msword;charset=utf-8,')
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
      // Subtotal = 3000 + 1200 = 4200. Discount = 200 => 4000. Tax = 400 => Total = 4400.
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

  describe('documentGeneratorTool execute dispatch', () => {
    it('dispatches to word_docx', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'word_docx',
        title: 'Summary Report',
        content: '# Executive Summary\nAll goals achieved.',
      })
      expect(res.success).toBe(true)
      expect(res.format).toBe('doc')
    })

    it('dispatches to csv_spreadsheet', async () => {
      const res = await documentGeneratorTool.execute({
        document_type: 'csv_spreadsheet',
        title: 'Financial Model',
        spreadsheet_rows: [
          { quarter: 'Q1', revenue: 50000, expenses: 32000 },
          { quarter: 'Q2', revenue: 65000, expenses: 38000 },
        ],
      })
      expect(res.success).toBe(true)
      expect(res.rows_count).toBe(2)
      expect(res.filename).toBe('financial_model.csv')
    })
  })
})
