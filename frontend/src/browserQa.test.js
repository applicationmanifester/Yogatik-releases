import { describe, it, expect } from 'vitest'
import { VALID_ACTIONS, ACTION_ALIASES, browserControlTool } from './tools/browserControl'
import { buildQaReportMarkdown, qaReportTool } from './tools/qaReportGen'
import { ALL_TOOLS, TOOL_ALIASES } from './tools/index'

describe('Browser Control Tool Extensions', () => {
  it('includes assert and audit_a11y in VALID_ACTIONS', () => {
    expect(VALID_ACTIONS).toContain('assert')
    expect(VALID_ACTIONS).toContain('audit_a11y')
    expect(VALID_ACTIONS).toContain('wait_for')
    expect(VALID_ACTIONS).toContain('diagnose')
    expect(VALID_ACTIONS).toContain('screenshot')
  })

  it('maps QA and assertion aliases properly', () => {
    expect(ACTION_ALIASES['assert_text']).toBe('assert')
    expect(ACTION_ALIASES['assert_element']).toBe('assert')
    expect(ACTION_ALIASES['wcag']).toBe('audit_a11y')
    expect(ACTION_ALIASES['accessibility']).toBe('audit_a11y')
    expect(ACTION_ALIASES['get_logs']).toBe('console')
    expect(ACTION_ALIASES['crop_screenshot']).toBe('screenshot')
  })

  it('declares valid schema properties', () => {
    const props = browserControlTool.schema.function.parameters.properties
    expect(props.action.enum).toContain('assert')
    expect(props.action.enum).toContain('audit_a11y')
    expect(props.type.enum).toEqual(['text', 'element', 'count', 'attribute', 'url', 'title'])
    expect(props.expected).toBeDefined()
    expect(props.target).toBeDefined()
  })

  it('registers qa_report_generate and QA aliases in global tools index', () => {
    expect(ALL_TOOLS['qa_report_generate']).toBeDefined()
    expect(TOOL_ALIASES['qa_report']).toBe('qa_report_generate')
    expect(TOOL_ALIASES['browser_assert']).toBe('browser_control')
    expect(TOOL_ALIASES['wcag_audit']).toBe('browser_control')
  })
})

describe('QA Report Generator (qaReportGen.js)', () => {
  it('generates a clean markdown report with metrics and pass rate', () => {
    const markdown = buildQaReportMarkdown({
      title: 'E2E Login Test Suite',
      target_url: 'http://localhost:5173',
      summary: 'Verified user authentication flow and dashboard mount.',
      assertions: [
        { type: 'element', target: '#username', expected: 'visible', passed: true },
        { type: 'text', target: 'body', expected: 'Welcome back', passed: true },
        { type: 'count', target: '.nav-item', expected: 4, actual: 4, passed: true },
      ],
      a11y_audit: {
        score: 95,
        totalIssues: 1,
        issues: [
          { rule: 'image-alt', severity: 'minor', message: 'Logo missing alt tag', selector: 'img.logo' },
        ],
      },
      console_errors: [],
      duration_ms: 2400,
    })

    expect(markdown).toContain('# 🧪 E2E Login Test Suite')
    expect(markdown).toContain('**Pass Rate**')
    expect(markdown).toContain('**100%** (3/3 assertions passed)')
    expect(markdown).toContain('**WCAG 2.2 a11y Score**')
    expect(markdown).toContain('**95/100**')
    expect(markdown).toContain('Logo missing alt tag')
  })

  it('correctly calculates failing assertions in summary', () => {
    const markdown = buildQaReportMarkdown({
      title: 'Failing Checkout Test',
      target_url: 'http://localhost:3000/cart',
      assertions: [
        { type: 'text', target: 'body', expected: 'Thank you for your order', actual: 'Error 500', passed: false },
        { type: 'element', target: '#cart-badge', expected: 'visible', passed: true },
      ],
      console_errors: ['Uncaught TypeError: Cannot read properties of undefined'],
      duration_ms: 1500,
    })

    expect(markdown).toContain('**50%** (1/2 assertions passed)')
    expect(markdown).toContain('❌ FAIL')
    expect(markdown).toContain('Uncaught TypeError: Cannot read properties of undefined')
  })

  it('executes qaReportTool tool handler successfully', async () => {
    const res = await qaReportTool.execute({
      title: 'Smoke Test',
      target_url: 'https://example.com',
      assertions: [
        { type: 'title', expected: 'Example Domain', passed: true },
      ],
    })

    expect(res.success).toBe(true)
    expect(res.total_assertions).toBe(1)
    expect(res.passed_assertions).toBe(1)
    expect(res.report_markdown).toContain('Example Domain')
  })
})
