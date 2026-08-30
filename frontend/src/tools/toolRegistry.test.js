import { describe, it, expect } from 'vitest'
import ALL_TOOLS, { TOOL_ALIASES, MAX_TOOLS_PER_REQUEST } from './index'

/**
 * This test used to assert the OLD behaviour — that spawnSubagentTool ran its
 * workers itself and aggregated their output. It passed while the tool was
 * incapable of doing its own job: `opts.provider` is never supplied by
 * executeTool, so every worker went to the `local` provider, and the workers had
 * no tools at all. The mock hid both. Same class as TerminalPanel.test.jsx
 * encoding the broken PTY contract.
 *
 * What is worth pinning now is the retirement itself.
 */
describe('spawn_subagent retirement', () => {
  it('is an alias, not a second registered tool', () => {
    expect(ALL_TOOLS.spawn_subagent).toBeUndefined()
    expect(ALL_TOOLS.parallel_agents).toBeUndefined()
    expect(TOOL_ALIASES.spawn_subagent).toBe('spawn_agents')
    expect(TOOL_ALIASES.parallel_agents).toBe('spawn_agents')
  })

  it('the alias target is a real registered tool', () => {
    // An alias pointing at a name nothing registers resolves to "Unknown tool".
    expect(ALL_TOOLS.spawn_agents).toBeTruthy()
    expect(typeof ALL_TOOLS.spawn_agents.execute).toBe('function')
  })

  it('no alias shadows a registered tool', () => {
    // `watch` was once both, so the model read one description and reached a
    // different tool. executeTool prefers the registered name, which makes a
    // shadowing alias silently unreachable rather than wrong — either way it is
    // a lie in the schema list.
    const shadowed = Object.keys(TOOL_ALIASES).filter(a => ALL_TOOLS[a])
    expect(shadowed).toEqual([])
  })

  it('the schema budget stays under the provider function limit', () => {
    // OpenAI hard-caps a request at 128 functions. This was set to Infinity,
    // which does not degrade an answer — it 400s the turn — and shipped the
    // entire 200+ tool registry (~36k tokens) on every request to every
    // provider. A finite cap is the thing that makes prioritizeToolSchemas
    // mean anything.
    expect(Number.isFinite(MAX_TOOLS_PER_REQUEST)).toBe(true)
    expect(MAX_TOOLS_PER_REQUEST).toBeLessThanOrEqual(128)
  })
})
