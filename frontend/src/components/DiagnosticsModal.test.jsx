import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { DiagnosticsModal } from './DiagnosticsModal'
import { recordReflexEvent, _resetReflexMetrics } from '../live/metrics'

vi.mock('../db', () => ({
  db: {
    traces: {
      orderBy: vi.fn(() => ({
        reverse: vi.fn(() => ({
          limit: vi.fn(() => ({
            toArray: vi.fn(async () => []),
          })),
        })),
      })),
      clear: vi.fn(),
    },
  },
  getAgentTraces: vi.fn(async () => []),
}))

vi.mock('../errorLog', () => ({
  getErrorLog: vi.fn(() => []),
  clearErrorLog: vi.fn(),
  getDiagnosticsReport: vi.fn(() => '{}'),
  diagnoseError: vi.fn(),
}))

vi.mock('../evalHarness', () => ({
  runSafetyScreenEval: vi.fn(() => ({ passRate: 1, passed: 4, total: 4 })),
  runAndRecordEval: vi.fn(async () => ({
    rag: { passRate: 1, passed: 10, total: 10 },
    comparison: null,
  })),
}))

afterEach(() => {
  cleanup()
  _resetReflexMetrics()
})

describe('DiagnosticsModal', () => {
  it('renders Reflex Prefetch card with idle state when no prefetch runs yet', () => {
    render(<DiagnosticsModal onClose={vi.fn()} />)
    expect(screen.getByText('Reflex Prefetch')).toBeDefined()
    expect(screen.getByText('speculative')).toBeDefined()
    expect(screen.getByText(/0 hits \/ 0 misses/)).toBeDefined()
  })

  it('renders Reflex Prefetch stats with hit rate and latency saved', () => {
    recordReflexEvent({ hit: true, savedMs: 350, tool: 'calculator' })
    recordReflexEvent({ hit: true, savedMs: 450, tool: 'weather' })
    recordReflexEvent({ hit: false, tool: 'timezone' })

    render(<DiagnosticsModal onClose={vi.fn()} />)
    expect(screen.getByText('Reflex Prefetch')).toBeDefined()
    expect(screen.getByText('3 runs')).toBeDefined()
    expect(screen.getByText('67%')).toBeDefined()
    expect(screen.getByText(/2 hits \/ 1 misses/)).toBeDefined()
    expect(screen.getByText('400ms')).toBeDefined()
  })
})
