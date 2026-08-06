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
  let fullContent = ''
  let toolCallsToProcess = []

  const processStream = () => new Promise((resolve, reject) => {
    toolCallsToProcess = []
    streamChat({
      provider, apiKey, model, messages, tools, temperature, signal,
      onToken: (t) => { fullContent += t; onToken?.(t) },
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
      for (const tc of toolCallsToProcess) {
        onStatus?.(`Using ${tc.name}...`)
        onToolStart?.(tc.name)

        const result = await executeTool(tc.name, tc.parsedArgs || {})
        toolResults[tc.name] = result
        onToolResult?.(tc.name, result)

        // Add assistant tool call + result to messages for next round
        messages.push({
          role: 'assistant', content: null,
          tool_calls: [{ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.parsedArgs || {}) } }],
        })
        messages.push({
          role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result),
        })
      }

      // Call LLM again with tool results
      onStatus?.('Thinking...')
      fullContent = ''
      await processStream()
    }

    onDone?.({ content: fullContent, toolResults })
  } catch (err) {
    if (err.name !== 'AbortError') onError?.(err)
  }
}
