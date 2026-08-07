/**
 * Browser-native agentic loop.
 * LLM decides which tools to call → browser executes → results sent back → final answer.
 * Uses OpenAI-compatible function calling (works with Groq, OpenRouter, OpenAI).
 */

import { streamChat } from './llm'
import { getToolSchemas, executeTool } from './tools/index'

const SYSTEM_PROMPT = `You are Yogatik, a helpful AI assistant with access to powerful tools.
You can generate images, execute Python code, create charts/diagrams, look up weather, translate text, read QR codes, extract web content, convert units, and more.
When a user's request requires a tool, call the appropriate function. You can call multiple tools in sequence.
Always provide clear, concise responses. Format with markdown when helpful.
If a tool fails, explain what happened and suggest alternatives.`

/**
 * Run the agent loop.
 * @param {Object} opts
 * @param {string} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array} opts.history - Previous messages [{role, content}]
 * @param {string} opts.userMessage
 * @param {boolean} opts.toolsEnabled
 * @param {number} opts.temperature
 * @param {AbortSignal} opts.signal
 * @param {Function} opts.onToken - Streaming text callback
 * @param {Function} opts.onStatus - Status message callback
 * @param {Function} opts.onToolStart - Called when tool execution starts
 * @param {Function} opts.onToolResult - Called with tool result
 * @param {Function} opts.onDone - Called with final { content, toolResults, sources }
 * @param {Function} opts.onError - Error callback
 */
export async function runAgent({
  provider, apiKey, model, history = [], userMessage,
  toolsEnabled = true, temperature = 0.7, signal,
  onToken, onStatus, onToolStart, onToolResult, onDone, onError,
}) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    // Sliding window: last 20 messages, max ~6k chars
    ...history.slice(-20).map(m => ({
      role: m.role, content: typeof m.content === 'string' ? m.content.slice(0, 3000) : m.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const tools = toolsEnabled ? getToolSchemas() : null
  const toolResults = {}
  let fullContent = ''   // everything shown to the user, across all rounds
  let roundContent = ''  // text from the current round only
  let toolCallsToProcess = []

  const processStream = () => new Promise((resolve, reject) => {
    toolCallsToProcess = []
    roundContent = ''
    streamChat({
      provider, apiKey, model, messages, tools, temperature, signal,
      onToken: (t) => { roundContent += t; fullContent += t; onToken?.(t) },
      onToolCall: (tc) => { toolCallsToProcess.push(tc) },
      onDone: () => resolve(),
      onError: (e) => reject(e),
    })
  })

  try {
    // First LLM call — may return text or tool calls
    await processStream()

    // Tool execution loop (max 5 rounds to prevent infinite loops)
    let rounds = 0
    while (toolCallsToProcess.length > 0 && rounds < 5) {
      rounds++
      const round = toolCallsToProcess.map((tc, i) => ({
        ...tc, id: tc.id || `call_${rounds}_${i}`,
      }))

      // One assistant message carrying every tool_call of this round,
      // followed by one tool message per call — the shape OpenAI-compatible
      // providers validate against (NVIDIA rejects interleaved pairs).
      messages.push({
        role: 'assistant',
        content: roundContent || null,
        tool_calls: round.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.parsedArgs || {}) },
        })),
      })

      for (const tc of round) {
        onStatus?.(`Using ${tc.name}...`)
        onToolStart?.(tc.name)

        let result
        try {
          result = await executeTool(tc.name, tc.parsedArgs || {})
        } catch (e) {
          result = { error: e?.message || String(e) }
        }
        toolResults[tc.name] = result
        onToolResult?.(tc.name, result)

        messages.push({
          role: 'tool', tool_call_id: tc.id, name: tc.name,
          content: JSON.stringify(result).slice(0, 12000), // cap context blowup
        })
      }

      // Call LLM again with tool results
      onStatus?.('Thinking...')
      await processStream()
    }

    onDone?.({ content: fullContent, toolResults })
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err)
  }
}
