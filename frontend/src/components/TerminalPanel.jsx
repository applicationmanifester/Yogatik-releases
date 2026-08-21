import React, { useState, useRef, useEffect } from 'react'
import { Terminal, X, Play, Pause } from 'lucide-react'

/* TerminalPanel — persistent interactive shell via desktop PTY bridge.
   Only activates when window.__YOGATIK_PTY__ exists (Electron with node-pty).
   Falls back gracefully in web build. */
export default function TerminalPanel({ open, onClose }) {
  const [lines, setLines] = useState([])
  const [cmd, setCmd] = useState('')
  const [running, setRunning] = useState(false)
  const inputRef = useRef(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    if (!open) return
    // Initialize session if bridge available
    if (window.__YOGATIK_PTY__?.start) {
      window.__YOGATIK_PTY__.start({
        cwd: '/',
        env: process?.env || {},
      }).catch(() => {})
      setLines(prev => [...prev, '> Interactive terminal started (PTY)'])
      setRunning(true)
    } else {
      setLines(prev => [...prev, '> Interactive terminal unavailable (desktop only)'])
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open || !window.__YOGATIK_PTY__?.onData) return
    const unsub = window.__YOGATIK_PTY__.onData?.((data) => {
      setLines(prev => [...prev, data])
    })
    return () => unsub?.()
  }, [open])

  const send = () => {
    if (!cmd.trim() || !window.__YOGATIK_PTY__?.write) {
      setLines(prev => [...prev, `> ${cmd}`])
      setCmd('')
      return
    }
    window.__YOGATIK_PTY__.write(cmd + '\n')
    setLines(prev => [...prev, `> ${cmd}`])
    setCmd('')
  }

  const handleKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); send() }
  }

  if (!open) return null

  return (
    <div className="fixed bottom-4 right-4 w-[640px] max-w-[92vw] h-[420px] bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-[60] flex flex-col overflow-hidden text-sm font-mono text-neutral-100">
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-neutral-300 uppercase">
          <Terminal size={14} />
          Interactive Terminal
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${running ? 'bg-emerald-900/60 text-emerald-300' : 'bg-neutral-700 text-neutral-400'}`}>
            {running ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
        <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors" aria-label="Close terminal">
          <X size={16} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-0.5 bg-neutral-950/50 text-[13px] leading-relaxed">
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all text-neutral-300">{line}</div>
        ))}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 bg-neutral-800 border-t border-neutral-700">
        <span className="text-emerald-400 font-bold text-xs select-none">$</span>
        <input
          ref={inputRef}
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          onKeyDown={handleKey}
          className="flex-1 bg-transparent outline-none text-neutral-100 placeholder-neutral-600 text-xs"
          placeholder="Type command and press Enter..."
          autoFocus
        />
        <button
          onClick={send}
          disabled={!cmd.trim()}
          className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:hover:bg-emerald-600 text-white transition-colors"
          aria-label="Send command"
        >
          <Play size={14} fill="currentColor" />
        </button>
      </div>
    </div>
  )
}
