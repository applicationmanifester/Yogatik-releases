import { streamMessage } from './api'

export async function runMultiAgentDebate({
  topic,
  modelA, // { provider, model }
  modelB, // { provider, model }
  rounds = 2,
  onMessageStart,
  onToken,
  onMessageDone,
  onDone,
  onError
}) {
  try {
    let history = []
    
    const PROPOSER_PROMPT = `You are the Expert Proposer in a multi-agent collaboration.
Your goal is to provide a comprehensive, well-structured, and accurate initial solution or response to the user's query.
Be detailed and clear.`

    const CRITIC_PROMPT = `You are the Expert Critic in a multi-agent collaboration.
Your goal is to review the Proposer's solution. Identify any flaws, missing information, edge cases, or areas for improvement.
Do not hold back—be rigorously analytical but constructive. Suggest concrete improvements.`

    const REFINER_PROMPT = `You are the Expert Refiner in a multi-agent collaboration.
Your goal is to review the Critic's feedback and your previous solution.
Incorporate the feedback and provide the final, polished, and perfected response to the user's original query.`

    // Round 1: Model A proposes
    onMessageStart('A', modelA, 'Proposing initial solution...')
    let contentA = ''
    
    await new Promise((resolve, reject) => {
      streamMessage(
        {
          message: topic,
          messages: [],
          model: modelA.model,
          provider: modelA.provider,
          system_prompt: PROPOSER_PROMPT,
          use_tools: false,
          use_web_search: false,
          channel: 'multiagent-A'
        },
        (t) => { contentA += t; onToken('A', t) },
        null,
        () => { resolve() },
        (err) => { reject(err) }
      )
    })
    
    history.push({ role: 'user', content: topic })
    history.push({ role: 'assistant', content: contentA })
    onMessageDone('A', contentA)

    // Round 2: Model B critiques
    onMessageStart('B', modelB, 'Critiquing and analyzing...')
    let contentB = ''
    
    await new Promise((resolve, reject) => {
      streamMessage(
        {
          message: "Please critique the above solution.",
          messages: history,
          model: modelB.model,
          provider: modelB.provider,
          system_prompt: CRITIC_PROMPT,
          use_tools: false,
          use_web_search: false,
          channel: 'multiagent-B'
        },
        (t) => { contentB += t; onToken('B', t) },
        null,
        () => { resolve() },
        (err) => { reject(err) }
      )
    })
    
    history.push({ role: 'user', content: "Please critique the above solution." })
    history.push({ role: 'assistant', content: contentB })
    onMessageDone('B', contentB)

    // Round 3: Model A refines (Final)
    onMessageStart('A', modelA, 'Refining final answer...')
    let contentFinal = ''
    
    await new Promise((resolve, reject) => {
      streamMessage(
        {
          message: "Please provide the final refined solution based on the critique.",
          messages: history,
          model: modelA.model,
          provider: modelA.provider,
          system_prompt: REFINER_PROMPT,
          use_tools: false,
          use_web_search: false,
          channel: 'multiagent-A'
        },
        (t) => { contentFinal += t; onToken('A', t) },
        null,
        () => { resolve() },
        (err) => { reject(err) }
      )
    })
    
    onMessageDone('A', contentFinal)
    
    onDone(contentFinal)

  } catch (err) {
    onError(err.message || String(err))
  }
}
