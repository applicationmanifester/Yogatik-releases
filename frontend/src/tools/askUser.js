/**
 * ask_user — Interactive human-in-the-loop tool.
 *
 * Allows the AI agent to pause mid-turn, ask clarifying questions or present
 * interactive choices to the user, and resume processing continuously with the
 * user's exact answer.
 */

let userQuestionHandler = null

export function setUserQuestionHandler(handler) {
  userQuestionHandler = handler
}

export const askUserTool = {
  schema: {
    description:
      'Ask the user a clarifying question or present choices mid-execution when you need ' +
      'preferences, missing parameters, design choices, or confirmation before proceeding. ' +
      'The execution pauses, prompts the user interactively, and returns their response to continue.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question or prompt to present to the user.' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of multiple-choice options (e.g. ["PostgreSQL", "SQLite", "MongoDB"]).',
        },
        placeholder: { type: 'string', description: 'Optional input placeholder text.' },
        allow_custom: { type: 'boolean', description: 'Allow typing a custom answer in addition to options (default true).' },
      },
      required: ['question'],
    },
  },
  // `= {}` on the parameter, not just on the fields: without it `execute()` with
  // no argument throws "Cannot destructure property 'question' of undefined",
  // which reaches the model as a raw TypeError it cannot act on — so it retries
  // the same broken call. Every other tool in the registry is total on missing
  // arguments for this reason.
  async execute({ question, options = [], placeholder = '', allow_custom = true } = {}) {
    if (!question?.trim()) return { success: false, error: 'No question provided' }

    if (typeof userQuestionHandler !== 'function') {
      return {
        success: true,
        tool: 'ask_user',
        question,
        user_response: 'Proceed with default best practice.',
      }
    }

    try {
      const answer = await userQuestionHandler({
        question: question.trim(),
        options: Array.isArray(options) ? options : [],
        placeholder,
        allow_custom: allow_custom !== false,
      })
      return {
        success: true,
        tool: 'ask_user',
        question,
        user_response: String(answer || '').trim(),
      }
    } catch (e) {
      return {
        success: false,
        tool: 'ask_user',
        error: `User skipped or cancelled question: ${e?.message || e}`,
      }
    }
  },
}
