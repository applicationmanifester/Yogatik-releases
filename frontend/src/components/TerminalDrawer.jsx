import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  TerminalSquare, X, Square, Trash2, CornerDownLeft, Bot, User, Play,
  ChevronRight, ChevronDown, Copy, Check, Lock,
} from 'lucide-react'
import { parseAnsiToSegments } from '../terminal/ansi'
import { useTerminal } from '../terminal/useTerminal'
import { statusLabel, formatDuration } from '../terminal/terminalStore'
import { isDesktop } from '../tools/localFs'
import { isLocked } from '../entitlement'

/**
 * The shared terminal — one per-chat timeline that BOTH the agent and the human
 * write into.
 *
 * Every command is a BLOCK, not a line in an undifferentiated scroll: command,
 * live output, exit code, duration, and who ran it. That is not decoration. The
 * agent runs discrete commands with real exit codes, so blocks are the shape
 * the data already has — and it is what lets the human stop an agent command or
 * re-run it as their own, which is the part of "shared terminal" people
 * actually want.
 *
 * Sharing one interactive SHELL was the other option and it is the fragile one:
 * knowing when a command finished means parsing the prompt, and an agent `cd`
 * would silently move the human's working directory. See terminalCore.cjs.
 */

const MIN_HEIGHT = 140
const MAX_FRACTION = 0.8
const DEFAULT_HEIGHT = 280

function Ansi({ text }) {
  if (!text) return null
  return parseAnsiToSegments(text).map((s, i) => (
    <span
      key={i}
      style={{
        color: s.color || undefined,
        fontWeight: s.bold ? 700 : undefined,
        opacity: s.dim ? 0.65 : undefined,
        textDecoration: s.underline ? 'underline' : undefined,
      }}
    >{s.text}</span>
  ))
}

function Block({ block, onStop, onRerun }) {
  const running = block.status === 'running'
  // Long finished blocks collapse; a RUNNING one never does — watching it is
  // the whole reason the drawer exists.
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const longRef = useRef(false)

  useEffect(() => {
    if (running || longRef.current) return
    if ((block.output || '').length > 4000) { longRef.current = true; setOpen(false) }
  }, [running, block.output])

  const copy = useCallback(() => {
    try {
      navigator.clipboard.writeText(`$ ${block.command}\n${block.output || ''}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* clipboard denied */ }
  }, [block.command, block.output])

  const bad = block.status === 'failed' || (block.status === 'exited' && block.exitCode !== 0)

  return (
    <div className={`term-block ${block.author} ${running ? 'running' : ''} ${bad ? 'bad' : ''}`}>
      <div className="term-block-head">
        <button
          className="term-disclose"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-label={open ? 'Collapse output' : 'Expand output'}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Attribution is the point of the whole surface: at a glance, did I
            run this or did the model? */}
        <span className={`term-who ${block.author}`} title={block.author === 'agent' ? 'Run by the assistant' : 'Run by you'}>
          {block.author === 'agent' ? <Bot size={11} /> : <User size={11} />}
        </span>

        <code className="term-cmd" title={block.command}>{block.command}</code>

        <span className={`term-status ${running ? 'running' : bad ? 'bad' : 'ok'}`}>
          {statusLabel(block)}
          {block.durationMs != null && ` · ${formatDuration(block.durationMs)}`}
        </span>

        {running ? (
          // Interrupting an AGENT command is the capability that was missing
          // entirely: terminal_run offered no way to stop it short of quitting.
          <button className="icon-btn danger sm" onClick={() => onStop(block.id)} title="Stop" aria-label={`Stop ${block.command}`}>
            <Square size={11} />
          </button>
        ) : (
          <>
            <button className="icon-btn sm" onClick={copy} title="Copy" aria-label="Copy command and output">
              {copied ? <Check size={11} /> : <Copy size={11} />}
            </button>
            <button className="icon-btn sm" onClick={() => onRerun(block.command)} title="Run again as you" aria-label="Run again">
              <Play size={11} />
            </button>
          </>
        )}
      </div>

      {open && (
        <pre className="term-out">
          <Ansi text={block.output} />
          {running && <span className="term-caret" aria-hidden="true">▋</span>}
          {block.truncated && <span className="term-note">…earlier output dropped</span>}
        </pre>
      )}
      {block.error && <div className="term-err">{block.error}</div>}
    </div>
  )
}

export default function TerminalDrawer({ open, onClose, conversationId, onUpgrade }) {
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem('yogatik.terminal.height'))
    return saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT
  })
  const [input, setInput] = useState('')
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const stickRef = useRef(true)

  const { blocks, ptyAvailable, error, run, stop, clear, recall } =
    useTerminal({ conversationId, enabled: open })

  /**
   * Follow the tail only while the user is already AT the tail. Forcing a
   * scroll on every chunk makes it impossible to read anything above while a
   * build is running — the single most annoying terminal behaviour there is.
   */
  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [blocks])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
  }, [open])

  // Drag to resize. Pointer events, not mouse: a trackpad drag that leaves the
  // handle must keep resizing, which setPointerCapture gives for free.
  const startResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = height
    const move = (ev) => {
      const next = Math.max(MIN_HEIGHT, Math.min(window.innerHeight * MAX_FRACTION, startH + (startY - ev.clientY)))
      setHeight(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setHeight(h => { localStorage.setItem('yogatik.terminal.height', String(h)); return h })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }, [height])

  const submit = useCallback(() => {
    const cmd = input.trim()
    if (!cmd) return
    setInput('')
    run(cmd)
  }, [input, run])

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return }
    if (e.key === 'ArrowUp' && !input.includes('\n')) {
      const prev = recall('up')
      if (prev != null) { e.preventDefault(); setInput(prev) }
      return
    }
    if (e.key === 'ArrowDown' && !input.includes('\n')) {
      const next = recall('down')
      if (next != null) { e.preventDefault(); setInput(next) }
      return
    }
    // Escape closes the drawer, but only when there is nothing to lose.
    if (e.key === 'Escape' && !input) { e.stopPropagation(); onClose?.() }
  }, [input, recall, submit, onClose])

  if (!open) return null

  const body = () => {
    if (!isDesktop()) {
      return (
        <div className="ws-empty sm">
          <TerminalSquare size={20} />
          <p>Desktop only</p>
          <span>A browser tab cannot run shell commands on your computer.</span>
        </div>
      )
    }
    if (isLocked()) {
      return (
        <div className="ws-locked">
          <Lock size={22} />
          <p>The terminal is locked</p>
          <span>Shell access is part of Yogatik Pro. Chat and every browser-based tool keep working.</span>
          <button className="ws-primary-btn" onClick={onUpgrade}>View plans</button>
        </div>
      )
    }
    if (!blocks.length) {
      return (
        <div className="term-hint">
          <p>Nothing has run in this chat yet.</p>
          <span>
            Type a command below, or ask the assistant to do something — its commands
            appear here live, and you can stop or re-run any of them.
          </span>
        </div>
      )
    }
    return blocks.map(b => (
      <Block key={b.id} block={b} onStop={stop} onRerun={(cmd) => { setInput(cmd); inputRef.current?.focus() }} />
    ))
  }

  return (
    <div className="term-drawer" style={{ height }} role="region" aria-label="Terminal">
      <div className="term-resize" onPointerDown={startResize} role="separator" aria-orientation="horizontal" />

      <div className="term-bar">
        <TerminalSquare size={13} />
        <strong>Terminal</strong>
        {/* Which TIER is live. Offering an interactive prompt that silently
            swallows every keystroke is the failure the old panel had. */}
        <span className="term-tier" title={ptyAvailable
          ? 'Interactive shell available (node-pty installed)'
          : 'Commands run and stream normally. Interactive programs (REPLs, vim, prompts) need node-pty.'}>
          {ptyAvailable ? 'interactive' : 'commands'}
        </span>
        <span className="ws-spacer" />
        <button className="icon-btn" onClick={clear} title="Clear finished blocks" aria-label="Clear terminal"><Trash2 size={13} /></button>
        <button className="icon-btn" onClick={onClose} title="Close (Ctrl+`)" aria-label="Close terminal"><X size={14} /></button>
      </div>

      {error && <div className="ws-notice error">{error}</div>}

      <div className="term-scroll" ref={scrollRef} onScroll={onScroll}>
        {body()}
      </div>

      {isDesktop() && !isLocked() && (
        <div className="term-input">
          <span className="term-prompt" aria-hidden="true">$</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            spellCheck={false}
            placeholder="Run a command…  ↑ for history"
            aria-label="Terminal command"
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button className="icon-btn" onClick={submit} disabled={!input.trim()} title="Run" aria-label="Run command">
            <CornerDownLeft size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
