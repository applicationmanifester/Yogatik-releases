import { describe, it, expect } from 'vitest'
import { extractVars, fillTemplate, userVars } from './template'
import { skillDisabledTools, exportSkill, parseSkill, PRESET_SKILLS } from './skills'
import { getToolNames } from './tools/index'
import { workflowVars, runWorkflow } from './workflows'

describe('template variables', () => {
  it('extracts distinct vars in order', () => {
    expect(extractVars('Hi {{name}}, about {{topic}} and {{name}}')).toEqual(['name', 'topic'])
  })
  it('fills known vars, blanks unknown', () => {
    expect(fillTemplate('{{a}}-{{b}}', { a: 'x' })).toBe('x-')
  })
  it('userVars excludes workflow built-ins', () => {
    expect(userVars('{{topic}} then {{last}} and {{step1}}')).toEqual(['topic'])
  })
})

describe('skills', () => {
  it('allowlist disables everything else', () => {
    const skill = { tools: ['web_search', 'calculator'] }
    expect(skillDisabledTools(skill, ['web_search', 'calculator', 'weather', 'ocr'])).toEqual(['weather', 'ocr'])
  })
  it('no allowlist disables nothing', () => {
    expect(skillDisabledTools({ tools: [] }, ['a', 'b'])).toEqual([])
  })
  it('every built-in preset references only real, registered tools', () => {
    const real = new Set(getToolNames())
    for (const p of PRESET_SKILLS) {
      expect(p.id).toMatch(/^preset_/)
      for (const t of p.tools) expect(real.has(t), `${p.name} → ${t}`).toBe(true)
    }
  })
  it('round-trips export/import', () => {
    const s = { name: 'Researcher', description: 'd', system: 'Be rigorous', tools: ['web_search'], starters: ['Research {{topic}}'] }
    const back = parseSkill(exportSkill(s))
    expect(back).toEqual(s)
  })
  it('rejects malformed import', () => {
    expect(() => parseSkill('{"nope":true}')).toThrow()
  })
})

describe('workflow runner', () => {
  it('passes prior output forward via {{last}}', async () => {
    const wf = { steps: [{ prompt: 'Summarize {{topic}}' }, { prompt: 'Translate: {{last}}' }] }
    expect(workflowVars(wf)).toEqual(['topic'])
    const seen = []
    const out = await runWorkflow(wf, { topic: 'cats' }, async (prompt, i) => {
      seen.push(prompt)
      return `out${i}`
    })
    expect(seen[0]).toBe('Summarize cats')
    expect(seen[1]).toBe('Translate: out0')
    expect(out.map(r => r.output)).toEqual(['out0', 'out1'])
  })
})
