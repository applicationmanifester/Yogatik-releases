// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickFiller, isSlowTool } from './fillers'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const rand = () => 0

/**
 * The problem here is perceptual, not computational. A web search takes three
 * or four seconds however fast the model is; in a spoken conversation that
 * silence reads as a crash, so people repeat themselves, which barges in,
 * which cancels the turn — and then it really is broken.
 */
describe('spoken fillers', () => {
  it('speaks for slow tools and stays quiet for fast ones', () => {
    // Announcing a 200ms calculator call costs more time than it covers.
    expect(isSlowTool('web_search')).toBe(true)
    expect(isSlowTool('mcp__notion__search')).toBe(true)
    expect(isSlowTool('calculator')).toBe(false)
    expect(pickFiller(['calculator', 'hash'], { rand })).toBeNull()
  })

  it('matches the wording to what the tool is doing', () => {
    // "Let me look that up" is wrong for image generation.
    expect(pickFiller(['web_search'], { rand })).toMatch(/look that up|checking|search/i)
    expect(pickFiller(['image_generate'], { rand })).toMatch(/Making|put that together/i)
    expect(pickFiller(['terminal_run'], { rand })).toMatch(/Running|executing/i)
  })

  it('never talks over the model\'s own answer', () => {
    // Interrupting the reply to announce a search is worse than the silence.
    expect(pickFiller(['web_search'], { hasSpoken: true, rand })).toBeNull()
  })

  it('speaks once per turn, not once per tool', () => {
    // A three-tool round narrating itself three times is worse than quiet.
    expect(pickFiller(['web_search'], { announced: true, rand })).toBeNull()
  })

  it('does not repeat the previous line', () => {
    const first = pickFiller(['web_search'], { rand })
    expect(pickFiller(['web_search'], { last: first, rand })).not.toBe(first)
  })

  it('stays silent for a tool it does not know, rather than guessing', () => {
    expect(pickFiller(['some_new_tool'], { rand })).toBeNull()
    expect(pickFiller([], { rand })).toBeNull()
  })
})

describe('cascade wiring', () => {
  const src = fs.readFileSync(path.join(HERE, 'cascade.js'), 'utf8')

  it('resets the once-per-turn guard at the TOP of the turn', () => {
    // Placed after the first filler it would still be true from the previous
    // turn, so the line would fire exactly once per session and then go quiet
    // forever. A filler that only works the first time is worse than none:
    // the silence comes back with no explanation.
    const reset = src.indexOf('filler.announced = false')
    const visionFiller = src.indexOf("pickFiller(['identify']")
    const toolFiller = src.indexOf('pickFiller([name]')
    expect(reset).toBeGreaterThan(0)
    expect(reset).toBeLessThan(visionFiller)
    expect(reset).toBeLessThan(toolFiller)
  })

  it('does not re-announce on a provider fallback retry', () => {
    expect(src).toMatch(/if \(retry === 0\) filler\.announced = false/)
  })

  it('covers the on-device vision wait, which is awaited BEFORE the model runs', () => {
    // describeIfVisual is Tesseract plus a small VLM on a text-only model —
    // the longest single stretch of dead air in a turn, and it happens before
    // the model has even seen the question.
    const visionFiller = src.indexOf("pickFiller(['identify']")
    const describe_ = src.indexOf('await describeIfVisual(userText)')
    expect(visionFiller).toBeGreaterThan(0)
    expect(visionFiller).toBeLessThan(describe_)
  })
})
