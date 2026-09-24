import React, { useMemo } from 'react'
import { Sparkles, ArrowRight, Code2, ShieldAlert, BarChart2, Lightbulb, CheckSquare } from 'lucide-react'

/**
 * Derives 3 contextual, high-value follow-up prompt chips based on the assistant's response.
 */
export function deriveFollowUpSuggestions(content = '') {
  if (typeof content !== 'string' || !content.trim()) return []

  const text = content.toLowerCase()
  const hasCode = /```[a-z]*[\s\S]*?```/i.test(content) || /function|const |class |import |def |return /i.test(content)
  const hasTableOrCsv = /\|.*\|[\r\n]+\|[-:| ]+\|/m.test(content) || (content.includes(',') && content.split('\n').length > 3)
  const hasArchitectureOrSecurity = /architecture|security|vulnerability|endpoint|database|api|auth|token/i.test(text)
  const isQuestionOrGuide = /how to|steps?|guide|recommend|tutorial/i.test(text)

  const suggestions = []

  if (hasCode) {
    suggestions.push({
      id: 'test',
      icon: <CheckSquare size={13} color="#10b981" />,
      label: 'Write unit tests',
      prompt: 'Write comprehensive automated unit tests covering typical cases and edge cases for this code.',
    })
    suggestions.push({
      id: 'optimize',
      icon: <Code2 size={13} color="#38bdf8" />,
      label: 'Optimize performance',
      prompt: 'How can this code be optimized further for better performance, latency, and memory footprint?',
    })
    suggestions.push({
      id: 'explain',
      icon: <Lightbulb size={13} color="#f59e0b" />,
      label: 'Explain step-by-step',
      prompt: 'Explain how this code works step-by-step with line-by-line commentary.',
    })
  } else if (hasTableOrCsv) {
    suggestions.push({
      id: 'chart',
      icon: <BarChart2 size={13} color="#06b6d4" />,
      label: 'Visualize as a chart',
      prompt: 'Visualize this data into a clear interactive chart and compare key metrics.',
    })
    suggestions.push({
      id: 'insights',
      icon: <Sparkles size={13} color="#a855f7" />,
      label: 'Extract key insights',
      prompt: 'What are the top 3 critical strategic insights and takeaways from this data?',
    })
    suggestions.push({
      id: 'export',
      icon: <ArrowRight size={13} color="#ec4899" />,
      label: 'Export executive report',
      prompt: 'Format this data into a formal executive document report (.docx) ready for presentation.',
    })
  } else if (hasArchitectureOrSecurity) {
    suggestions.push({
      id: 'audit',
      icon: <ShieldAlert size={13} color="#ef4444" />,
      label: 'Audit security edge cases',
      prompt: 'What potential security vulnerabilities or failure modes should we guard against in this design?',
    })
    suggestions.push({
      id: 'tradeoffs',
      icon: <BarChart2 size={13} color="#3b82f6" />,
      label: 'Compare alternative designs',
      prompt: 'What are the key architectural tradeoffs and alternative patterns for this approach?',
    })
    suggestions.push({
      id: 'diag',
      icon: <Sparkles size={13} color="#8b5cf6" />,
      label: 'Generate Mermaid diagram',
      prompt: 'Render a detailed visual Mermaid architecture flowchart diagram for this system.',
    })
  } else if (isQuestionOrGuide) {
    suggestions.push({
      id: 'example',
      icon: <Lightbulb size={13} color="#f59e0b" />,
      label: 'Give a real-world example',
      prompt: 'Provide a concrete, real-world practical example illustrating this in action.',
    })
    suggestions.push({
      id: 'pitfalls',
      icon: <ShieldAlert size={13} color="#ef4444" />,
      label: 'Common pitfalls to avoid',
      prompt: 'What are the most common pitfalls and beginner mistakes to avoid with this?',
    })
    suggestions.push({
      id: 'checklist',
      icon: <CheckSquare size={13} color="#10b981" />,
      label: 'Actionable checklist',
      prompt: 'Summarize the immediate next steps into a concise actionable implementation checklist.',
    })
  } else {
    suggestions.push({
      id: 'deeper',
      icon: <Sparkles size={13} color="#8b5cf6" />,
      label: 'Elaborate deeper',
      prompt: 'Elaborate on the most nuanced aspects of this in deeper technical detail.',
    })
    suggestions.push({
      id: 'counter',
      icon: <Lightbulb size={13} color="#38bdf8" />,
      label: 'Counter-arguments & alternatives',
      prompt: 'What are the strongest counter-arguments or alternative perspectives to this view?',
    })
    suggestions.push({
      id: 'summary',
      icon: <CheckSquare size={13} color="#10b981" />,
      label: 'Bullet-point summary',
      prompt: 'Summarize the core conclusions into 3 concise bullet points.',
    })
  }

  return suggestions.slice(0, 3)
}

/**
 * FollowUpSuggestions Component — renders clickable pill chips below assistant messages.
 */
export function FollowUpSuggestions({ content, onSelectSuggestion }) {
  const suggestions = useMemo(() => deriveFollowUpSuggestions(content), [content])

  if (!suggestions || suggestions.length === 0) return null

  return (
    <div className="follow-up-suggestions-container" role="group" aria-label="Suggested follow-up questions">
      <div className="suggestions-header">
        <Sparkles size={12} className="suggestions-sparkle-icon" />
        <span>Suggested follow-ups</span>
      </div>
      <div className="suggestions-chips-grid">
        {suggestions.map((item) => (
          <button
            key={item.id}
            type="button"
            className="follow-up-chip-btn"
            onClick={() => onSelectSuggestion?.(item.prompt)}
            title={item.prompt}
          >
            <span className="chip-icon">{item.icon}</span>
            <span className="chip-label">{item.label}</span>
            <ArrowRight size={11} className="chip-arrow" />
          </button>
        ))}
      </div>
    </div>
  )
}
