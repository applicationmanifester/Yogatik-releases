/**
 * Yogatik Electron Main — Refactored Bootstrap
 *
 * Thin entry point (<100 lines) that composes the application from modules.
 * All business logic moved to core/ and ipc/ directories.
 */

import { app } from 'electron'
import { Application } from './core/Application'
import { Logger } from './core/Logger'
import { ConfigManager } from './core/ConfigManager'

// Initialize logger early
const logger = new Logger('main')
logger.info('Starting Yogatik Electron application')

// Handle uncaught exceptions gracefully (teardown races only)
const TEARDOWN_NOISE = /Object has been destroyed|Render frame was disposed|WebContents .* destroyed|has already been destroyed/i

process.on('uncaughtException', (err) => {
  const msg = String(err?.message || err)
  if (TEARDOWN_NOISE.test(msg)) {
    logger.warn('Ignored teardown race', { message: msg })
    return
  }
  logger.error('Uncaught exception', { error: msg, stack: err?.stack })
  setImmediate(() => { throw err })
})

process.on('unhandledRejection', (reason: unknown) => {
  const msg = String(reason instanceof Error ? reason.message : reason)
  if (TEARDOWN_NOISE.test(msg)) return
  logger.error('Unhandled rejection', { error: msg, stack: reason instanceof Error ? reason.stack : undefined })
})

// Single instance lock
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  // Create and run application
  const config = new ConfigManager()
  const application = new Application(config, logger)

  app.on('second-instance', (_e, argv) => {
    application.handleSecondInstance(argv)
  })

  app.whenReady().then(async () => {
    try {
      await application.initialize()
      logger.info('Application initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize application', { error: String(error) })
      app.quit()
    }
  })

  app.on('before-quit', () => {
    application.beforeQuit()
  })

  app.on('will-quit', () => {
    application.willQuit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && application.isQuitting) {
      app.quit()
    }
  })

  app.on('activate', () => {
    application.activate()
  })
}