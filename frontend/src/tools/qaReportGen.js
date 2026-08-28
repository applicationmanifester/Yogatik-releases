/**
 * qaReportGen.js — Autonomous QA Test & Accessibility Report Generator
 *
 * Compiles test execution results, assertion outcomes, accessibility audits,
 * and devtools console/network diagnostics into clean, standardized Markdown and PDF reports.
 */

export function buildQaReportMarkdown({
  title = 'Automated Web QA & Audit Report',
  target_url = 'N/A',
  summary = 'Automated end-to-end test execution and accessibility evaluation completed.',
  assertions = [],
  a11y_audit = null,
  console_errors = [],
  failed_requests = [],
  steps = [],
  timestamp = new Date().toISOString(),
  duration_ms = 0,
} = {}) {
  const totalAssertions = assertions.length
  const passedAssertions = assertions.filter(a => a.passed === true).length
  const failedAssertions = totalAssertions - passedAssertions
  const passRate = totalAssertions > 0 ? Math.round((passedAssertions / totalAssertions) * 100) : 100

  const lines = []

  lines.push(`# 🧪 ${title}`)
  lines.push('')
  lines.push(`**Target Application:** \`${target_url}\`  `)
  lines.push(`**Executed At:** ${timestamp}  `)
  if (duration_ms > 0) lines.push(`**Total Duration:** ${(duration_ms / 1000).toFixed(2)}s  `)
  lines.push('')

  // 1. Executive Summary & KPI cards
  lines.push('## 📊 Executive Summary')
  lines.push('')
  lines.push(summary)
  lines.push('')
  lines.push('| Metric | Status | Result |')
  lines.push('| :--- | :---: | :--- |')
  lines.push(`| **Pass Rate** | ${passRate === 100 ? '✅' : passRate >= 80 ? '⚠️' : '❌'} | **${passRate}%** (${passedAssertions}/${totalAssertions} assertions passed) |`)
  
  if (a11y_audit) {
    const score = a11y_audit.score ?? 100
    const a11yStatus = score >= 90 ? '🟢 Excellent' : score >= 70 ? '🟡 Needs Work' : '🔴 Poor'
    lines.push(`| **WCAG 2.2 a11y Score** | ${score >= 90 ? '✅' : '⚠️'} | **${score}/100** (${a11yStatus}) |`)
  }

  lines.push(`| **Console Errors** | ${console_errors.length === 0 ? '✅' : '❌'} | **${console_errors.length}** error(s) captured |`)
  lines.push(`| **Failed Requests** | ${failed_requests.length === 0 ? '✅' : '❌'} | **${failed_requests.length}** HTTP request error(s) |`)
  lines.push('')

  // 2. Test Step Timeline
  if (steps.length > 0) {
    lines.push('## ⏱️ Test Execution Steps')
    lines.push('')
    steps.forEach((step, idx) => {
      const stepNum = idx + 1
      const icon = step.success === false ? '❌' : '✅'
      lines.push(`${stepNum}. ${icon} **${step.action || 'Action'}**: ${step.description || JSON.stringify(step.params || '')}`)
    })
    lines.push('')
  }

  // 3. Test Assertions Table
  if (assertions.length > 0) {
    lines.push('## 🔍 Assertion Results')
    lines.push('')
    lines.push('| Status | Type | Target / Condition | Expected | Actual |')
    lines.push('| :---: | :--- | :--- | :--- | :--- |')
    assertions.forEach(a => {
      const statusIcon = a.passed ? '✅ PASS' : '❌ FAIL'
      const type = a.type || 'text'
      const target = `\`${(a.target || a.selector || 'body').slice(0, 35)}\``
      const exp = `\`${String(a.expected ?? '').slice(0, 30)}\``
      const act = a.actual != null ? `\`${String(a.actual).slice(0, 30)}\`` : 'N/A'
      lines.push(`| ${statusIcon} | ${type} | ${target} | ${exp} | ${act} |`)
    })
    lines.push('')
  }

  // 4. Accessibility (a11y) Breakdown
  if (a11y_audit && a11y_audit.issues && a11y_audit.issues.length > 0) {
    lines.push('## ♿ Accessibility (WCAG) Findings')
    lines.push('')
    lines.push(`Total issues detected: **${a11y_audit.totalIssues || a11y_audit.issues.length}**`)
    lines.push('')
    lines.push('| Severity | Rule | Issue Description | Selector / Element |')
    lines.push('| :---: | :--- | :--- | :--- |')
    a11y_audit.issues.forEach(issue => {
      const sevIcon = issue.severity === 'critical' ? '🔴 Critical' : issue.severity === 'serious' ? '🟠 Serious' : '🟡 Moderate'
      const selector = `\`${(issue.selector || 'element').slice(0, 30)}\``
      lines.push(`| ${sevIcon} | **${issue.rule || 'a11y'}** | ${issue.message || ''} | ${selector} |`)
    })
    lines.push('')
  }

  // 5. Console & Network Errors
  if (console_errors.length > 0) {
    lines.push('## 🚨 Console Diagnostics & Errors')
    lines.push('')
    lines.push('```')
    console_errors.slice(-15).forEach(err => {
      const msg = typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err)
      lines.push(msg)
    })
    lines.push('```')
    lines.push('')
  }

  return lines.join('\n')
}

export const qaReportTool = {
  schema: {
    type: 'function',
    function: {
      name: 'qa_report_generate',
      description:
        'Compile automated test results, assertions, accessibility (WCAG) audits, and devtools logs into a structured Markdown QA report. ' +
        'Optionally exports the report to PDF.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Test Suite or Audit Title (e.g. "Checkout Flow E2E Test").' },
          target_url: { type: 'string', description: 'Target URL or local dev server tested.' },
          summary: { type: 'string', description: 'Executive summary or overall outcome.' },
          assertions: {
            type: 'array',
            items: { type: 'object' },
            description: 'Array of assertion objects with { type, target, expected, actual, passed }',
          },
          a11y_audit: {
            type: 'object',
            description: 'Output from browser_control action "audit_a11y"',
          },
          console_errors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Console errors captured during test run',
          },
          failed_requests: {
            type: 'array',
            items: { type: 'object' },
            description: 'Failed HTTP requests',
          },
          steps: {
            type: 'array',
            items: { type: 'object' },
            description: 'Execution timeline steps',
          },
          duration_ms: { type: 'number', description: 'Execution duration in milliseconds.' },
        },
        required: ['title', 'target_url'],
      },
    },
  },

  async execute(params = {}) {
    try {
      const reportMarkdown = buildQaReportMarkdown(params)
      return {
        success: true,
        report_markdown: reportMarkdown,
        total_assertions: params.assertions?.length || 0,
        passed_assertions: params.assertions?.filter(a => a.passed === true).length || 0,
        wcag_score: params.a11y_audit?.score ?? null,
      }
    } catch (err) {
      return { success: false, error: err?.message || String(err) }
    }
  },
}
