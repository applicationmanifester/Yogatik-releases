import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DataChartSandbox, parseDataForChart } from './DataChartSandbox'

afterEach(cleanup)

describe('DataChartSandbox Component', () => {
  it('parses Markdown table into labels and numbers', () => {
    const md = `| Quarter | Revenue |
|---|---|
| Q1 | 120 |
| Q2 | 180 |
| Q3 | 240 |`
    const { labels, values } = parseDataForChart(md)
    expect(labels).toEqual(['Q1', 'Q2', 'Q3'])
    expect(values).toEqual([120, 180, 240])
  })

  it('parses CSV into labels and numbers', () => {
    const csv = `Category,Count
Alpha,45
Beta,60
Gamma,90`
    const { labels, values } = parseDataForChart(csv)
    expect(labels).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(values).toEqual([45, 60, 90])
  })

  it('renders SVG chart and toggles chart types', () => {
    const csv = `Item,Value\nA,10\nB,20`
    const { container } = render(<DataChartSandbox rawData={csv} />)

    expect(screen.getByText('Bar')).toBeDefined()
    expect(screen.getByText('Line')).toBeDefined()
    expect(screen.getByText('Donut')).toBeDefined()

    // Switch to Line
    fireEvent.click(screen.getByText('Line'))
    expect(container.querySelector('path')).not.toBeNull()

    // Switch to Donut
    fireEvent.click(screen.getByText('Donut'))
    expect(container.querySelector('.donut-svg')).not.toBeNull()
  })
})
