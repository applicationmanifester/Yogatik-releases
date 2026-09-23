// Test setup - no external dependencies needed for pure functions
import { vi } from 'vitest'

// Mock console methods to reduce noise
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}