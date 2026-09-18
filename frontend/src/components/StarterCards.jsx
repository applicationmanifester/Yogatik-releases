import React from 'react'
import { Sparkles, Code2, Globe, FileText, Lightbulb, Wrench } from 'lucide-react'

export const STARTER_CATEGORIES = [
  {
    id: 'research',
    title: 'Web & Deep Research',
    icon: Globe,
    color: '#06b6d4',
    prompt: "Search the web for today's top artificial intelligence and tech breakthroughs with key takeaways and sources.",
    description: "Multi-step web search, synthesis & source citations"
  },
  {
    id: 'coding',
    title: 'Code & Debugging',
    icon: Code2,
    color: '#3b82f6',
    prompt: "Review this code, identify bottlenecks or bugs, and provide clean refactored code with explanations.",
    description: "Code analysis, refactoring, algorithms & debugging"
  },
  {
    id: 'creative',
    title: 'Image & Creative Studio',
    icon: Sparkles,
    color: '#ec4899',
    prompt: "Generate a cozy cyberpunk coffee shop in Tokyo on a rainy evening with warm neon reflections.",
    description: "Image generation, storytelling, content & brainstorming"
  },
  {
    id: 'productivity',
    title: 'Productivity & Planning',
    icon: FileText,
    color: '#f59e0b',
    prompt: "Create a 5-day balanced dinner meal plan under 30 minutes with an organized grocery shopping list.",
    description: "Meal plans, emails, schedules & workflow automation"
  },
  {
    id: 'learning',
    title: 'Concept Explainer',
    icon: Lightbulb,
    color: '#10b981',
    prompt: "Explain how neural networks, embeddings, and large language models work using a simple everyday analogy.",
    description: "Break down complex topics into intuitive mental models"
  },
  {
    id: 'agent',
    title: 'Agentic Tools & OS',
    icon: Wrench,
    color: '#8b5cf6',
    prompt: "Explore the current working folder, list files, and summarize the project structure.",
    description: "File access, terminal execution & agentic tool calling"
  }
]

export function StarterCards({ onSelectPrompt }) {
  if (!onSelectPrompt) return null

  return (
    <div className="starter-cards-grid" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '12px',
      width: '100%',
      maxWidth: '820px',
      margin: '18px auto 8px auto',
      padding: '0 8px'
    }}>
      {STARTER_CATEGORIES.map(cat => {
        const Icon = cat.icon || Sparkles
        return (
          <button
            key={cat.id}
            type="button"
            className="starter-card"
            onClick={() => onSelectPrompt(cat.prompt)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              textAlign: 'left',
              padding: '14px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
              background: 'var(--bg-secondary, rgba(255,255,255,0.03))',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = cat.color
              e.currentTarget.style.background = 'var(--bg-tertiary, rgba(255,255,255,0.07))'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border-color, rgba(255,255,255,0.08))'
              e.currentTarget.style.background = 'var(--bg-secondary, rgba(255,255,255,0.03))'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: `${cat.color}22`,
                color: cat.color
              }}>
                <Icon size={16} />
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                {cat.title}
              </span>
            </div>
            <p style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.4,
              color: 'var(--text-secondary, #a6adc8)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {cat.description}
            </p>
          </button>
        )
      })}
    </div>
  )
}
