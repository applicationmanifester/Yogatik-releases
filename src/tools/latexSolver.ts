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
