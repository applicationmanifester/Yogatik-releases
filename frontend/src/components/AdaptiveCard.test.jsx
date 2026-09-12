import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdaptiveCard, parseAdaptiveCards } from './AdaptiveCard'

describe('parseAdaptiveCards', () => {
  it('returns plain text when no card tags exist', () => {
    const { parts } = parseAdaptiveCards('Hello world')
    expect(parts).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('handles empty or non-string input safely', () => {
    expect(parseAdaptiveCards(null).parts).toEqual([{ type: 'text', content: '' }])
    expect(parseAdaptiveCards(undefined).parts).toEqual([{ type: 'text', content: '' }])
  })

  it('extracts valid JSON adaptive card block', () => {
    const text = 'Before\n<adaptive-card>{"type": "data", "title": "Metrics", "body": [{"label": "CPU", "value": "12%"}]}</adaptive-card>\nAfter'
    const { parts } = parseAdaptiveCards(text)
    expect(parts.length).toBe(3)
    expect(parts[0]).toEqual({ type: 'text', content: 'Before\n' })
    expect(parts[1].type).toBe('card')
    expect(parts[1].data.title).toBe('Metrics')
    expect(parts[2]).toEqual({ type: 'text', content: '\nAfter' })
  })

  it('safely falls back to formatted code block on malformed JSON', () => {
    const text = 'Here is a broken card:\n<adaptive-card>{broken json}</adaptive-card>'
    const { parts } = parseAdaptiveCards(text)
    expect(parts.length).toBe(2)
    expect(parts[1].type).toBe('text')
    expect(parts[1].content).toContain('```json\n{broken json}\n```')
  })
})

describe('AdaptiveCard rendering', () => {
  it('renders data grid card with metrics', () => {
    const data = {
      type: 'data',
      title: 'Performance Stats',
      body: [
        { label: 'Latency', value: '120ms' },
        { label: 'Tokens', value: '450' },
      ],
    }
    const { container } = render(<AdaptiveCard data={data} cardIndex={0} />)
    expect(container.textContent).toContain('Performance Stats')
    expect(container.textContent).toContain('Latency')
    expect(container.textContent).toContain('120ms')
    expect(container.textContent).toContain('Tokens')
    expect(container.textContent).toContain('450')
  })

  it('renders status checklist card', () => {
    const data = {
      type: 'status',
      title: 'Deployment Status',
      body: [
        { label: 'Build passed', status: 'done' },
        { label: 'Running tests', status: 'active' },
        { label: 'Deploy to staging', status: 'pending' },
      ],
    }
    const { container } = render(<AdaptiveCard data={data} cardIndex={0} />)
    expect(container.textContent).toContain('Deployment Status')
    expect(container.textContent).toContain('Build passed')
    expect(container.textContent).toContain('Running tests')
    expect(container.textContent).toContain('Deploy to staging')
  })

  it('renders action bar card with action buttons', () => {
    const data = {
      type: 'action',
      title: 'Next Steps',
      body: [
        { label: 'Explain code', prompt: 'Explain the selected code' },
        { label: 'Run tests', prompt: 'Run the unit tests', primary: true },
      ],
    }
    const { container } = render(<AdaptiveCard data={data} cardIndex={0} />)
    expect(container.textContent).toContain('Next Steps')
    expect(screen.getByRole('button', { name: 'Explain code' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Run tests' })).toBeDefined()
  })
})
