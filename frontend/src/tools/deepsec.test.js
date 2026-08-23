import { describe, it, expect } from 'vitest'
import {
  deepsecScan,
  deepsecInvestigate,
  deepsecRevalidate,
  deepsecEnrich,
  deepsecExport,
  runDeepsecAudit,
  deepsecTool,
  VULNERABILITY_RULES,
} from './deepsec'

describe('Deepsec Security Audit Pipeline', () => {
  const sampleVulnerableCode = `
const express = require('express')
const fs = require('fs')
const { exec } = require('child_process')
const app = express()

// 1. Path Traversal
app.get('/download', (req, res) => {
  const file = req.query.file
  const content = fs.readFileSync('/var/data/' + req.query.file, 'utf8')
  res.send(content)
})

// 2. SQL Injection
app.get('/user', async (req, res) => {
  const query = \`SELECT * FROM users WHERE id = \${req.query.id}\`
  const user = await db.query(query)
  res.json(user)
})

// 3. Command Injection
app.post('/ping', (req, res) => {
  exec(\`ping -c 1 \${req.body.host}\`, (err, stdout) => {
    res.send(stdout)
  })
})

// 4. SSRF
app.get('/proxy', async (req, res) => {
  const response = await fetch(req.query.targetUrl)
  res.send(await response.text())
})

// 5. Hardcoded Secret
const apiKey = 'AIzaSyD9xK8L1P0m7Q2w4E6r8T0y2U4i6O8p0'
const jwtSecret = 'secret_key_1234567890_super_secret'

// 6. XSS
app.get('/profile', (req, res) => {
  document.getElementById('name').innerHTML = req.query.name
})
`

  it('contains comprehensive vulnerability rules', () => {
    expect(VULNERABILITY_RULES.length).toBeGreaterThanOrEqual(10)
    const ruleIds = VULNERABILITY_RULES.map(r => r.id)
    expect(ruleIds).toContain('SEC-PATH-TRAVERSAL')
    expect(ruleIds).toContain('SEC-SQL-INJECTION')
    expect(ruleIds).toContain('SEC-COMMAND-INJECTION')
    expect(ruleIds).toContain('SEC-SSRF')
    expect(ruleIds).toContain('SEC-HARDCODED-SECRET')
    expect(ruleIds).toContain('SEC-XSS')
  })

  it('Stage 1 (Scan): flags security-critical code patterns', () => {
    const candidates = deepsecScan(sampleVulnerableCode, 'server.js')
    expect(candidates.length).toBeGreaterThanOrEqual(5)

    const categories = candidates.map(c => c.category)
    expect(categories).toContain('Path Traversal')
    expect(categories).toContain('Injection')
    expect(categories).toContain('RCE')
    expect(categories).toContain('SSRF')
    expect(categories).toContain('Secrets')
  })

  it('Stage 2 (Investigate): traces taint and assigns confidence', () => {
    const candidates = deepsecScan(sampleVulnerableCode, 'server.js')
    const investigated = deepsecInvestigate(candidates, sampleVulnerableCode)

    expect(investigated.length).toBe(candidates.length)
    for (const item of investigated) {
      expect(item).toHaveProperty('taintTracked', true)
      expect(item).toHaveProperty('confidence')
    }
  })

  it('Stage 3 (Revalidate): filters false positives and calculates CVSS', () => {
    const safeCode = `
// Parameterized query (safe)
const user = await db.query('SELECT * FROM users WHERE id = $1', [req.query.id])
// Placeholder string (not a real secret)
const apiKey = "your_api_key_placeholder"
`
    const candidates = deepsecScan(safeCode, 'safe.js')
    const investigated = deepsecInvestigate(candidates, safeCode)
    const revalidated = deepsecRevalidate(investigated)

    // False positives should be eliminated
    const secretFindings = revalidated.filter(f => f.ruleId === 'SEC-HARDCODED-SECRET')
    expect(secretFindings.length).toBe(0)

    for (const f of revalidated) {
      expect(f.cvssScore).toBeGreaterThan(0)
      expect(f.status).toBe('VERIFIED')
    }
  })

  it('Stage 4 (Enrich): attaches CWE IDs and suggested remediation diffs', () => {
    const candidates = deepsecScan(sampleVulnerableCode, 'server.js')
    const investigated = deepsecInvestigate(candidates, sampleVulnerableCode)
    const revalidated = deepsecRevalidate(investigated)
    const enriched = deepsecEnrich(revalidated)

    expect(enriched.length).toBeGreaterThan(0)
    for (const f of enriched) {
      expect(f).toHaveProperty('findingId')
      expect(f).toHaveProperty('suggestedFix')
      expect(f.suggestedFix.length).toBeGreaterThan(5)
      expect(f).toHaveProperty('cwe')
      expect(f.cwe).toMatch(/^CWE-\d+$/)
    }
  })

  it('Stage 5 (Export): exports formatted markdown, json/sarif, and tickets', () => {
    const audit = runDeepsecAudit({
      code: sampleVulnerableCode,
      fileName: 'server.js',
      format: 'markdown',
    })

    expect(audit.success).toBe(true)
    expect(audit.totalFindings).toBeGreaterThanOrEqual(4)
    expect(typeof audit.report).toBe('string')
    expect(audit.report).toContain('Deepsec Security Audit Report')
    expect(audit.report).toContain('Executive Summary')

    // JSON export
    const jsonAudit = runDeepsecAudit({
      code: sampleVulnerableCode,
      fileName: 'server.js',
      format: 'json',
    })
    expect(jsonAudit.report).toHaveProperty('tool', 'deepsec')
    expect(jsonAudit.report.summary.total).toBeGreaterThan(0)

    // Tickets export
    const ticketAudit = runDeepsecAudit({
      code: sampleVulnerableCode,
      fileName: 'server.js',
      format: 'tickets',
    })
    expect(Array.isArray(ticketAudit.report)).toBe(true)
    expect(ticketAudit.report[0]).toHaveProperty('title')
    expect(ticketAudit.report[0]).toHaveProperty('body')
  })

  it('deepsecTool execution handles clean code correctly', async () => {
    const cleanCode = `
// Pure math utility
function add(a, b) {
  return a + b
}
module.exports = { add }
`
    const result = await deepsecTool.execute({ code: cleanCode, fileName: 'math.js' })
    expect(result.success).toBe(true)
    expect(result.totalFindings).toBe(0)
    expect(result.report).toContain('PASSED')
  })

  it('deepsecTool rejects empty input gracefully', async () => {
    const result = await deepsecTool.execute({ code: '' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Please provide source code')
  })

  it('filters findings by severity correctly', () => {
    const auditCritOnly = runDeepsecAudit({
      code: sampleVulnerableCode,
      fileName: 'server.js',
      severityFilter: 'critical',
    })

    for (const f of auditCritOnly.findings) {
      expect(f.severity).toBe('CRITICAL')
    }
  })
})
