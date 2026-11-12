import React from 'react'
import { Sparkles, Code2, Globe, FileText, Lightbulb, Wrench, ArrowUpRight } from 'lucide-react'

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
    <section className="starter-cards" aria-label="Sample prompts">
      <div className="starter-cards-heading">
        <span>Pick a starting point</span>
        <span>Choose a sample and Yogatik will start it for you.</span>
      </div>
      <div className="starter-cards-grid">
        {STARTER_CATEGORIES.map(cat => {
          const Icon = cat.icon || Sparkles
          return (
            <button
              key={cat.id}
              type="button"
              className="starter-card"
              style={{ '--starter-card-accent': cat.color }}
              onClick={() => onSelectPrompt(cat.prompt)}
              aria-label={`Try ${cat.title}. ${cat.description}`}
              title={cat.prompt}
            >
              <span className="starter-card-topline">
                <span className="starter-card-icon"><Icon size={17} aria-hidden="true" /></span>
                <span className="starter-card-title">{cat.title}</span>
              </span>
              <span className="starter-card-description">{cat.description}</span>
              <span className="starter-card-action">Try a sample prompt <ArrowUpRight size={14} aria-hidden="true" /></span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
