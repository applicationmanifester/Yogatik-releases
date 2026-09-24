import React, { useState } from 'react'
import {
  Wrench, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Clock, Zap, ArrowRight, CornerDownRight
} from 'lucide-react'
import { TOOL_ICONS } from './ToolResultCard'

/**
 * Modern Agent Workflow Stepper (Progressive Disclosure)
 * Groups multi-step autonomous agent actions into a clean, collapsible timeline.
 */
export function AgentWorkflowStepper({
  trace = [],
  toolsUsed = [],
  modelName = '',
  explanation = '',
  defaultExpanded = false,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const stepsCount = trace.length || toolsUsed.length || 1
  const hasFailures = trace.some(s => s.status === 'error')

  return (
    <div className={`agent-workflow-card ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <div
        className="agent-workflow-header"
        onClick={() => setIsExpanded(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsExpanded(v => !v) } }}
        aria-expanded={isExpanded}
      >
        <div className="workflow-header-left">
          <div className="workflow-zap-icon">
            <Zap size={14} color="#f59e0b" />
          </div>
          <span className="workflow-title-text">
            Agent Workflow
          </span>
          <span className="workflow-steps-badge">
            {stepsCount} action{stepsCount === 1 ? '' : 's'}
          </span>
          <span className={`workflow-status-pill ${hasFailures ? 'has-error' : 'completed'}`}>
            {hasFailures ? 'Action Warning' : 'Completed'}
          </span>
        </div>

        <div className="workflow-header-right">
          <div className="workflow-toggle-icon">
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="agent-workflow-content">
          {explanation && (
            <p className="workflow-explain-text">
              {explanation}
            </p>
          )}

          <div className="workflow-timeline">
            {trace.length > 0 ? (
              trace.map((step, idx) => {
                const Icon = TOOL_ICONS[step.tool] || Wrench
                const isError = step.status === 'error'
                const isDone = step.status === 'done'
                const arg = step.args && Object.keys(step.args).length
                  ? JSON.stringify(step.args).replace(/^{|}$/g, '').slice(0, 180)
                  : ''

                return (
                  <div key={idx} className={`timeline-step-row ${step.status || 'done'}`}>
                    <div className="timeline-node">
                      <div className="timeline-node-icon">
                        <Icon size={12} />
                      </div>
                      {idx < trace.length - 1 && <div className="timeline-line" />}
                    </div>

                    <div className="timeline-step-detail">
                      <div className="timeline-step-top">
                        <span className="step-number">Step {idx + 1}:</span>
                        <span className="step-tool-name">{step.tool}</span>
                        <span className={`step-badge ${isError ? 'error' : 'done'}`}>
                          {isError ? '✕ Failed' : '✓ Completed'}
                        </span>
                      </div>
                      {arg && (
                        <div className="step-args-preview">
                          <CornerDownRight size={10} style={{ opacity: 0.6, flexShrink: 0 }} />
                          <span className="truncate">{arg}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="timeline-step-row done">
                <div className="timeline-node">
                  <div className="timeline-node-icon">
                    <Wrench size={12} />
                  </div>
                </div>
                <div className="timeline-step-detail">
                  <div className="timeline-step-top">
                    <span className="step-number">Step 1:</span>
                    <span className="step-tool-name">Direct generation ({modelName || 'Model'})</span>
                    <span className="step-badge done">✓ Completed</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
