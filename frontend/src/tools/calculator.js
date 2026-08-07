/**
 * Expression evaluator with a token whitelist.
 *
 * The previous version rewrote the string with a chain of .replace() calls
 * ("sqrt" → "Math.sqrt" and so on). That corrupted anything containing those
 * letters — most visibly scientific notation, where 1e5 became 1Math.E5 — and
 * the safety check was a leftover-letters test on the mangled result.
 * Tokenising first is both safer and predictable.
 */

// null-prototype: `'constructor' in FUNCS` is true on a normal object literal,
// which let inherited Object members through the whitelist.
const FUNCS = Object.assign(Object.create(null), {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, log2: Math.log2, log10: Math.log10,
  exp: Math.exp, pow: Math.pow, hypot: Math.hypot,
  ceil: Math.ceil, floor: Math.floor, round: Math.round, trunc: Math.trunc,
  sign: Math.sign, min: Math.min, max: Math.max,
  fact: (n) => {
    if (!Number.isInteger(n) || n < 0 || n > 170) return NaN
    let r = 1
    for (let i = 2; i <= n; i++) r *= i
    return r
  },
})

const CONSTS = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E, tau: Math.PI * 2, inf: Infinity })

// Numbers (incl. 1e5 / 1.2e-3), identifiers, operators, parens, comma.
const TOKEN = /\s*([A-Za-z_]\w*|\d+\.?\d*(?:[eE][+-]?\d+)?|\*\*|[+\-*/%^(),.])/y

function tokenize(src) {
  const tokens = []
  let i = 0
  while (i < src.length) {
    TOKEN.lastIndex = i
    const m = TOKEN.exec(src)
    if (!m) throw new Error(`Unexpected character at position ${i + 1}: "${src[i]}"`)
    tokens.push(m[1])
    i = TOKEN.lastIndex
  }
  return tokens
}

export const calculatorTool = {
  schema: {
    description:
      'Evaluate a mathematical expression. Supports + - * / % ^, parentheses, and ' +
      'sqrt, cbrt, abs, sin, cos, tan, asin, acos, atan, ln, log (base 10), log2, exp, ' +
      'pow, hypot, ceil, floor, round, trunc, sign, min, max, fact, plus the constants pi, e and tau.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'e.g. "sqrt(144) + 2^3" or "log(1000) * pi"' },
      },
      required: ['expression'],
    },
  },

  async execute({ expression }) {
    if (typeof expression !== 'string' || !expression.trim()) {
      return { success: false, error: 'No expression given' }
    }
    if (expression.length > 500) {
      return { success: false, error: 'Expression too long (max 500 characters)' }
    }

    let tokens
    try {
      tokens = tokenize(expression)
    } catch (e) {
      return { success: false, error: e.message }
    }

    // Rebuild from known tokens only: anything unrecognised is rejected before
    // it can reach the evaluator.
    const args = []
    const vals = []
    let js = ''

    for (const t of tokens) {
      if (/^[A-Za-z_]/.test(t)) {
        const key = t.toLowerCase()
        if (key in FUNCS) {
          if (!args.includes(key)) { args.push(key); vals.push(FUNCS[key]) }
          js += key
        } else if (key in CONSTS) {
          js += `(${CONSTS[key]})`
        } else {
          return { success: false, error: `Unknown name: "${t}"` }
        }
      } else if (t === '^') {
        js += '**'
      } else {
        js += t
      }
    }

    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(...args, `"use strict"; return (${js})`)(...vals)
      if (typeof result !== 'number') {
        return { success: false, error: 'Expression did not produce a number' }
      }
      if (Number.isNaN(result)) return { success: false, error: 'Result is not a number (check the inputs)' }
      return {
        success: true,
        tool: 'calculator',
        expression,
        result,
        formatted: Number.isFinite(result)
          ? (Number.isInteger(result) ? result.toLocaleString() : String(Number(result.toPrecision(12))))
          : String(result),
      }
    } catch (e) {
      return { success: false, error: `Could not evaluate: ${e.message}` }
    }
  },
}
