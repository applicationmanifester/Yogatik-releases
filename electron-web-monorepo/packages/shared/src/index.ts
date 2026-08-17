// @myapp/shared - Main entry point
// Re-exports all public APIs from shared package

export * from './types'
export * from './utils'
export * from './constants'

// Version info
export const SHARED_VERSION = '1.0.0'
export const SHARED_BUILD_DATE = new Date().toISOString()