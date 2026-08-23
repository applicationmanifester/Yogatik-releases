import { describe, it, expect } from 'vitest'
import {
  calculateCvssScore,
  hexstrikeReconTool,
  hexstrikeAuditHeadersTool,
  hexstrikeVulnScanTool,
  hexstrikeAttackSurfaceTool,
  hexstrikeGeneratePlaybookTool,
} from './hexstrike'

describe('HexStrike AI Security Suite', () => {
  describe('calculateCvssScore', () => {
    it('calculates CVSS v3.1 score and severity rating', () => {
      const cvss = calculateCvssScore({
        attackVector: 'NETWORK',
        confidentialityImpact: 'HIGH',
        integrityImpact: 'HIGH',
        availabilityImpact: 'HIGH',
      })
      expect(cvss.score).toBeGreaterThanOrEqual(9.0)
      expect(cvss.rating).toBe('CRITICAL')
      expect(cvss.vectorString).toContain('CVSS:3.1')
    })

    it('calculates Medium severity for limited impact', () => {
      const cvss = calculateCvssScore({
        attackVector: 'NETWORK',
        confidentialityImpact: 'LOW',
        integrityImpact: 'LOW',
        availabilityImpact: 'NONE',
      })
      expect(cvss.score).toBeGreaterThanOrEqual(4.0)
      expect(cvss.score).toBeLessThan(7.0)
      expect(cvss.rating).toBe('MEDIUM')
    })
  })

  describe('hexstrikeReconTool', () => {
    it('performs reconnaissance on target URL', async () => {
      const res = await hexstrikeReconTool.execute({ target: 'https://api.yogatik.ai', deep_scan: true })
      expect(res.success).toBe(true)
      expect(res.hostname).toBe('api.yogatik.ai')
      expect(res.protocol).toBe('https')
      expect(res.sslTlsStatus).toContain('Enforced')
      expect(res.ports.length).toBeGreaterThanOrEqual(2)
      expect(res.technologies.some(t => t.category === 'API')).toBe(true)
    })
  })

  describe('hexstrikeAuditHeadersTool', () => {
    it('audits missing headers and assigns a security grade', async () => {
      const res = await hexstrikeAuditHeadersTool.execute({
        url: 'https://test.com',
        headers: {
          'x-frame-options': 'DENY',
          'access-control-allow-origin': '*',
        },
      })
      expect(res.success).toBe(true)
      expect(res.securityScore).toBeDefined()
      expect(res.cors.isWildcard).toBe(true)
      expect(res.hardeningSnippets.nginx).toContain('add_header Content-Security-Policy')
      expect(res.hardeningSnippets.express).toContain('helmet')
    })
  })

  describe('hexstrikeVulnScanTool', () => {
    it('identifies dangerous patterns such as innerHTML and hardcoded tokens', async () => {
      const vulnerableCode = `
        const apiKey = "sk_live_FAKE_KEY_FOR_TESTING_ONLY_NOT_REAL";
        document.getElementById('out').innerHTML = userInput;
      `
      const res = await hexstrikeVulnScanTool.execute({ code_or_config: vulnerableCode, scope: 'Frontend' })
      expect(res.success).toBe(true)
      expect(res.findingsCount).toBeGreaterThanOrEqual(2)
      expect(res.findings.some(f => f.category.includes('Cryptographic'))).toBe(true)
      expect(res.findings.some(f => f.category.includes('Injection'))).toBe(true)
      expect(res.maxCvssScore).toBeGreaterThanOrEqual(7.0)
    })

    it('reports clean status on safe code', async () => {
      const safeCode = `
        const count = 42;
        console.log("Safe calculation:", count * 2);
      `
      const res = await hexstrikeVulnScanTool.execute({ code_or_config: safeCode })
      expect(res.success).toBe(true)
      expect(res.overallRisk).toBe('LOW')
      expect(res.findings[0].id).toBe('HEX-VULN-CLEAN')
    })
  })

  describe('hexstrikeAttackSurfaceTool', () => {
    it('categorizes attack vectors across route surfaces', async () => {
      const endpoints = ['/api/auth/login', '/admin/dashboard', '/api/upload', '/api/webhooks/stripe']
      const res = await hexstrikeAttackSurfaceTool.execute({ routes_or_endpoints: endpoints })
      expect(res.success).toBe(true)
      expect(res.totalEndpoints).toBe(4)
      expect(res.exposureIndex).toBeGreaterThan(0)
      expect(res.surfaceBreakdown.some(s => s.vector === 'AUTHENTICATION_SURFACE')).toBe(true)
      expect(res.surfaceBreakdown.some(s => s.vector === 'PRIVILEGED_ADMIN_ROUTE')).toBe(true)
      expect(res.surfaceBreakdown.some(s => s.vector === 'FILE_INGESTION_VECTOR')).toBe(true)
    })
  })

  describe('hexstrikeGeneratePlaybookTool', () => {
    it('generates a formatted defensive remediation playbook', async () => {
      const res = await hexstrikeGeneratePlaybookTool.execute({
        title: 'Payment Gateway Security Hardening',
        vulnerabilities: ['Unsafe CORS Wildcard', 'Missing HSTS'],
        target_system: 'Billing Gateway',
      })
      expect(res.success).toBe(true)
      expect(res.playbookMarkdown).toContain('HexStrike AI Defensive Playbook')
      expect(res.playbookMarkdown).toContain('Payment Gateway Security Hardening')
      expect(res.playbookMarkdown).toContain('Unsafe CORS Wildcard')
    })
  })
})
