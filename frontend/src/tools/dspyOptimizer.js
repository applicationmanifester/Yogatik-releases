/**
 * DSPy Automated Prompt Optimization & Teleprompter Compiler Engine
 *
 * Implements Stanford DSPy paradigms:
 * - Typed Signatures ("input_field -> output_field")
 * - Teleprompter / BootstrapFewShot compilation
 * - Instruction Mutation & Proposal (MIPRO-style)
 * - Quantitative Prompt Evaluation against synthetic verification metrics
 */

/**
 * Parses a DSPy signature string like "question, context -> answer, reasoning"
 */
export function parseSignature(signatureStr = '') {
  const parts = signatureStr.split('->').map((s) => s.trim())
  if (parts.length !== 2) {
    throw new Error(`Invalid DSPy signature format. Expected 'input1, input2 -> output1, output2'. Got: '${signatureStr}'`)
  }

  const inputs = parts[0].split(',').map((s) => s.trim()).filter(Boolean)
  const outputs = parts[1].split(',').map((s) => s.trim()).filter(Boolean)

  if (inputs.length === 0 || outputs.length === 0) {
    throw new Error('DSPy signatures must define at least one input field and one output field.')
  }

  return { signatureStr, inputs, outputs }
}

/**
 * Formats a raw zero-shot prompt from a signature definition and task context
 */
export function compileZeroShotPrompt(signature, taskDescription = '', variables = {}) {
  const { inputs, outputs } = typeof signature === 'string' ? parseSignature(signature) : signature

  const lines = []
  if (taskDescription) {
    lines.push(`Task Instructions: ${taskDescription.trim()}`)
    lines.push('')
  }

  lines.push('Given the following input fields, produce the designated output fields accurately.')
  lines.push('')

  for (const field of inputs) {
    const val = variables[field] !== undefined ? variables[field] : `[${field.toUpperCase()}]`
    lines.push(`${field}: ${val}`)
  }

  lines.push('')
  lines.push('Respond strictly with the output fields in this structure:')
  for (const field of outputs) {
    lines.push(`${field}: [Generated ${field}]`)
  }

  return lines.join('\n')
}

/**
 * BootstrapFewShot / Teleprompter compiler: Generates optimized prompts enriched
 * with selected golden demonstrations, chain-of-thought reasoning steps, and constraints.
 */
export function compileFewShotPrompt({
  signature,
  taskDescription = '',
  examples = [],
  includeChainOfThought = true,
  constraints = [],
}) {
  const parsed = typeof signature === 'string' ? parseSignature(signature) : signature
  const lines = []

  // Core instruction
  lines.push(`System Instruction: ${taskDescription || 'Execute the structured reasoning pipeline defined below.'}`)
  lines.push('')

  // Constraints if specified
  if (constraints.length > 0) {
    lines.push('Operational Constraints:')
    constraints.forEach((c, idx) => lines.push(`${idx + 1}. ${c}`))
    lines.push('')
  }

  // Chain of thought instruction
  if (includeChainOfThought && !parsed.outputs.includes('reasoning') && !parsed.outputs.includes('rationale')) {
    lines.push('Protocol: Think step by step before outputting the final answer fields.')
    lines.push('')
  }

  // Demonstrations / Golden Examples
  if (examples.length > 0) {
    lines.push('--- DEMONSTRATIONS (FEW-SHOT EXAMPLES) ---')
    examples.forEach((ex, idx) => {
      lines.push(`[Example ${idx + 1}]`)
      for (const field of parsed.inputs) {
        lines.push(`${field}: ${ex[field] || ''}`)
      }
      if (includeChainOfThought && ex.reasoning) {
        lines.push(`rationale: ${ex.reasoning}`)
      }
      for (const field of parsed.outputs) {
        lines.push(`${field}: ${ex[field] || ''}`)
      }
      lines.push('')
    })
    lines.push('--- END DEMONSTRATIONS ---')
    lines.push('')
  }

  // Active Execution Template
  lines.push('Active Input:')
  for (const field of parsed.inputs) {
    lines.push(`${field}: {{${field}}}`)
  }

  lines.push('')
  lines.push('Output Fields:')
  if (includeChainOfThought && !parsed.outputs.includes('reasoning')) {
    lines.push('rationale: [Step-by-step analytical verification]')
  }
  for (const field of parsed.outputs) {
    lines.push(`${field}: [Target result]`)
  }

  return lines.join('\n')
}

/**
 * MIPRO-style (Multi-prompt Instruction Proposal) optimizer:
 * Proposes variant instructions with varied reasoning depth, conciseness, and tone.
 */
export function proposeInstructionCandidates(baseInstruction = '', domain = 'general') {
  const variations = [
    {
      style: 'Direct & Concise',
      instruction: `${baseInstruction}. Prioritize high information density, direct answers, and eliminate fluff.`,
    },
    {
      style: 'Analytical Chain-of-Thought',
      instruction: `${baseInstruction}. Deconstruct all underlying assumptions, verify boundary conditions, and detail the logical progression before finalizing output.`,
    },
    {
      style: 'Defensive & Guarded',
      instruction: `${baseInstruction}. Actively cross-check against edge cases, hallucinations, and format drift. Adhere strictly to schema.`,
    },
    {
      style: 'Expert Domain Practitioner',
      instruction: `Operating as a principal ${domain} specialist: ${baseInstruction}. Employ precise terminology, actionable heuristics, and state-of-the-art standards.`,
    },
  ]

  return variations
}

/**
 * Metric evaluator: Evaluates a response against target criteria (coverage, schema match, length)
 */
export function evaluatePromptMetric(response = '', criteria = {}) {
  const { expectedKeywords = [], maxWords = null, requiredFields = [] } = criteria
  const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  let score = 1.0
  const findings = []

  // Check required fields (e.g. "answer:", "rationale:")
  if (requiredFields.length > 0) {
    let matchedFields = 0
    for (const f of requiredFields) {
      const reg = new RegExp(`(^|\\n)\\s*${escapeRegex(f)}\\s*:`, 'i')
      if (reg.test(response)) {
        matchedFields++
      } else {
        findings.push(`Missing expected field header '${f}:'`)
      }
    }
    const fieldScore = matchedFields / requiredFields.length
    score = score * 0.5 + fieldScore * 0.5
  }

  // Check keyword containment
  if (expectedKeywords.length > 0) {
    const lower = response.toLowerCase()
    let kwMatches = 0
    for (const kw of expectedKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        kwMatches++
      } else {
        findings.push(`Missing keyword '${kw}'`)
      }
    }
    const kwScore = kwMatches / expectedKeywords.length
    score = (score + kwScore) / 2
  }

  // Check word budget
  if (maxWords) {
    const wordCount = response.trim().split(/\s+/).length
    if (wordCount > maxWords) {
      score = Math.max(0, score - 0.2)
      findings.push(`Exceeded word limit (${wordCount} > ${maxWords})`)
    }
  }

  return {
    score: Number(score.toFixed(3)),
    passed: score >= 0.75,
    findings,
  }
}

/**
 * DSPy Optimizer Tool Definition
 */
export const dspyOptimizerTool = {
  name: 'dspy_optimizer',
  description: 'DSPy-inspired prompt compiler and automated prompt optimizer. Compiles zero-shot into few-shot CoT prompts, proposes MIPRO variations, and validates against structured metrics.',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['compile_signature', 'compile_fewshot', 'propose_mipro', 'evaluate_metric'],
        description: 'DSPy action to perform.',
      },
      signature: {
        type: 'string',
        description: "DSPy signature string, e.g. 'query, context -> answer, confidence'.",
      },
      taskDescription: {
        type: 'string',
        description: 'Base task instruction or objective.',
      },
      examples: {
        type: 'array',
        items: { type: 'object' },
        description: 'Demonstration examples for few-shot bootstrap.',
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Operational constraints list.',
      },
      responseToEvaluate: {
        type: 'string',
        description: 'Response text to grade against evaluation metric.',
      },
      metricCriteria: {
        type: 'object',
        properties: {
          requiredFields: { type: 'array', items: { type: 'string' } },
          expectedKeywords: { type: 'array', items: { type: 'string' } },
          maxWords: { type: 'integer' },
        },
      },
    },
    required: ['action'],
  },
  async execute(args) {
    const {
      action,
      signature = 'question -> answer',
      taskDescription = '',
      examples = [],
      constraints = [],
      responseToEvaluate,
      metricCriteria = {},
    } = args

    if (action === 'compile_signature') {
      const parsed = parseSignature(signature)
      const zeroShot = compileZeroShotPrompt(parsed, taskDescription)
      return {
        signature: parsed,
        compiledPrompt: zeroShot,
      }
    }

    if (action === 'compile_fewshot') {
      const fewShot = compileFewShotPrompt({
        signature,
        taskDescription,
        examples,
        constraints,
      })
      return {
        signature,
        compiledPrompt: fewShot,
        exampleCount: examples.length,
      }
    }

    if (action === 'propose_mipro') {
      const candidates = proposeInstructionCandidates(taskDescription || 'Answer queries accurately.')
      return {
        baseInstruction: taskDescription,
        candidates,
      }
    }

    if (action === 'evaluate_metric') {
      if (!responseToEvaluate) {
        return { error: 'Missing responseToEvaluate parameter.' }
      }
      return evaluatePromptMetric(responseToEvaluate, metricCriteria)
    }

    return { error: `Unknown action '${action}'.` }
  },
}
