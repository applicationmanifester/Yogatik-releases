import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import TerminalPanel, { parseAnsiToSegments } from './TerminalPanel'

let host = null
let root = null

function changeInput(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  delete window.__YOGATIK_PTY__
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  host.remove()
  delete window.__YOGATIK_PTY__
})

describe('parseAnsiToSegments', () => {
  it('handles plain text without ANSI codes', () => {
    const res = parseAnsiToSegments('hello world')
    expect(res).toEqual([{ text: 'hello world', color: null, bold: false, dim: false, underline: false }])
  })

  it('parses ANSI colors and bold/dim styles', () => {
    const res = parseAnsiToSegments('\x1b[32m\x1b[1mSuccess\x1b[0m normal \x1b[31mError\x1b[0m')
    expect(res.length).toBe(3)
    expect(res[0].text).toBe('Success')
    expect(res[0].color).toBe('#10b981')
    expect(res[0].bold).toBe(true)
    expect(res[1].text).toBe(' normal ')
    expect(res[1].color).toBe(null)
    expect(res[2].text).toBe('Error')
    expect(res[2].color).toBe('#ef4444')
  })
})

describe('TerminalPanel Component', () => {
  it('renders null when open is false', async () => {
    await act(async () => {
      root.render(<TerminalPanel open={false} onClose={vi.fn()} />)
    })
    expect(host.innerHTML).toBe('')
  })

  it('renders web sandbox shell when open and no desktop PTY bridge', async () => {
    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })
    expect(host.textContent).toContain('Interactive Terminal')
    expect(host.textContent).toContain('WEB SANDBOX')
    expect(host.textContent).toContain('Yogatik Web Sandbox Shell')
  })

  it('executes sandbox help and echo commands in web mode', async () => {
    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })

    const input = host.querySelector('input')
    expect(input).not.toBeNull()

    // Send help
    await act(async () => {
      changeInput(input, 'help')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(host.textContent).toContain('Available Web Sandbox Commands')
    expect(host.textContent).toContain('sha256')

    // Send echo
    await act(async () => {
      changeInput(input, 'echo hello yogatik')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(host.textContent).toContain('hello yogatik')
  })

  it('executes math calc and eval expressions in sandbox mode', async () => {
    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })

    const input = host.querySelector('input')

    await act(async () => {
      changeInput(input, 'calc 10 * 5 + 2')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(host.textContent).toContain('= 52')
  })

  it('navigates command history with ArrowUp and ArrowDown', async () => {
    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })

    const input = host.querySelector('input')

    await act(async () => {
      changeInput(input, 'cmd1')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    await act(async () => {
      changeInput(input, 'cmd2')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    // Press ArrowUp -> should recall cmd2
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(input.value).toBe('cmd2')

    // Press ArrowUp -> should recall cmd1
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    expect(input.value).toBe('cmd1')

    // Press ArrowDown -> should return to cmd2
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    expect(input.value).toBe('cmd2')
  })

  it('forwards output to AI when Ask AI button is clicked', async () => {
    const onAskAI = vi.fn()
    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} onAskAI={onAskAI} />)
    })

    const askBtn = Array.from(host.querySelectorAll('button')).find(b => b.textContent.includes('Ask AI'))
    expect(askBtn).not.toBeUndefined()

    await act(async () => {
      askBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onAskAI).toHaveBeenCalled()
    expect(onAskAI.mock.calls[0][0]).toContain('Here is the recent output from my terminal:')
  })

  // The bridge contract is spawn() → { id } and write(id, data). The panel used
  // to call a non-existent start() and write(text), so keystrokes were sent to a
  // session that had never been created — while the badge claimed "PTY LIVE".
  it('spawns a PTY session and writes to it by id', async () => {
    const spawnMock = vi.fn().mockResolvedValue({ success: true, id: 'pty1', shell: '/bin/bash', cwd: '/work' })
    const writeMock = vi.fn()
    const killMock = vi.fn()
    let dataCb = null

    window.__YOGATIK_PTY__ = {
      available: vi.fn().mockResolvedValue(true),
      spawn: spawnMock,
      write: writeMock,
      kill: killMock,
      onData: (cb) => { dataCb = cb; return () => {} },
      onExit: () => () => {},
    }

    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })

    expect(spawnMock).toHaveBeenCalled()
    expect(host.textContent).toContain('PTY LIVE')

    const input = host.querySelector('input')
    await act(async () => {
      changeInput(input, 'ls -la')
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(writeMock).toHaveBeenCalledWith('pty1', 'ls -la\n')

    // Output arrives as { id, data }; pushing the payload object straight into
    // the buffer rendered "[object Object]".
    await act(async () => { dataCb({ id: 'pty1', data: 'total 0\n' }) })
    expect(host.textContent).toContain('total 0')
    expect(host.textContent).not.toContain('[object Object]')
  })

  it('stays on the web sandbox when node-pty is not installed', async () => {
    // The bridge OBJECT exists in every desktop build; available() is the only
    // truthful signal. Showing "PTY LIVE" for a bridge with no backing shell is
    // how the panel came to swallow every keystroke.
    window.__YOGATIK_PTY__ = {
      available: vi.fn().mockResolvedValue(false),
      spawn: vi.fn(),
      write: vi.fn(),
      onData: () => () => {},
      onExit: () => () => {},
    }

    await act(async () => {
      root.render(<TerminalPanel open={true} onClose={vi.fn()} />)
    })

    expect(window.__YOGATIK_PTY__.spawn).not.toHaveBeenCalled()
    expect(host.textContent).toContain('WEB SANDBOX')
  })
})
