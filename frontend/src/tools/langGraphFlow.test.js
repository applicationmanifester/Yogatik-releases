import { describe, it, expect } from 'vitest'
import {
  StateGraph,
  executeMultiAgentResearchWorkflow,
  langGraphFlowTool,
} from './langGraphFlow'

describe('LangGraph Stateful Multi-Agent Flow Engine', () => {
  it('executes linear graph workflow with state accumulation', async () => {
    const graph = new StateGraph()
    graph
      .addNode('step1', async (s) => ({ val1: 'hello' }))
      .addNode('step2', async (s) => ({ val2: `${s.val1} world` }))
      .setEntryPoint('step1')
      .addEdge('step1', 'step2')
      .addEdge('step2', '__end__')

    const result = await graph.invoke()
    expect(result.status).toBe('completed')
    expect(result.finalState.val1).toBe('hello')
    expect(result.finalState.val2).toBe('hello world')
    expect(result.totalSteps).toBe(2)
  })

  it('routes dynamically with conditional edges', async () => {
    const graph = new StateGraph()
    graph
      .addNode('classifier', async () => ({ intent: 'code' }))
      .addNode('code_specialist', async () => ({ handledBy: 'coder' }))
      .addNode('chat_specialist', async () => ({ handledBy: 'chat' }))
      .setEntryPoint('classifier')
      .addConditionalEdge('classifier', (state) => (state.intent === 'code' ? 'code_specialist' : 'chat_specialist'))
      .addEdge('code_specialist', '__end__')
      .addEdge('chat_specialist', '__end__')

    const result = await graph.invoke()
    expect(result.finalState.handledBy).toBe('coder')
  })

  it('pauses on human-in-the-loop nodes', async () => {
    const graph = new StateGraph()
    graph
      .addNode('plan', async () => ({ planReady: true }))
      .addNode('human_approval', async () => ({ approved: true }))
      .addNode('deploy', async () => ({ deployed: true }))
      .setEntryPoint('plan')
      .addEdge('plan', 'human_approval')
      .addEdge('human_approval', 'deploy')

    const result = await graph.invoke({}, { pauseOnNodes: ['human_approval'] })
    expect(result.status).toBe('paused')
    expect(result.pausedAtNode).toBe('human_approval')
    expect(result.state.planReady).toBe(true)
    expect(result.state.deployed).toBeUndefined()
  })

  it('prevents infinite recursion loops with max recursion limit', async () => {
    const graph = new StateGraph()
    graph
      .addNode('loopA', async (s) => ({ counter: (s.counter || 0) + 1 }))
      .setEntryPoint('loopA')
      .addEdge('loopA', 'loopA')

    await expect(graph.invoke({ counter: 0 }, { maxRecursion: 5 })).rejects.toThrow('max recursion limit')
  })

  it('executes multi-agent research workflow via langGraphFlowTool', async () => {
    const res = await langGraphFlowTool.execute({
      action: 'run_research_workflow',
      query: 'Retrieval Augmented Generation',
      targetAudience: 'Software Engineers',
    })

    expect(res.status).toBe('completed')
    expect(res.finalState.researchFindings).toContain('Retrieval Augmented Generation')
    expect(res.finalState.isApproved).toBe(true)
  })
})
