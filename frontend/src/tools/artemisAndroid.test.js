import { describe, it, expect } from 'vitest'
import { executeArtemisAndroid, artemisAndroidTool, ANDROID_KEY_CODES } from './artemisAndroid'

describe('Google Artemis Android Automation Tool', () => {
  it('exports canonical tool definition with artemis_android name', () => {
    expect(artemisAndroidTool.definition.function.name).toBe('artemis_android')
    expect(artemisAndroidTool.definition.type).toBe('function')
    expect(typeof artemisAndroidTool.execute).toBe('function')
  })

  it('inspects status successfully with key feature listings', async () => {
    const res = await executeArtemisAndroid({ action: 'status' })
    expect(res.success).toBe(true)
    expect(res.engine).toContain('Google Artemis')
    expect(Array.isArray(res.features)).toBe(true)
    expect(res.mcp_compatible).toBe(true)
  })

  it('lists devices safely in fallback sandbox', async () => {
    const res = await executeArtemisAndroid({ action: 'list_devices' })
    expect(res.success).toBe(true)
    expect(res.count).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(res.devices)).toBe(true)
  })

  it('executes tap action with valid numeric coordinates', async () => {
    const res = await executeArtemisAndroid({ action: 'tap', x: 540, y: 1200 })
    expect(res.success).toBe(true)
    expect(res.action).toBe('tap')
    expect(res.x).toBe(540)
    expect(res.y).toBe(1200)
  })

  it('rejects tap action with invalid coordinates', async () => {
    const res = await executeArtemisAndroid({ action: 'tap', x: 'invalid' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Valid x and y numeric coordinates are required')
  })

  it('handles typing text action', async () => {
    const res = await executeArtemisAndroid({ action: 'type_text', text: 'Hello Yogatik' })
    expect(res.success).toBe(true)
    expect(res.action).toBe('type_text')
  })

  it('handles pressing Android hardware keys', async () => {
    const res = await executeArtemisAndroid({ action: 'press_key', key: 'home' })
    expect(res.success).toBe(true)
    expect(res.keyCode).toBe(ANDROID_KEY_CODES.home)
    expect(res.keyCode).toBe(3)
  })

  it('handles app launching', async () => {
    const res = await executeArtemisAndroid({ action: 'launch_app', package_name: 'com.android.chrome' })
    expect(res.success).toBe(true)
    expect(res.package).toBe('com.android.chrome')
  })

  it('blocks destructive shell commands with security guard', async () => {
    const res = await executeArtemisAndroid({ action: 'shell', command: 'rm -rf /' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Prohibited destructive command')
  })

  it('executes autonomous run_task with Dynamic-First & Coordinate-Fallback pattern', async () => {
    const res = await executeArtemisAndroid({
      action: 'run_task',
      task: 'Open calculator and calculate 25 * 4',
    })
    expect(res.success).toBe(true)
    expect(res.pattern).toContain('Dynamic-First, Coordinate-Fallback')
    expect(res.execution_plan.length).toBe(4)
  })

  it('returns graceful error for unknown actions without throwing', async () => {
    const res = await executeArtemisAndroid({ action: 'unknown_mobile_action' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('Unknown Artemis action')
  })
})
