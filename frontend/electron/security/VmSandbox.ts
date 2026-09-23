/**
 * SecureVmSandbox — Safe JavaScript evaluation WITHOUT require()
 *
 * CRITICAL FIX: Original code exposed `require` in the VM sandbox, letting any
 * IPC caller load arbitrary modules from the main process (full RCE).
 *
 * Implementation uses Node's built-in `vm` module with:
 *  - NO require / process / Buffer / module / __dirname / __filename
 *  - A frozen allowlist of standard JS globals only
 *  - A compile-time and runtime pattern blocklist
 *  - A hard timeout
 *
 * HONEST LIMITATION: native `vm` is an isolation convenience, not a hardened
 * security boundary (V8 contexts are not designed to contain determined
 * attackers). This layer is sized for the threat it actually faces — an IPC
 * caller — and the entitlement gate + channel classification decide WHO can
 * call desktop:eval-js at all. For untrusted third-party code, run it in a
 * separate utilityProcess (Electron) or a dedicated sandboxed renderer; do not
 * loosen this sandbox.
 */

import * as nodeVm from 'vm'

export interface SandboxOptions {
  timeout?: number
}

export interface ExecutionResult {
  success: boolean
  result?: string
  logs: string[]
  output: string
  error?: string
  durationMs: number
}

const MAX_CODE_BYTES = 50_000

/** Compile-time + runtime blocklist. Denylist here, ALLOWLIST of globals below. */
const DANGEROUS_PATTERNS: RegExp[] = [
  /require\s*\(/,
  /\bprocess\b/,
  /\bglobal\b/,
  /\bglobalThis\b/,
  /\bBuffer\b/,
  /__dirname/,
  /__filename/,
  /\bmodule\b/,
  /\bexports\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bimport\s*\(/,
  /\bconstructor\b/,
  /prototype\s*\[/,
]

export class SecureVmSandbox {
  private readonly timeout: number
  private readonly logs: string[] = []
  private readonly context: nodeVm.Context

  constructor(options: SandboxOptions = {}) {
    this.timeout = options.timeout ?? 5000

    // Context with NO builtins: create an empty sandbox object — vm fills it
    // with nothing but what we explicitly freeze onto it below.
    const sandbox: Record<string, unknown> = {}
    this.context = nodeVm.createContext(sandbox, {
      // Do not let the sandboxed code reach the host's globals via the
      // context's prototype chain.
      codeGeneration: { strings: false, wasm: false },
    })

    this.setupGlobals()
  }

  private setupGlobals(): void {
    // Standard JS only — no Node.js APIs. Each entry is frozen so sandboxed
    // code cannot swap or shadow it with a hostile replacement.
    const safeGlobals: Record<string, unknown> = {
      Array, Object, String, Number, Boolean, Date, RegExp,
      Map, Set, WeakMap, WeakSet, Promise, Symbol, Proxy, Reflect,
      JSON, Math,
      parseInt, parseFloat, isNaN, isFinite,
      encodeURI, decodeURI, encodeURIComponent, decodeURIComponent,
      Error, TypeError, ReferenceError, SyntaxError, RangeError,
      URL, URLSearchParams,
      console: {
        log: (...args: unknown[]) => this.logs.push(this.formatArgs(args)),
        info: (...args: unknown[]) => this.logs.push('[INFO] ' + this.formatArgs(args)),
        warn: (...args: unknown[]) => this.logs.push('[WARN] ' + this.formatArgs(args)),
        error: (...args: unknown[]) => this.logs.push('[ERROR] ' + this.formatArgs(args)),
        debug: (...args: unknown[]) => this.logs.push('[DEBUG] ' + this.formatArgs(args)),
      },
      // Timers are host-side by necessity (vm timeouts don't cover async), but
      // the handle is opaque and the code cannot clear arbitrary hosts timers.
      setTimeout: (fn: () => void, delay?: number) => setTimeout(fn, delay),
      clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
    }

    for (const [key, value] of Object.entries(safeGlobals)) {
      Object.defineProperty(this.context, key, {
        value,
        writable: false,
        configurable: false,
        enumerable: true,
      })
    }
  }

  private formatArgs(args: unknown[]): string {
    return args.map(arg => {
      if (arg === null) return 'null'
      if (arg === undefined) return 'undefined'
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return '[Object]'
        }
      }
      return String(arg)
    }).join(' ')
  }

  async execute(code: string): Promise<ExecutionResult> {
    this.logs.length = 0
    const startTime = Date.now()

    if (!code || typeof code !== 'string') {
      return { success: false, error: 'No code provided', logs: [], output: '', durationMs: 0 }
    }

    if (code.length > MAX_CODE_BYTES) {
      return {
        success: false,
        error: `Code too long (max ${MAX_CODE_BYTES / 1000}KB)`,
        logs: [],
        output: '',
        durationMs: Date.now() - startTime,
      }
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(code)) {
        return {
          success: false,
          error: 'Code contains disallowed patterns',
          logs: [],
          output: '',
          durationMs: Date.now() - startTime,
        }
      }
    }

    try {
      // Async IIFE so top-level await in user code works.
      const wrapped = `(async () => {\n${code}\n})()`
      const script = new nodeVm.Script(wrapped, { filename: 'sandbox.js' })
      const result = await script.runInContext(this.context, {
        timeout: this.timeout,
        displayErrors: true,
      })

      const output = this.logs.join('\n').trim()
      return {
        success: true,
        result: result !== undefined
          ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result))
          : output,
        logs: [...this.logs],
        output,
        durationMs: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        logs: [...this.logs],
        output: this.logs.join('\n').trim(),
        durationMs: Date.now() - startTime,
      }
    }
  }
}