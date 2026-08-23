import { describe, it, expect } from 'vitest'
import {
  parseGitDiff,
  analyzeCodeLines,
  codeReviewDiffTool,
  codeReviewScanTool,
  codeReviewPrTool,
} from './codeReview'

describe('Alibaba Open Code Review Suite', () => {
  it('parses unified git diffs into structured hunks and added lines', () => {
    const diffSample = `diff --git a/src/auth.js b/src/auth.js
index 83a12..99b31 100644
--- a/src/auth.js
+++ b/src/auth.js
@@ -10,4 +10,6 @@ function login(user) {
   const clean = sanitize(user)
+  const secret_key = "sk-live-9381928391829381928391283"
+  eval(clean)
   return clean
 }`
    const parsed = parseGitDiff(diffSample)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].filename).toBe('src/auth.js')
    expect(parsed[0].addedLines).toHaveLength(2)
  })

  it('detects critical security flaws (hardcoded API key, eval, SQL injection)', async () => {
    const diffSample = `diff --git a/src/db.js b/src/db.js
+++ b/src/db.js
@@ -1,3 +1,5 @@
+const apiKey = "sk-abcdef12345678901234567890123456"
+eval(userInput)
+db.query(\`SELECT * FROM users WHERE id = \${userId}\`)
`
    const review = await codeReviewDiffTool.execute({ diff: diffSample })
    expect(review.status).toBe('analyzed')
    expect(review.summary.totalDefects).toBeGreaterThanOrEqual(3)
    expect(review.summary.byCategory.SECURITY).toBeGreaterThanOrEqual(3)
    expect(review.summary.bySeverity.CRITICAL).toBeGreaterThanOrEqual(2)
  })

  it('scans full source code for bug risks and performance quadratic loops', async () => {
    const codeSnippet = `
function processItems(listA, listB) {
  var oldStyle = 123
  const matched = listA.filter(a => listB.includes(a.id))
  try {
    doSomething()
  } catch (e) {
  }
}
`
    const scan = await codeReviewScanTool.execute({ code: codeSnippet })
    expect(scan.status).toBe('scanned')
    expect(scan.totalDefects).toBeGreaterThanOrEqual(3)
    const ruleCategories = scan.defects.map(d => d.category)
    expect(ruleCategories).toContain('PERFORMANCE')
    expect(ruleCategories).toContain('BUG_RISK')
    expect(ruleCategories).toContain('STYLE')
  })

  it('generates an executive PR review report with automated merge verdicts', async () => {
    // 1. Clean PR -> APPROVE
    const cleanDiff = `diff --git a/src/math.js b/src/math.js
+++ b/src/math.js
@@ -1,2 +1,3 @@
+export function add(a, b) {
+  return a + b
+}
`
    const cleanPr = await codeReviewPrTool.execute({
      prTitle: 'Add math add function',
      diff: cleanDiff,
    })
    expect(cleanPr.verdict).toBe('APPROVE')
    expect(cleanPr.riskScore).toBe(0)

    // 2. Vulnerable PR -> REQUEST_CHANGES
    const badDiff = `diff --git a/src/danger.js b/src/danger.js
+++ b/src/danger.js
@@ -1,2 +1,3 @@
+const token = "sk-09876543210987654321098765432109"
+document.getElementById('app').innerHTML = userContent
`
    const badPr = await codeReviewPrTool.execute({
      prTitle: 'Quick fix for dashboard',
      diff: badDiff,
    })
    expect(badPr.verdict).toBe('REQUEST_CHANGES')
    expect(badPr.riskScore).toBeGreaterThan(30)
  })
})
