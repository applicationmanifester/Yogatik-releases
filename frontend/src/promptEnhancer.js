/**
 * Prompt Enhancer module for Yogatik Studio.
 * Transforms brief or vague user prompts into clear, structured, actionable instructions.
 */

import { chatComplete } from './llm'

const ENHANCE_SYSTEM_PROMPT = `You are an expert prompt engineer and software architect.
Your task is to take a user's raw prompt/idea and refine it into an optimized, unambiguous, and highly actionable instruction.
Preserve the user's core intent. Enhance with:
- Clear objective and requirements
- Expected format or architectural components
- Essential constraints and edge cases to consider
Keep the output direct, concise, and focused on the task without conversational fluff.`

export async function enhancePromptText(input, { provider = 'groq', model = '', apiKey = '' } = {}) {
  if (!input || typeof input !== 'string') return input
  const text = input.trim()
  if (text.length < 3) return text

  const messages = [
    { role: 'system', content: ENHANCE_SYSTEM_PROMPT },
    { role: 'user', content: `Please refine and structure this prompt for an AI assistant:\n\n"${text}"` }
  ]

  try {
    const result = await chatComplete({
      provider: provider || 'groq',
      apiKey,
      model,
      messages,
      temperature: 0.3,
    })
    const enhanced = (typeof result === 'string' ? result : (result?.content || '')).trim()
    return enhanced || text
  } catch {
    // If API is unreachable, apply smart rule-based enhancement
    return `${text}\n\nKey Requirements:\n- Ensure production-quality code and robust error handling\n- Include clean documentation and clear output structure`
  }
}
