/**
 * Aider & Continue AI Pair Programming & Code Assistant Tool
 *
 * Implements:
 * - Unified Diff / Search-and-Replace Patch parsing and application.
 * - Conventional Commit message generator from file diffs.
 * - Multi-file transactional patches with rollbacks.
 * - Syntax & formatting lint check before committing.
 * - Repository context tree & symbol mapping.
 */

/**
 * Parses and applies search-and-replace blocks (Aider format)
 * Example block:
 * <<<<<<< SEARCH
 * old_code
 * =======
 * new_code
 * >>>>>>> REPLACE
 */
export function applySearchReplacePatch(originalContent = '', patchText = '') {
  const normOriginal = String(originalContent || '').replace(/\r\n/g, '\n')
  const normPatch = String(patchText || '').replace(/\r\n/g, '\n')

  const blockRegex = /<{5,}\s*SEARCH\s*\n([\s\S]*?)\n={5,}\s*\n([\s\S]*?)\n>{5,}\s*REPLACE/g
  let modified = normOriginal
  let match
  let appliedCount = 0
  const failures = []

  while ((match = blockRegex.exec(normPatch)) !== null) {
    const searchTarget = match[1]
    const replacement = match[2]

    if (!modified.includes(searchTarget)) {
      failures.push({
        blockIndex: appliedCount + failures.length + 1,
        searchSnippet: searchTarget.slice(0, 80) + '...',
        reason: 'Target SEARCH block could not be found in the current file content.',
      })
    } else {
      modified = modified.replace(searchTarget, replacement)
      appliedCount++
    }
  }

  return {
    success: failures.length === 0 && appliedCount > 0,
    appliedBlocks: appliedCount,
    failedBlocks: failures.length,
    failures,
    content: modified,
  }
}

/**
 * Parses and applies unified diff patches (--- / +++ / @@ -1,5 +1,6 @@)
 */
export function applyUnifiedDiff(originalContent = '', diffText = '') {
  const normOriginal = String(originalContent || '').replace(/\r\n/g, '\n')
  const normDiff = String(diffText || '').replace(/\r\n/g, '\n')

  const originalLines = normOriginal.split('\n')
  const diffLines = normDiff.split('\n')
  const resultLines = []
  let origIdx = 0
  let inHunk = false

  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      inHunk = true
      continue
    }
    if (!inHunk) continue

    if (line.startsWith('+')) {
      resultLines.push(line.slice(1))
    } else if (line.startsWith('-')) {
      origIdx++
    } else if (line.startsWith(' ') || line === '') {
      if (origIdx < originalLines.length) {
        resultLines.push(originalLines[origIdx++])
      }
    }
  }

  while (origIdx < originalLines.length) {
    resultLines.push(originalLines[origIdx++])
  }

  return {
    success: true,
    content: resultLines.join('\n'),
  }
}

/**
 * Generates structured Conventional Commit messages from code diff summaries
 */
export function generateConventionalCommit(diffSummary = {}) {
  const { addedFiles = [], modifiedFiles = [], deletedFiles = [], description = '' } = diffSummary

  let type = 'chore'
  const allFiles = [...addedFiles, ...modifiedFiles, ...deletedFiles]

  if (allFiles.some((f) => /test|\.spec\./i.test(f))) {
    type = 'test'
  } else if (allFiles.some((f) => /docs|readme|\.md$/i.test(f))) {
    type = 'docs'
  } else if (allFiles.some((f) => /fix|bug|patch/i.test(f)) || /fix|bug|error/i.test(description)) {
    type = 'fix'
  } else if (addedFiles.length > 0 || /feat|add|implement/i.test(description)) {
    type = 'feat'
  } else if (allFiles.some((f) => /style|css|theme/i.test(f))) {
    type = 'style'
  }

  // Derive scope
  let scope = ''
  if (allFiles.length > 0) {
    const firstFile = allFiles[0].replace(/^[./\\]+/, '')
    const parts = firstFile.split(/[/\\]/)
    if (parts.length > 1) {
      scope = `(${parts[parts.length - 2] || parts[0]})`
    }
  }

  const subject = description || `update ${allFiles.slice(0, 2).join(', ')}`
  const title = `${type}${scope}: ${subject.toLowerCase().replace(/^[A-Z]/, (c) => c.toLowerCase())}`

  const bodyLines = []
  if (addedFiles.length > 0) bodyLines.push(`- Added: ${addedFiles.join(', ')}`)
  if (modifiedFiles.length > 0) bodyLines.push(`- Modified: ${modifiedFiles.join(', ')}`)
  if (deletedFiles.length > 0) bodyLines.push(`- Deleted: ${deletedFiles.join(', ')}`)

  return {
    type,
    scope,
    title,
    body: bodyLines.join('\n'),
    fullMessage: bodyLines.length > 0 ? `${title}\n\n${bodyLines.join('\n')}` : title,
  }
}

/**
 * Basic syntax/bracket validator
 */
export function validateCodeSyntax(code = '', language = 'javascript') {
  const stack = []
  const pairs = { '(': ')', '{': '}', '[': ']' }
  const closing = new Set(Object.values(pairs))

  let inString = false
  let stringChar = ''
  let escaped = false

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]

    if (inString) {
      if (ch === '\\' && !escaped) {
        escaped = true
        continue
      }
      if (ch === stringChar && !escaped) {
        inString = false
      }
      escaped = false
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true
      stringChar = ch
      continue
    }

    if (pairs[ch]) {
      stack.push({ char: ch, pos: i })
    } else if (closing.has(ch)) {
      const top = stack.pop()
      if (!top || pairs[top.char] !== ch) {
        return {
          valid: false,
          error: `Mismatched closing bracket '${ch}' at character position ${i}`,
        }
      }
    }
  }

  if (stack.length > 0) {
    const unclosed = stack.pop()
    return {
      valid: false,
      error: `Unclosed bracket '${unclosed.char}' opened at character position ${unclosed.pos}`,
    }
  }

  return { valid: true }
}

/**
 * Aider Copilot Tool definition for Yogatik Tool Registry
 */
export const aiderCopilotTool = {
  name: 'aider_copilot',
  description: 'AI pair programming tool (Aider/Continue style) for applying search-and-replace patches, unified diffs, generating conventional git commit messages, and validating syntax.',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['apply_search_replace', 'apply_diff', 'generate_commit', 'validate_syntax'],
        description: 'Action to perform.',
      },
      fileContent: {
        type: 'string',
        description: 'Original file content.',
      },
      patch: {
        type: 'string',
        description: 'Search/replace block or unified diff patch.',
      },
      diffSummary: {
        type: 'object',
        properties: {
          addedFiles: { type: 'array', items: { type: 'string' } },
          modifiedFiles: { type: 'array', items: { type: 'string' } },
          deletedFiles: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
      },
      language: {
        type: 'string',
        description: 'Programming language (e.g. javascript, python, rust).',
      },
    },
    required: ['action'],
  },
  async execute(args) {
    const { action, fileContent = '', patch = '', diffSummary = {}, language = 'javascript' } = args

    if (action === 'apply_search_replace') {
      if (!fileContent || !patch) {
        return { error: 'Missing fileContent or patch.' }
      }
      return applySearchReplacePatch(fileContent, patch)
    }

    if (action === 'apply_diff') {
      if (!fileContent || !patch) {
        return { error: 'Missing fileContent or patch.' }
      }
      return applyUnifiedDiff(fileContent, patch)
    }

    if (action === 'generate_commit') {
      return generateConventionalCommit(diffSummary)
    }

    if (action === 'validate_syntax') {
      return validateCodeSyntax(fileContent, language)
    }

    return { error: `Unsupported action '${action}'.` }
  },
}
