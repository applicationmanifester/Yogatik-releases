import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Terminal, X, Play, Trash2, Sparkles, Copy, Square, Check, HelpCircle, CornerDownLeft } from 'lucide-react'
import { computeSha256, estimateTokens, computeStatsAsync } from '../computeWorker'
// Static, not dynamic: main resolves the working folder from this chat's binding,
// and an await here would let the panel spawn before the ctx was known.
import { getWorkspaceCtx } from '../tools/localFs'

/* =========================================================================
   ANSI Escape Sequence Parser
   Parses basic ANSI styles & 16 colors to rendered spans.
   ========================================================================= */
const ANSI_COLOR_MAP = {
  30: '#4b5563', // black / gray
  31: '#ef4444', // red
  32: '#10b981', // green
  33: '#f59e0b', // yellow
  34: '#3b82f6', // blue
  35: '#a855f7', // magenta
  36: '#06b6d4', // cyan
  37: '#e5e7eb', // white
  90: '#6b7280', // bright black / gray
  91: '#f87171', // bright red
  92: '#34d399', // bright green
  93: '#fbbf24', // bright yellow
  94: '#60a5fa', // bright blue
  95: '#c084fc', // bright magenta
  96: '#22d3ee', // bright cyan
  97: '#ffffff', // bright white
}

export function parseAnsiToSegments(text) {
  if (typeof text !== 'string') text = String(text ?? '')
  if (!text.includes('\x1b')) {
    return [{ text, color: null, bold: false, dim: false, underline: false }]
  }

  const segments = []
  const regex = /\x1b\[([0-9;]*)m/g
  let lastIndex = 0
  let currentColor = null
  let currentBold = false
  let currentDim = false
  let currentUnderline = false

  let match
  while ((match = regex.exec(text)) !== null) {
    const rawMatch = match[0]
    const codesStr = match[1]
    const matchIndex = match.index

    if (matchIndex > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, matchIndex),
        color: currentColor,
        bold: currentBold,
        dim: currentDim,
        underline: currentUnderline,
      })
    }

    lastIndex = matchIndex + rawMatch.length

    const codes = codesStr ? codesStr.split(';').map(Number) : [0]
    for (const code of codes) {
      if (code === 0) {
        currentColor = null
        currentBold = false
        currentDim = false
        currentUnderline = false
      } else if (code === 1) {
        currentBold = true
      } else if (code === 2) {
        currentDim = true
      } else if (code === 4) {
        currentUnderline = true
      } else if (code === 22) {
        currentBold = false
        currentDim = false
      } else if (code === 24) {
        currentUnderline = false
      } else if (code === 39) {
        currentColor = null
      } else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code]
      }
    }
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      color: currentColor,
      bold: currentBold,
      dim: currentDim,
      underline: currentUnderline,
    })
  }

  return segments.length ? segments : [{ text: '', color: null }]
}

export default function TerminalPanel({ open, onClose, onAskAI }) {
  const [lines, setLines] = useState([
    '\x1b[36m⚡ Yogatik Web Sandbox Shell\x1b[0m',
    'Interactive in-browser developer sandbox. Type \x1b[33mhelp\x1b[0m to list available sandbox commands.',
  ])
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [draftCmd, setDraftCmd] = useState('')
  const [copied, setCopied] = useState(false)

  // The bridge object exists in every desktop build, but node-pty is an optional
  // native dep: `available()` is the only truthful signal. The panel used to show
  // "PTY LIVE" whenever the bridge existed, call a non-existent start(), and then
  // write(text) against a write(id, data) signature — so it claimed to be a live
  // shell while every keystroke went nowhere.
  const [ptyId, setPtyId] = useState(null)
  const ptyIdRef = useRef(null)
  const isDesktopPty = Boolean(ptyId)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Spawn a real shell when the panel opens, and tear it down when it closes.
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.__YOGATIK_PTY__ : null
    if (!open || !bridge?.spawn) return
    let cancelled = false
    let offData = null
    let offExit = null

    ;(async () => {
      try {
        if (bridge.available && !(await bridge.available())) return
        // main resolves the working folder from the chat binding, not from a
        // renderer-supplied path.
        const res = await bridge.spawn({ ctx: getWorkspaceCtx() })
        if (cancelled || !res?.success || !res.id) {
          if (!cancelled && res?.error) setLines(prev => [...prev, `\x1b[33m${res.error}\x1b[0m`])
          return
        }
        ptyIdRef.current = res.id
        setPtyId(res.id)
        setLines(prev => [...prev, `\x1b[32m● Native shell ready — ${res.shell} in ${res.cwd}\x1b[0m`])

        // The payload is { id, data }; pushing it straight into `lines` rendered
        // "[object Object]".
        offData = bridge.onData?.(({ id, data }) => {
          if (id !== ptyIdRef.current) return
          const text = String(data ?? '')
          if (!text) return
          setLines(prev => [...prev, ...text.replace(/\r\n?/g, '\n').split('\n')])
        })
        offExit = bridge.onExit?.(({ id, exitCode }) => {
          if (id !== ptyIdRef.current) return
          ptyIdRef.current = null
          setPtyId(null)
          setLines(prev => [...prev, `\x1b[33m● Shell exited (${exitCode})\x1b[0m`])
        })
      } catch { /* stay on the web sandbox */ }
    })()

    return () => {
      cancelled = true
      if (typeof offData === 'function') offData()
      if (typeof offExit === 'function') offExit()
      const id = ptyIdRef.current
      ptyIdRef.current = null
      setPtyId(null)
      if (id) { try { bridge.kill?.(id) } catch { /* already gone */ } }
    }
  }, [open])

  // Scroll to bottom on new lines
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // In-Browser Sandbox Command Dispatcher
  const executeSandboxCommand = async (fullCommand) => {
    const trimmed = fullCommand.trim()
    if (!trimmed) return

    const parts = trimmed.split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1).join(' ')

    switch (command) {
      case 'help':
        setLines(prev => [
          ...prev,
          '\x1b[1mAvailable Web Sandbox Commands:\x1b[0m',
          '  \x1b[32mhelp\x1b[0m                  Show this help manual',
          '  \x1b[32mclear\x1b[0m                 Clear terminal screen',
          '  \x1b[32mecho <text>\x1b[0m           Print text to terminal',
          '  \x1b[32mdate\x1b[0m                  Print current date and ISO timestamp',
          '  \x1b[32mcalc <expr>\x1b[0m           Safe math evaluator (e.g. calc 2^8 + sqrt(144))',
          '  \x1b[32meval <js>\x1b[0m             Evaluate JavaScript code expression',
          '  \x1b[32msha256 <text>\x1b[0m         Compute SHA-256 hash using Web Worker',
          '  \x1b[32mtokens <text>\x1b[0m         Estimate LLM token and character count',
          '  \x1b[32mstats <n1, n2>\x1b[0m        Calculate mean, median, stddev, min, max',
          '  \x1b[32msysinfo\x1b[0m               Show browser & platform diagnostic details',
          '  \x1b[32mask <query>\x1b[0m           Send prompt directly to AI ChatBot',
        ])
        break

      case 'clear':
        setLines([])
        break

      case 'echo':
        setLines(prev => [...prev, args])
        break

      case 'date':
        setLines(prev => [...prev, `Current Time: ${new Date().toLocaleString()} (${new Date().toISOString()})`])
        break

      case 'calc': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: calc <math_expression>\x1b[0m'])
          break
        }
        try {
          const sanitized = args.replace(/\^/g, '**')
          if (!/^[0-9+\-*/().,%\s**eE]+$/.test(sanitized)) {
            throw new Error('Expression contains disallowed characters.')
          }
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${sanitized})`)()
          setLines(prev => [...prev, `\x1b[32m= ${result}\x1b[0m`])
        } catch (e) {
          setLines(prev => [...prev, `\x1b[31mError: ${e.message}\x1b[0m`])
        }
        break
      }

      case 'eval': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: eval <javascript_expression>\x1b[0m'])
          break
        }
        try {
          // eslint-disable-next-line no-new-func
          const res = Function(`"use strict"; return (${args})`)()
          setLines(prev => [
            ...prev,
            typeof res === 'object' ? JSON.stringify(res, null, 2) : String(res),
          ])
        } catch (e) {
          setLines(prev => [...prev, `\x1b[31mError: ${e.message}\x1b[0m`])
        }
        break
      }

      case 'sha256': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: sha256 <text>\x1b[0m'])
          break
        }
        try {
          const hash = await computeSha256(args)
          setLines(prev => [...prev, `\x1b[32mSHA-256:\x1b[0m ${hash}`])
        } catch (e) {
          setLines(prev => [...prev, `\x1b[31mHash error: ${e.message}\x1b[0m`])
        }
        break
      }

      case 'tokens': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: tokens <text>\x1b[0m'])
          break
        }
        try {
          const count = await estimateTokens(args)
          const wordCount = args.trim().split(/\s+/).filter(Boolean).length
          const charCount = args.length
          setLines(prev => [
            ...prev,
            `\x1b[32mEstimated Tokens:\x1b[0m ${count} | \x1b[36mWords:\x1b[0m ${wordCount} | \x1b[37mCharacters:\x1b[0m ${charCount}`,
          ])
        } catch (e) {
          setLines(prev => [...prev, `\x1b[31mToken estimation error: ${e.message}\x1b[0m`])
        }
        break
      }

      case 'stats': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: stats <num1, num2, ...>\x1b[0m'])
          break
        }
        const nums = args.split(/[\s,]+/).map(Number).filter(n => Number.isFinite(n))
        if (!nums.length) {
          setLines(prev => [...prev, '\x1b[31mNo valid numbers provided.\x1b[0m'])
          break
        }
        try {
          const stats = await computeStatsAsync(nums)
          setLines(prev => [
            ...prev,
            `\x1b[32mCount:\x1b[0m ${stats.count} | \x1b[32mMean:\x1b[0m ${stats.mean} | \x1b[32mMedian:\x1b[0m ${stats.median} | \x1b[32mStdDev:\x1b[0m ${stats.stdDev} | \x1b[36mMin:\x1b[0m ${stats.min} | \x1b[36mMax:\x1b[0m ${stats.max}`,
          ])
        } catch (e) {
          setLines(prev => [...prev, `\x1b[31mStats error: ${e.message}\x1b[0m`])
        }
        break
      }

      case 'sysinfo':
        setLines(prev => [
          ...prev,
          `\x1b[1mPlatform:\x1b[0m ${typeof navigator !== 'undefined' ? navigator.platform : 'Unknown'}`,
          `\x1b[1mUser Agent:\x1b[0m ${typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'}`,
          `\x1b[1mOnline:\x1b[0m ${typeof navigator !== 'undefined' && navigator.onLine ? '\x1b[32mYes\x1b[0m' : '\x1b[31mNo\x1b[0m'}`,
          `\x1b[1mMode:\x1b[0m ${isDesktopPty ? 'Electron Native PTY' : 'In-Browser Web Worker Sandbox'}`,
        ])
        break

      case 'ask': {
        if (!args) {
          setLines(prev => [...prev, '\x1b[31mUsage: ask <question_for_ai>\x1b[0m'])
          break
        }
        if (onAskAI) {
          onAskAI(args)
          setLines(prev => [...prev, `\x1b[32m✔ Sent query to AI ChatBot:\x1b[0m "${args}"`])
        } else {
          setLines(prev => [...prev, '\x1b[33mAI Chat bridge not connected.\x1b[0m'])
        }
        break
      }

      default:
        setLines(prev => [
          ...prev,
          `\x1b[31mCommand not found:\x1b[0m ${command}. Type \x1b[33mhelp\x1b[0m to see available commands.`,
        ])
    }
  }

  const send = useCallback(async (customCmd) => {
    const toSend = typeof customCmd === 'string' ? customCmd : cmd
    if (!toSend.trim()) return

    setHistory(prev => [...prev.filter(h => h !== toSend), toSend])
    setHistoryIndex(-1)
    setDraftCmd('')

    setLines(prev => [...prev, `\x1b[37m$ ${toSend}\x1b[0m`])
    setCmd('')

    // write takes (id, data) — passing only the text made main look up a session
    // named after the command and drop the input silently.
    if (ptyIdRef.current && window.__YOGATIK_PTY__?.write) {
      window.__YOGATIK_PTY__.write(ptyIdRef.current, toSend + '\n')
    } else {
      await executeSandboxCommand(toSend)
    }
  }, [cmd, isDesktopPty, onAskAI])

  const handleInterrupt = () => {
    if (ptyIdRef.current && window.__YOGATIK_PTY__?.write) {
      window.__YOGATIK_PTY__.write(ptyIdRef.current, '\x03')
      setLines(prev => [...prev, '^C'])
    } else {
      setLines(prev => [...prev, '^C \x1b[33m(Process cancelled)\x1b[0m'])
    }
  }

  const handleClear = () => {
    setLines([])
  }

  const handleCopy = () => {
    const text = lines
      .map(l => (typeof l === 'string' ? l.replace(/\x1b\[[0-9;]*m/g, '') : String(l)))
      .join('\n')
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => {})
    }
  }

  const handleAskAIAboutTerminal = () => {
    if (!onAskAI) return
    const plainLines = lines
      .slice(-40)
      .map(l => (typeof l === 'string' ? l.replace(/\x1b\[[0-9;]*m/g, '') : String(l)))
      .join('\n')
      .trim()

    const prompt = `Here is the recent output from my terminal:\n\`\`\`bash\n${plainLines || '(No output recorded yet)'}\n\`\`\`\nPlease analyze this terminal output, diagnose any errors or issues, and provide recommendations or fix commands.`
    onAskAI(prompt)
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      send()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!history.length) return
      const nextIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
      if (historyIndex === -1) setDraftCmd(cmd)
      setHistoryIndex(nextIndex)
      setCmd(history[nextIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= history.length) {
        setHistoryIndex(-1)
        setCmd(draftCmd)
      } else {
        setHistoryIndex(nextIndex)
        setCmd(history[nextIndex])
      }
    } else if (e.key === 'c' && e.ctrlKey && !cmd) {
      e.preventDefault()
      handleInterrupt()
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      handleClear()
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Interactive Terminal Panel"
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        width: 660,
        maxWidth: '92vw',
        height: 440,
        backgroundColor: 'rgba(8, 12, 22, 0.96)',
        backdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 14,
        boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: '#f8fafc',
      }}
    >
      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
          }}>
            <Terminal size={13} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: -0.2 }}>
            Interactive Terminal
          </span>
          <span style={{
            fontSize: 9.5,
            padding: '2px 6px',
            borderRadius: 4,
            fontWeight: 700,
            background: isDesktopPty ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.18)',
            border: `1px solid ${isDesktopPty ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.35)'}`,
            color: isDesktopPty ? '#34d399' : '#38bdf8',
          }}>
            {isDesktopPty ? 'PTY LIVE' : 'WEB SANDBOX'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {onAskAI && (
            <button
              type="button"
              onClick={handleAskAIAboutTerminal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 5,
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#a5b4fc',
                fontSize: 11,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              title="Send terminal output to AI for diagnosis"
            >
              <Sparkles size={11} /> Ask AI
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            style={{
              background: 'none',
              border: 'none',
              color: copied ? '#10b981' : '#94a3b8',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
            }}
            title="Copy terminal output"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
          </button>

          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
            }}
            title="Clear terminal (Ctrl+L)"
          >
            <Trash2 size={13} />
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: 4,
              display: 'flex',
            }}
            title="Close terminal"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Quick Action Chips */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        overflowX: 'auto',
        fontSize: 11,
      }}>
        <span style={{ color: '#64748b', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginRight: 2 }}>
          Quick:
        </span>
        <button
          type="button"
          onClick={() => send(isDesktopPty ? 'git status' : 'help')}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#cbd5e1',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          {isDesktopPty ? 'git status' : 'help'}
        </button>
        <button
          type="button"
          onClick={() => send(isDesktopPty ? 'npm test' : 'sysinfo')}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#cbd5e1',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          {isDesktopPty ? 'npm test' : 'sysinfo'}
        </button>
        <button
          type="button"
          onClick={() => send(isDesktopPty ? 'git diff' : 'date')}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#cbd5e1',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          {isDesktopPty ? 'git diff' : 'date'}
        </button>
        <button
          type="button"
          onClick={() => send('clear')}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#cbd5e1',
            borderRadius: 4,
            padding: '2px 7px',
            fontSize: 10.5,
            cursor: 'pointer',
          }}
        >
          clear
        </button>
      </div>

      {/* Terminal Viewport */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          fontSize: 12.5,
          lineHeight: 1.5,
        }}
      >
        {lines.map((line, i) => {
          const segments = parseAnsiToSegments(line)
          return (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {segments.map((seg, sIdx) => {
                const style = {}
                if (seg.color) style.color = seg.color
                if (seg.bold) style.fontWeight = 'bold'
                if (seg.dim) style.opacity = 0.65
                if (seg.underline) style.textDecoration = 'underline'
                return (
                  <span key={sIdx} style={style}>
                    {seg.text}
                  </span>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Input Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}>
        <span style={{ color: '#10b981', fontWeight: 700, fontSize: 13, userSelect: 'none' }}>$</span>
        <input
          ref={inputRef}
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKey}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontFamily: 'inherit',
            fontSize: 12,
          }}
          placeholder={isDesktopPty ? 'Type shell command (e.g. npm test, git status)...' : 'Type sandbox command (e.g. help, calc 2+2, sha256 <text>)...'}
          autoFocus
        />

        <button
          type="button"
          onClick={handleInterrupt}
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 6,
            color: '#f59e0b',
            padding: '4px 6px',
            cursor: 'pointer',
            display: 'flex',
          }}
          title="Interrupt (Ctrl+C)"
        >
          <Square size={12} fill="currentColor" />
        </button>

        <button
          type="button"
          onClick={() => send()}
          disabled={!cmd.trim()}
          style={{
            background: cmd.trim() ? '#10b981' : 'rgba(255, 255, 255, 0.06)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            padding: '4px 8px',
            cursor: cmd.trim() ? 'pointer' : 'default',
            opacity: cmd.trim() ? 1 : 0.4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
          }}
          title="Send command (Enter)"
        >
          <Play size={11} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
