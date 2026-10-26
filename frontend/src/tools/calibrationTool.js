/**
 * calibrationTool — Exposes the meta-cognition/calibration system to the agent.
 * Allows querying calibration curves, recording outcomes, and running analysis.
 */

import {
  estimateConfidence,
  recordConfidenceOutcome,
  getCalibrationCurve,
  getAllCalibrationCurves,
  decideAction,
  calibratedExecute,
  nightlyCalibrationAnalysis,
  autoAdjustThreshold,
  DEFAULT_THRESHOLDS,
} from '../calibration'

export const calibrationTool = {
  schema: {
    description:
      'Meta-cognition & uncertainty calibration: estimate confidence for tool calls, ' +
      'record outcomes for calibration curves, query calibration stats, and run nightly analysis. ' +
      'Use to understand and improve the agent\'s self-assessment accuracy.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['estimate', 'record', 'curve', 'all_curves', 'decide', 'execute', 'nightly_analysis', 'adjust_threshold', 'thresholds'],
          description: 'What to do',
        },
        // For estimate
        toolName: { type: 'string', description: 'Tool name to estimate confidence for' },
        args: { type: 'object', description: 'Tool arguments' },
        context: { type: 'object', description: 'Context: { recentErrors?, conversationHistory?, userIntent? }' },
        // For record
        predictedConfidence: { type: 'number', description: 'Predicted confidence 0-1' },
        actualSuccess: { type: 'boolean', description: 'Whether the tool actually succeeded' },
        error: { type: 'string', description: 'Error message if failed' },
        // For curve
        toolName: { type: 'string', description: 'Tool name' },
        // For decide/execute
        toolName: { type: 'string', description: 'Tool name' },
        args: { type: 'object', description: 'Tool arguments' },
        context: { type: 'object', description: 'Context' },
      },
      required: ['action'],
    },
  },

  async execute(args = {}) {
    const { action } = args

    switch (action) {
      case 'estimate': {
        const { toolName, args: toolArgs, context = {} } = args
        if (!toolName) return { success: false, error: 'toolName required' }
        const confidence = await estimateConfidence(toolName, toolArgs || {}, context)
        return { success: true, toolName, confidence, threshold: DEFAULT_THRESHOLDS[toolName] || DEFAULT_THRESHOLDS.default }
      }

      case 'record': {
        const { toolName, predictedConfidence, actualSuccess, error } = args
        if (!toolName || predictedConfidence === undefined || actualSuccess === undefined) {
          return { success: false, error: 'toolName, predictedConfidence, actualSuccess required' }
        }
        await recordConfidenceOutcome(toolName, predictedConfidence, actualSuccess, { error })
        return { success: true }
      }

      case 'curve': {
        const { toolName } = args
        if (!toolName) return { success: false, error: 'toolName required' }
        const curve = await getCalibrationCurve(toolName)
        return { success: true, ...curve }
      }

      case 'all_curves': {
        const curves = await getAllCalibrationCurves()
        return { success: true, curves, count: curves.length }
      }

      case 'decide': {
        const { toolName, args: toolArgs, context = {} } = args
        if (!toolName) return { success: false, error: 'toolName required' }
        const decision = await decideAction(toolName, toolArgs || {}, context)
        return { success: true, ...decision }
      }

      case 'execute': {
        const { toolName, args: toolArgs, context = {} } = args
        if (!toolName) return { success: false, error: 'toolName required' }
        const result = await calibratedExecute(toolName, toolArgs || {}, context)
        return result
      }

      case 'nightly_analysis': {
        const report = await nightlyCalibrationAnalysis()
        return { success: true, ...report }
      }

      case 'adjust_threshold': {
        const { toolName } = args
        if (!toolName) return { success: false, error: 'toolName required' }
        const threshold = await autoAdjustThreshold(toolName)
        return { success: true, toolName, threshold }
      }

      case 'thresholds': {
        return { success: true, thresholds: DEFAULT_THRESHOLDS }
      }

      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}
