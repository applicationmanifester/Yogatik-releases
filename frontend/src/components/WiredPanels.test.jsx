/**
 * The panels that were built but never imported.
 *
 * None of them had ever been mounted, so nothing had exercised their first
 * render: FileEditorModal's backdrop class did not exist in styles.css (it
 * rendered inline in the document flow instead of over the app), and
 * AutoSkillsPanel's handlers all dispatched CustomEvents nobody listened for.
 * These tests mount each one the way App.jsx now does.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { SchedulerPanel } from './SchedulerPanel'
import { SubAgentRunnerPanel } from './SubAgentRunnerPanel'
import { AutoSkillsPanel } from './AutoSkillsPanel'
import { FileEditorModal } from './FileEditorModal'

let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  delete window.__YOGATIK_SCHEDULER__
  delete window.__YOGATIK_SUBAGENT__
  vi.restoreAllMocks()
})

const mount = async (el) => { await act(async () => { root.render(el) }) }

describe('panels reachable from the command palette', () => {
  it('SchedulerPanel renders and explains itself without the desktop bridge', async () => {
    await mount(<SchedulerPanel isOpen onClose={() => {}} onToast={() => {}} />)
    expect(host.textContent).toMatch(/scheduler/i)
    // Silently doing nothing is what it used to do on the web.
    expect(host.textContent).toMatch(/desktop app/i)
  })

  it('SchedulerPanel loads jobs when the bridge is present', async () => {
    const getJobs = vi.fn().mockResolvedValue({ success: true, jobs: [{ id: '1', name: 'Nightly digest', schedule: '0 6 * * *', enabled: true }] })
    window.__YOGATIK_SCHEDULER__ = { getJobs }
    await mount(<SchedulerPanel isOpen onClose={() => {}} onToast={() => {}} />)
    expect(getJobs).toHaveBeenCalled()
  })

  it('SubAgentRunnerPanel renders and explains itself without the bridge', async () => {
    await mount(<SubAgentRunnerPanel isOpen onClose={() => {}} onToast={() => {}} />)
    expect(host.textContent).toMatch(/sub-agent/i)
    expect(host.textContent).toMatch(/desktop app/i)
  })

  it('AutoSkillsPanel reads the auto-skills module directly, not a dead event', async () => {
    // It used to dispatch 'yogatik:auto-skills:load' and wait for a listener
    // that did not exist, behind a check on an unrelated bridge.
    const listener = vi.fn()
    window.addEventListener('yogatik:auto-skills:load', listener)
    await mount(<AutoSkillsPanel isOpen onClose={() => {}} onToast={() => {}} />)
    window.removeEventListener('yogatik:auto-skills:load', listener)
    expect(listener).not.toHaveBeenCalled()
    expect(host.textContent.length).toBeGreaterThan(0)
  })

  it('FileEditorModal renders over the app, not inline in the flow', async () => {
    await mount(<FileEditorModal isOpen onClose={() => {}} onSave={() => {}} />)
    // .modal-backdrop has no rule in styles.css; .modal-overlay is the real one.
    expect(host.querySelector('.modal-overlay')).not.toBeNull()
    expect(host.querySelector('.modal-backdrop')).toBeNull()
  })

  it('every panel renders nothing when closed', async () => {
    for (const el of [
      <SchedulerPanel key="a" isOpen={false} onClose={() => {}} />,
      <SubAgentRunnerPanel key="b" isOpen={false} onClose={() => {}} />,
      <AutoSkillsPanel key="c" isOpen={false} onClose={() => {}} />,
      <FileEditorModal key="d" isOpen={false} onClose={() => {}} />,
    ]) {
      await mount(el)
      expect(host.innerHTML).toBe('')
    }
  })
})
