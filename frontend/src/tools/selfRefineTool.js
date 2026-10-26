/**
 * selfRefineTool — Exposes the autonomous self-improvement loop to the agent.
 * Allows the agent to reflect on its performance, propose improvements,
 * and apply approved changes to its constitution and behavior patterns.
 */

import {
  getConstitution,
  setConstitution,
  recordReflection,
  getRecentReflections,
  generateProposals,
  applyProposal,
  getPendingProposals,
  nightlyReflectionJob,
  DEFAULT_CONSTITUTION,
} from '../selfRefine'

export const selfRefineTool = {
  schema: {
    description:
      'Autonomous self-improvement loop: reflect on past executions, propose improvements to the agent\'s constitution/prompts/tool patterns, review pending proposals, and apply approved changes. Use this to continuously improve your own effectiveness.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get_constitution', 'reflect', 'propose', 'list_proposals', 'apply_proposal', 'run_nightly', 'record_turn'],
          description: 'What to do',
        },
        // For record_turn
        turnData: {
          type: 'object',
          description: 'Turn outcome data to record for reflection',
          properties: {
            task: { type: 'string' },
            toolsUsed: { type: 'array', items: { type: 'string' } },
            success: { type: 'boolean' },
            error: { type: 'string' },
            errorSignature: { type: 'string' },
            stagnationDetected: { type: 'boolean' },
            durationMs: { type: 'number' },
          },
        },
        // For apply_proposal
        proposalId: { type: 'string' },
        approvedBy: { type: 'string', description: 'Who approved (user, auto, etc.)' },
        // For propose
        reflectionsLimit: { type: 'number', description: 'How many recent reflections to analyze (default 200)' },
      },
      required: ['action'],
    },
  },

  async execute({ action, turnData, proposalId, approvedBy = 'user', reflectionsLimit = 200 }) {
    switch (action) {
      case 'get_constitution': {
        const constitution = await getConstitution()
        return { success: true, constitution, default: DEFAULT_CONSTITUTION }
      }

      case 'reflect': {
        const reflections = await getRecentReflections(reflectionsLimit)
        return { success: true, count: reflections.length, reflections }
      }

      case 'propose': {
        const reflections = await getRecentReflections(reflectionsLimit)
        const proposals = await generateProposals(reflections)
        return { success: true, proposalsGenerated: proposals.length, proposals }
      }

      case 'list_proposals': {
        const proposals = await getPendingProposals()
        return { success: true, pending: proposals.length, proposals }
      }

      case 'apply_proposal': {
        if (!proposalId) {
          return { success: false, error: 'proposalId required for apply_proposal' }
        }
        const result = await applyProposal(proposalId, approvedBy)
        return result
      }

      case 'run_nightly': {
        const result = await nightlyReflectionJob()
        return { success: true, ...result }
      }

      case 'record_turn': {
        if (!turnData) {
          return { success: false, error: 'turnData required for record_turn' }
        }
        const id = await recordReflection(turnData)
        return { success: true, reflectionId: id }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
