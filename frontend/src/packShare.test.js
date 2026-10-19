import { describe, it, expect, beforeEach, vi } from 'vitest'

// A fake settings table with the REAL db.js semantics — getSetting returns the
// fallback for a missing/null row — so the skills / workflows / agents stores
// and their read-time preset merging behave exactly as they do in the app.
const rows = new Map()
vi.mock('./db', () => ({
  getSetting: async (key, fallback = null) => {
    const v = rows.has(key) ? rows.get(key) : null
    return v != null ? v : fallback
  },
  setSetting: async (key, value) => { rows.set(key, value) },
}))
// downloadPack must reuse chatExport.downloadBlob rather than its own plumbing.
vi.mock('./chatExport', async (importOriginal) => ({ ...(await importOriginal()), downloadBlob: vi.fn() }))

const {
  exportPack, importPack, previewPack, readFilePack, downloadPack, packItemCount, PACK_FORMAT, MAX_PACK_ITEMS,
} = await import('./packShare')
const { downloadBlob } = await import('./chatExport')
const { upsertSkill, getSkills } = await import('./skills')
const { upsertWorkflow, getWorkflows } = await import('./workflows')
const { upsertAgent, getAgents } = await import('./agents')

beforeEach(() => rows.clear())

const skill = (name, system = 'Be helpful.', extra = {}) =>
  upsertSkill({ name, description: 'd', system, tools: ['web_search'], starters: [], ...extra })
const jsonFile = (obj, name = 'pack.yogatik-pack.json') => {
  // A picked file is only ever read through file.text() (same as
  // chatExport.importConversationFile), so a duck-typed stub stands in for it
  // under jsdom, whose File lacks .text().
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj)
  return { name, text: async () => text }
}
const row = (res, name) => res.items.find(r => r.name === name)

describe('exportPack — validation and shape', () => {
  it('bundles the selected items with the pack envelope, keeping their ids', async () => {
    const s = await skill('Alpha', 'A-system')
    const wf = await upsertWorkflow({ name: 'Loop', steps: [{ prompt: 'One' }, { prompt: 'Two {{v}}' }] })
    const ag = await upsertAgent({ name: 'Scout', system: 'Scout system.' })
    const pack = await exportPack({ skillIds: [s.id], workflowIds: [wf.id], agentIds: [ag.id] })
    expect(pack.format).toBe('yogatik-pack')
    expect(pack.v).toBe(1)
    expect(pack.exportedAt).toBeTruthy()
    expect(pack.skills).toEqual([{ id: s.id, name: 'Alpha', description: 'd', system: 'A-system', tools: ['web_search'], starters: [] }])
    expect(pack.workflows).toEqual([wf])
    expect(pack.agents).toEqual([ag])
    expect(packItemCount(pack)).toBe(3)
  })

  it('strips fields the stores do not own (builtin flags, plugin markers, junk)', async () => {
    rows.set('skills', [{ id: 'sk_junk', name: 'Junk', description: '', system: 'S', tools: [], starters: [], builtin: true, fromPlugin: true, secret: 'do-not-share' }])
    const pack = await exportPack({ skillIds: ['sk_junk'] })
    expect(pack.skills).toEqual([{ id: 'sk_junk', name: 'Junk', description: '', system: 'S', tools: [], starters: [] }])
  })

  it('refuses an empty or oversized selection', async () => {
    await expect(exportPack({})).rejects.toThrow(/nothing selected/i)
    const ids = []
    for (let i = 1; i <= MAX_PACK_ITEMS + 1; i++) ids.push((await skill(`Bulk ${i}`)).id)
    await expect(exportPack({ skillIds: ids })).rejects.toThrow(/at most 50/)
  })
})

describe('importPack — malformed pack rejection', () => {
  it('rejects the whole pack with a human message — never imports outside the three collections', async () => {
    await expect(importPack(null)).rejects.toThrow(/not a yogatik pack/i)
    await expect(importPack({ format: 'yogatik-backup', v: 1 })).rejects.toThrow(/unknown "format"/i)
    await expect(importPack({ format: 'yogatik-pack', v: 2, skills: [] })).rejects.toThrow(/newer version/i)
    // A pack claiming `conversations` (or any other collection) is refused outright.
    await expect(importPack({ format: 'yogatik-pack', v: 1, conversations: [{ id: 1, title: 'sneaky' }] })).rejects.toThrow(/unknown collection/i)
    await expect(importPack({ format: 'yogatik-pack', v: 1 })).rejects.toThrow(/no skills, workflows or agents/i)
    const many = Array.from({ length: MAX_PACK_ITEMS + 1 }, (_, i) => ({ name: `P${i}`, system: 'x' }))
    await expect(importPack({ format: 'yogatik-pack', v: 1, skills: many })).rejects.toThrow(/too many/i)
    await expect(importPack({ format: 'yogatik-pack', v: 1, skills: many.slice(0, 30), workflows: many.slice(0, 21) })).rejects.toThrow(/too many/i)
  })

  it('skips malformed items individually with the reason, importing valid siblings', async () => {
    const pack = {
      format: 'yogatik-pack', v: 1,
      skills: [{ system: 'no name at all' }, { name: 'No system text' }, { name: 'Good skill', system: 'sys' }],
      workflows: [{ name: 'Bad flow', steps: [{ nope: true }] }, { name: 'Good flow', steps: [{ prompt: 'do it' }] }],
      agents: [{ name: 'No system text agent' }, { name: 'Good agent', system: 'sys' }],
    }
    const res = await importPack(pack)
    expect(res.ok).toBe(true)
    expect(res.added).toBe(3)
    expect(res.skipped).toBe(4)
    expect(res.items[0].reason).toMatch(/missing name/)
    expect(res.items.filter(r => r.name === 'No system text')[0].reason).toMatch(/system text is required/)
    expect(res.items.filter(r => r.name === 'Bad flow')[0].reason).toMatch(/no step has a prompt/)
    expect(res.items.filter(r => r.name === 'No system text agent')[0].reason).toMatch(/system text is required/)
    // and only the valid ones landed
    expect((await getWorkflows()).find(w => w.name === 'Good flow')).toBeTruthy()
    expect((await getWorkflows()).find(w => w.name === 'Bad flow')).toBeUndefined()
    expect((await getAgents()).find(a => a.name === 'Good agent')).toBeTruthy()
  })
})

describe('importPack — collision matrix (skip by default, replace with overwrite)', () => {
  const collidePack = async () => {
    const dup = await skill('Dup', 'original system')
    const wfDup = await upsertWorkflow({ name: 'Dup flow', steps: [{ prompt: 'original step' }] })
    const agDup = await upsertAgent({ name: 'Dup agent', system: 'original agent system' })
    return {
      dup, wfDup, agDup,
      pack: {
        format: 'yogatik-pack', v: 1,
        skills: [{ id: dup.id, name: 'Dup', description: 'd', system: 'new system', tools: [], starters: [] }, { name: 'Fresh', system: 'fresh system' }],
        workflows: [{ id: wfDup.id, name: 'Dup flow', steps: [{ prompt: 'new step' }] }],
        agents: [{ id: agDup.id, name: 'Dup agent', system: 'new agent system' }],
      },
    }
  }

  it('previews per-item added/replaced/skipped WITHOUT writing anything', async () => {
    const { pack, dup } = await collidePack()
    const preview = await previewPack(pack)
    expect(preview.total).toBe(4)
    expect(preview.added).toBe(1)
    expect(preview.replaced).toBe(0)
    expect(preview.skipped).toBe(3)
    expect(row(preview, 'Dup')).toMatchObject({ status: 'skip', collection: 'skills', added: false, replaced: false, skipped: true })
    expect(row(preview, 'Dup').reason).toMatch(/already exists/i)
    expect(row(preview, 'Dup flow').status).toBe('skip')
    expect(row(preview, 'Dup agent').status).toBe('skip')
    expect(row(preview, 'Fresh').status).toBe('add')
    // preview must not have touched the store
    expect((await getSkills()).find(s => s.id === dup.id).system).toBe('original system')
    expect((await getSkills()).filter(s => s.name === 'Fresh')).toHaveLength(0)
  })

  it('importing with the default skips collisions and leaves them untouched', async () => {
    const { pack, dup, wfDup, agDup } = await collidePack()
    const res = await importPack(pack)
    expect(res.added).toBe(1)
    expect(res.replaced).toBe(0)
    expect(res.skipped).toBe(3)
    const skills = await getSkills()
    expect(skills.find(s => s.id === dup.id).system).toBe('original system')
    expect(skills.find(s => s.name === 'Fresh').system).toBe('fresh system')
    expect(skills.find(s => s.id === dup.id).name).toBe('Dup')
    expect((await getWorkflows()).find(w => w.id === wfDup.id).steps[0].prompt).toBe('original step')
    expect((await getAgents()).find(a => a.id === agDup.id).system).toBe('original agent system')
  })

  it('importing with overwrite replaces every colliding item', async () => {
    const { pack, dup, wfDup, agDup } = await collidePack()
    await importPack(pack)                 // first pass: the id-less Fresh lands
    const res = await importPack(pack, { overwrite: true })
    expect(res.added).toBe(1)              // Fresh has no id, so it can never collide — it adds again
    expect(res.replaced).toBe(3)
    expect(res.skipped).toBe(0)
    expect(row(res, 'Dup').status).toBe('replace')
    expect(row(res, 'Dup').replaced).toBe(true)
    const skills = await getSkills()
    expect(skills.find(s => s.id === dup.id).system).toBe('new system')
    expect((await getWorkflows()).find(w => w.id === wfDup.id).steps[0].prompt).toBe('new step')
    expect((await getAgents()).find(a => a.id === agDup.id).system).toBe('new agent system')
  })

  it('a duplicate id inside one pack is written once', async () => {
    const pack = {
      format: PACK_FORMAT, v: 1,
      skills: [{ id: 'sk_twin', name: 'Twin', system: 'one' }, { id: 'sk_twin', name: 'Twin', system: 'two' }],
    }
    const res = await importPack(pack, { overwrite: true })
    expect(res.added).toBe(1)
    expect(res.skipped).toBe(1)
    expect(res.items[1].reason).toMatch(/duplicate/)
    const twins = (await getSkills()).filter(s => s.id === 'sk_twin')
    expect(twins).toHaveLength(1)
    expect(twins[0].system).toBe('one')
  })
})

describe('export → import round-trip', () => {
  it('reproduces the originals on a fresh device (ids and steps intact)', async () => {
    const s = await skill('Alpha', 'A-system')
    await skill('Beta', 'B-system')        // deliberately NOT selected
    const wf = await upsertWorkflow({ name: 'Loop', steps: [{ prompt: 'One {{v}}' }, { prompt: 'Use {{last}}' }] })
    const ag = await upsertAgent({ name: 'Scout', system: 'Scout system.', model: 'composer-x', canDelegate: true, subAgents: ['agent_coder'] })
    const pack = await exportPack({ skillIds: [s.id], workflowIds: [wf.id], agentIds: [ag.id] })

    rows.clear()                           // fresh device
    const res = await importPack(pack)
    expect(res.added).toBe(3)
    expect(res.replaced).toBe(0)
    expect(res.skipped).toBe(0)
    const skills = await getSkills()
    expect(skills.find(x => x.id === s.id)).toEqual(s)
    expect(skills.find(x => x.name === 'Beta')).toBeUndefined()
    expect(await getWorkflows()).toEqual([wf])
    expect((await getAgents()).find(x => x.id === ag.id)).toEqual(ag)
  })
})

describe('file helpers', () => {
  it('readFilePack parses and envelope-validates a picked file', async () => {
    const pack = await readFilePack(jsonFile({ format: 'yogatik-pack', v: 1, skills: [{ name: 'Fine', system: 's' }] }))
    expect(pack.format).toBe('yogatik-pack')
    expect(pack.skills).toHaveLength(1)
    await expect(readFilePack(jsonFile('{nope', 'broken.json'))).rejects.toThrow(/not.*json/i)
    await expect(readFilePack(jsonFile({ format: 'other' }, 'pack.json'))).rejects.toThrow(/not a yogatik pack/i)
    await expect(readFilePack(null)).rejects.toThrow(/no pack file selected/i)
  })

  it('downloadPack goes through the shared chatExport.downloadBlob plumbing', () => {
    vi.mocked(downloadBlob).mockClear()
    downloadPack({ format: PACK_FORMAT, v: 1, exportedAt: 'now', skills: [], workflows: [], agents: [] }, 'mine.yogatik-pack.json')
    downloadPack({ format: PACK_FORMAT, v: 1, exportedAt: 'now', skills: [], workflows: [], agents: [] })
    expect(downloadBlob).toHaveBeenCalledWith(expect.anything(), 'mine.yogatik-pack.json')
    expect(downloadBlob).toHaveBeenLastCalledWith(expect.anything(), expect.stringMatching(/\.yogatik-pack\.json$/))
  })
})
