/**
 * LaTeX Equation Converter & SymPy Mathematical Solver
 * Translates academic LaTeX equations into verified executable Python/SymPy expressions
 */

export interface EquationVerificationResult {
  rawLatex: string;
  sympyExpression: string;
  evaluatedResult?: string;
  isSymbolic: boolean;
  variables: string[];
}

/**
 * Converts standard LaTeX math equations to Python/SymPy syntax
 */
export function convertLatexToPython(latex: string): string {
  let expr = latex.trim();

  // Strip math delimiters: $...$, $$, \[...\]
  expr = expr.replace(/^\$+|\$+$/g, '').replace(/^\\\[|\\\]$/g, '').trim();

  // Fractions: \frac{a}{b} -> ((a) / (b))
  expr = expr.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '(($1)/($2))');

  // Square roots: \sqrt{x} -> sqrt(x)
  expr = expr.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');

  // Greek letters: \alpha, \beta, \theta, \lambda -> alpha, beta, theta, lambda
  expr = expr.replace(/\\(alpha|beta|gamma|delta|epsilon|theta|lambda|mu|pi|sigma|tau|phi|omega)/gi, '$1');

  // Superscripts & exponents: x^{2} -> x**(2), x^2 -> x**2
  expr = expr.replace(/\^\{([^{}]+)\}/g, '**($1)');
  expr = expr.replace(/\^([a-zA-Z0-9])/g, '**$1');

  // Functions: \sin, \cos, \tan, \log, \exp -> sin, cos, tan, log, exp
  expr = expr.replace(/\\(sin|cos|tan|log|ln|exp|det|max|min)/g, '$1');

  // Remove LaTeX spacing: \, \: \; \! \quad
  expr = expr.replace(/\\(quad|,|;|:|!)/g, ' ');

  // Multiplication: \cdot, \times -> *
  expr = expr.replace(/\\(cdot|times)/g, '*');

  return expr.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts all mathematical variables from an expression
 */
export function extractVariables(pyExpr: string): string[] {
  const matches = pyExpr.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  const reserved = new Set(['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'sqrt', 'pi', 'E', 'Math', 'def', 'return', 'float', 'int']);
  return Array.from(new Set(matches.filter((m) => !reserved.has(m))));
}

/**
 * Generates an executable Pyodide/SymPy verification script
 */
export function generateSympyScript(latexEquation: string): string {
  const pyExpr = convertLatexToPython(latexEquation);
  const vars = extractVariables(pyExpr);

  return `
import sympy as sp

# Define symbolic variables
${vars.map((v) => `${v} = sp.Symbol('${v}')`).join('\n')}

try:
    expr = ${pyExpr}
    simplified = sp.simplify(expr)
    print("SIMPLIFIED:", simplified)
    print("LATEX:", sp.latex(simplified))
except Exception as e:
    print("ERROR:", str(e))
`.trim();
}

export interface LatexDiagnostic {
  line?: number
  errorType: 'undefined_control_sequence' | 'missing_bracket' | 'missing_package' | 'syntax_error' | 'fatal_error'
  message: string
  contextSnippet?: string
  suggestedFix?: string
}

/**
 * Parses raw pdflatex / latexmk compiler output logs and returns actionable diagnostics
 */
export function parseLatexErrors(logOutput: string): LatexDiagnostic[] {
  const diagnostics: LatexDiagnostic[] = []
  const lines = logOutput.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 1. Undefined control sequence: ! Undefined control sequence. \foo
    if (line.includes('Undefined control sequence')) {
      const nextLine = lines[i + 1] || ''
      const lineNumMatch = lines.slice(Math.max(0, i - 3), i + 4).join('\n').match(/l\.(\d+)/)
      const lineNum = lineNumMatch ? parseInt(lineNumMatch[1], 10) : undefined

      diagnostics.push({
        line: lineNum,
        errorType: 'undefined_control_sequence',
        message: 'Undefined LaTeX command or macro used.',
        contextSnippet: nextLine.trim(),
        suggestedFix: 'Check for typos in LaTeX command or verify the required \\usepackage{...} is loaded in preamble.',
      })
    }

    // 2. Missing package: LaTeX Error: File `foo.sty' not found.
    const pkgMatch = line.match(/LaTeX Error: File `([^']+)\.sty' not found/i)
    if (pkgMatch) {
      diagnostics.push({
        errorType: 'missing_package',
        message: `Package '${pkgMatch[1]}' is missing from LaTeX distribution.`,
        suggestedFix: `Install the '${pkgMatch[1]}' package or replace with standard macros.`,
      })
    }

    // 3. Unescaped special characters / Runaway argument
    if (line.includes('Runaway argument') || line.includes('Emergency stop')) {
      const lineNumMatch = lines.slice(Math.max(0, i - 3), i + 4).join('\n').match(/l\.(\d+)/)
      diagnostics.push({
        line: lineNumMatch ? parseInt(lineNumMatch[1], 10) : undefined,
        errorType: 'missing_bracket',
        message: 'Unmatched braces, runaway argument, or unescaped special character (%, _, &).',
        suggestedFix: 'Ensure every { has a matching } and escape %, _, &, and # with a backslash.',
      })
    }
  }

  return diagnostics
}

