import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  hasReservedDeviceName,
  resolveWithin,
} from '../electron/rootsCore.cjs'
import {
  FS_ERRORS,
  createBackupSnapshot,
  computeFileHash,
  acquireLock,
  releaseLock,
  isImmutablePath,
  generateDiffPreview,
} from '../electron/fsCore.cjs'

describe('AI-Driven File-System Operations Toolkit', () => {
  let tempDir

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'fs-toolkit-test-'))
  })

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  describe('Windows Reserved Device Names & Path Sanitization', () => {
    it('detects Windows reserved device names (CON, PRN, AUX, NUL, COM1, LPT1)', () => {
      expect(hasReservedDeviceName('CON')).toBe('CON')
      expect(hasReservedDeviceName('con.txt')).toBe('con.txt')
      expect(hasReservedDeviceName('sub/aux.json')).toBe('aux.json')
      expect(hasReservedDeviceName('PRN')).toBe('PRN')
      expect(hasReservedDeviceName('nul')).toBe('nul')
      expect(hasReservedDeviceName('com1.log')).toBe('com1.log')
      expect(hasReservedDeviceName('lpt9.dat')).toBe('lpt9.dat')

      // Normal files should not trigger
      expect(hasReservedDeviceName('normal_file.txt')).toBeNull()
      expect(hasReservedDeviceName('connect.js')).toBeNull()
      expect(hasReservedDeviceName('auxiliary.ts')).toBeNull()
    })

    it('rejects reserved device names in resolveWithin with RESERVED_DEVICE_NAME code', () => {
      expect(() => {
        resolveWithin([tempDir], 'con.txt')
      }).toThrowError(/reserved Windows device name/i)

      try {
        resolveWithin([tempDir], 'con.txt')
      } catch (e) {
        expect(e.code).toBe('RESERVED_DEVICE_NAME')
      }
    })

    it('identifies immutable protected zones like .git', () => {
      const gitPath = path.join(tempDir, '.git', 'config')
      const normalPath = path.join(tempDir, 'src', 'index.js')
      expect(isImmutablePath(gitPath, tempDir)).toBe(true)
      expect(isImmutablePath(normalPath, tempDir)).toBe(false)
    })
  })

  describe('Cryptographic Streaming Hash', () => {
    it('computes streaming SHA-256 and MD5 hashes correctly', async () => {
      const file = path.join(tempDir, 'sample.txt')
      await fs.promises.writeFile(file, 'Hello Yogatik File System Toolkit!\n', 'utf8')

      const sha256 = await computeFileHash(file, 'sha256')
      expect(typeof sha256).toBe('string')
      expect(sha256.length).toBe(64)

      const md5 = await computeFileHash(file, 'md5')
      expect(typeof md5).toBe('string')
      expect(md5.length).toBe(32)
    })
  })

  describe('Automatic Backup Snapshots', () => {
    it('creates timestamped backups inside .ai_backups directory', async () => {
      const file = path.join(tempDir, 'doc.txt')
      await fs.promises.writeFile(file, 'Original critical content', 'utf8')

      const backupInfo = await createBackupSnapshot(file, tempDir)
      expect(backupInfo).not.toBeNull()
      expect(fs.existsSync(backupInfo.backupPath)).toBe(true)
      expect(backupInfo.backupPath).toContain('.ai_backups')

      const backedUpText = await fs.promises.readFile(backupInfo.backupPath, 'utf8')
      expect(backedUpText).toBe('Original critical content')
    })
  })

  describe('Advisory File Locking', () => {
    it('acquires and releases advisory lock file (.lock)', async () => {
      const target = path.join(tempDir, 'data.json')
      await fs.promises.writeFile(target, '{}', 'utf8')

      const lockRes = await acquireLock(target, { timeoutMs: 2000 })
      expect(lockRes.locked).toBe(true)
      expect(fs.existsSync(lockRes.lockFile)).toBe(true)

      const released = await releaseLock(target)
      expect(released).toBe(true)
      expect(fs.existsSync(lockRes.lockFile)).toBe(false)
    })

    it('breaks stale locks that exceed staleMs', async () => {
      const target = path.join(tempDir, 'shared.log')
      const lockFile = path.join(tempDir, '.shared.log.lock')

      // Create a simulated old lock file (timestamp in past)
      const oldPayload = JSON.stringify({ pid: 999999, time: Date.now() - 120000, target })
      await fs.promises.writeFile(lockFile, oldPayload, 'utf8')

      // acquireLock with staleMs of 60s should recognize it as stale and acquire successfully
      const lockRes = await acquireLock(target, { timeoutMs: 2000, staleMs: 60000 })
      expect(lockRes.locked).toBe(true)
      await releaseLock(target)
    })
  })

  describe('Dry-Run Diff Previews', () => {
    it('generates unified diff preview with changes and byte counts', () => {
      const oldText = 'line1\nline2\nline3\n'
      const newText = 'line1\nline2 modified\nline3\nline4\n'
      const preview = generateDiffPreview(oldText, newText, 'test.txt')

      expect(preview.changes).toBeGreaterThan(0)
      expect(preview.diff).toContain('- line2')
      expect(preview.diff).toContain('+ line2 modified')
      expect(preview.diff).toContain('+ line4')
      expect(preview.oldBytes).toBe(Buffer.byteLength(oldText))
      expect(preview.newBytes).toBe(Buffer.byteLength(newText))
    })
  })

  describe('FS_ERRORS Constants', () => {
    it('exports stable error codes for programmatic handling', () => {
      expect(FS_ERRORS.PATH_OUTSIDE_WORKSPACE).toBe('PATH_OUTSIDE_WORKSPACE')
      expect(FS_ERRORS.RESERVED_DEVICE_NAME).toBe('RESERVED_DEVICE_NAME')
      expect(FS_ERRORS.IMMUTABLE_ZONE).toBe('IMMUTABLE_ZONE')
      expect(FS_ERRORS.LOCK_TIMEOUT).toBe('LOCK_TIMEOUT')
      expect(FS_ERRORS.VERIFICATION_FAILED).toBe('VERIFICATION_FAILED')
    })
  })
})
