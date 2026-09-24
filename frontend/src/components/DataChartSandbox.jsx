import React, { useState, useMemo } from 'react'
import { BarChart3, LineChart, PieChart, Download, RefreshCw } from 'lucide-react'

/**
 * Parses CSV, Markdown tables, or JSON into structured chart series.
 */
export function parseDataForChart(rawText = '') {
  if (!rawText || typeof rawText !== 'string') return { labels: [], values: [] }

  const text = rawText.trim()

  // 1. Try parsing JSON array of objects
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        const keys = Object.keys(parsed[0])
        const labelKey = keys.find(k => typeof parsed[0][k] === 'string') || keys[0]
        const valueKey = keys.find(k => typeof parsed[0][k] === 'number') || keys[1] || keys[0]

        return {
          labels: parsed.map(item => String(item[labelKey] ?? '')),
          values: parsed.map(item => Number(item[valueKey] ?? 0)),
        }
      }
    } catch {}
  }

  // 2. Try parsing Markdown table
  const mdRows = text.split('\n').filter(line => line.includes('|'))
  if (mdRows.length >= 3) {
    const headerRow = mdRows[0].split('|').map(s => s.trim()).filter(Boolean)
    const dataRows = mdRows.slice(2).map(r => r.split('|').map(s => s.trim()).filter(Boolean))

    if (dataRows.length > 0) {
      const labels = []
      const values = []

      dataRows.forEach(row => {
        if (row.length >= 2) {
          labels.push(row[0])
          const val = parseFloat(row[1].replace(/[^0-9.-]/g, ''))
          values.push(isNaN(val) ? 0 : val)
        }
      })

      if (labels.length > 0 && values.some(v => v !== 0)) {
        return { labels, values }
      }
    }
  }

  // 3. Try parsing CSV
  const csvLines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if (csvLines.length >= 2) {
    const hasComma = csvLines[0].includes(',')
    if (hasComma) {
      const dataLines = csvLines.slice(1)
      const labels = []
      const values = []

      dataLines.forEach(line => {
        const parts = line.split(',').map(s => s.trim())
        if (parts.length >= 2) {
          labels.push(parts[0])
          const val = parseFloat(parts[1].replace(/[^0-9.-]/g, ''))
          values.push(isNaN(val) ? 0 : val)
        }
      })

      if (labels.length > 0 && values.some(v => v !== 0)) {
        return { labels, values }
      }
    }
  }

  // Fallback demo data if parse fails
  return {
    labels: ['Item A', 'Item B', 'Item C', 'Item D'],
    values: [42, 68, 25, 89],
  }
}

/**
 * DataChartSandbox — zero-dependency interactive SVG visualization sandbox.
 * Supports Bar, Line, and Donut / Pie visualization modes.
 */
export function DataChartSandbox({ rawData = '' }) {
  const [chartType, setChartType] = useState('bar') // 'bar' | 'line' | 'donut'
  const [hoveredIndex, setHoveredIndex] = useState(null)

  const { labels, values } = useMemo(() => parseDataForChart(rawData), [rawData])

  const maxVal = Math.max(...values, 1)
  const minVal = Math.min(...values, 0)
  const range = maxVal - minVal || 1

  const palette = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#6366f1']

  const chartWidth = 540
  const chartHeight = 260
  const padding = 40

  return (
    <div className="data-chart-sandbox-container">
      {/* Chart Toolbar */}
      <div className="chart-sandbox-toolbar">
        <div className="chart-type-toggles">
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'bar' ? 'active' : ''}`}
            onClick={() => setChartType('bar')}
            title="Bar Chart"
          >
            <BarChart3 size={13} />
            <span>Bar</span>
          </button>
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'line' ? 'active' : ''}`}
            onClick={() => setChartType('line')}
            title="Line Chart"
          >
            <LineChart size={13} />
            <span>Line</span>
          </button>
          <button
            type="button"
            className={`chart-type-btn ${chartType === 'donut' ? 'active' : ''}`}
            onClick={() => setChartType('donut')}
            title="Donut Chart"
          >
            <PieChart size={13} />
            <span>Donut</span>
          </button>
        </div>

        {hoveredIndex !== null && (
          <div className="chart-tooltip-badge">
            <span style={{ color: palette[hoveredIndex % palette.length], fontWeight: 700 }}>●</span>
            <span style={{ fontWeight: 600 }}>{labels[hoveredIndex]}:</span>
            <span>{values[hoveredIndex].toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="chart-svg-stage">
        {chartType === 'bar' && (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="interactive-chart-svg">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
              const y = chartHeight - padding - pct * (chartHeight - padding * 2)
              return (
                <g key={i}>
                  <line
                    x1={padding}
                    y1={y}
                    x2={chartWidth - padding}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={padding - 8}
                    y={y + 3}
                    fill="#64748b"
                    fontSize="9"
                    textAnchor="end"
                  >
                    {Math.round(minVal + pct * range)}
                  </text>
                </g>
              )
            })}

            {/* Bars */}
            {values.map((v, i) => {
              const usableWidth = chartWidth - padding * 2
              const barWidth = Math.max(12, Math.min(48, (usableWidth / values.length) * 0.65))
              const step = usableWidth / values.length
              const x = padding + i * step + (step - barWidth) / 2
              const barHeight = Math.max(4, ((v - minVal) / range) * (chartHeight - padding * 2))
              const y = chartHeight - padding - barHeight
              const isHovered = hoveredIndex === i

              return (
                <g
                  key={i}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx="4"
                    fill={isHovered ? '#38bdf8' : palette[i % palette.length]}
                    style={{ transition: 'all 0.15s ease', opacity: hoveredIndex !== null && !isHovered ? 0.4 : 1 }}
                  />
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight - padding + 14}
                    fill={isHovered ? '#fff' : '#94a3b8'}
                    fontSize="10"
                    textAnchor="middle"
                  >
                    {labels[i]?.length > 8 ? labels[i].slice(0, 7) + '…' : labels[i]}
                  </text>
                </g>
              )
            })}
          </svg>
        )}

        {chartType === 'line' && (
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="interactive-chart-svg">
            {/* Grid lines */}
            {[0, 0.5, 1].map((pct, i) => {
              const y = chartHeight - padding - pct * (chartHeight - padding * 2)
              return (
                <line
                  key={i}
                  x1={padding}
                  y1={y}
                  x2={chartWidth - padding}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeDasharray="4 4"
                />
              )
            })}

            {/* Line path */}
            {(() => {
              const points = values.map((v, i) => {
                const usableWidth = chartWidth - padding * 2
                const step = values.length > 1 ? usableWidth / (values.length - 1) : 0
                const x = padding + i * step
                const y = chartHeight - padding - ((v - minVal) / range) * (chartHeight - padding * 2)
                return { x, y }
              })

              const pathStr = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '')

              return (
                <>
                  <path
                    d={pathStr}
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={hoveredIndex === i ? 6 : 4}
                      fill={hoveredIndex === i ? '#fff' : '#06b6d4'}
                      stroke="#0f172a"
                      strokeWidth="2"
                      style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  ))}
                </>
              )
            })()}
          </svg>
        )}

        {chartType === 'donut' && (
          <svg viewBox="0 0 300 240" className="interactive-chart-svg donut-svg" style={{ maxHeight: '240px' }}>
            {(() => {
              const total = values.reduce((a, b) => a + b, 0) || 1
              let currentAngle = -90
              const cx = 150
              const cy = 110
              const r = 70
              const innerR = 45

              return (
                <g>
                  {values.map((v, i) => {
                    const sliceAngle = (v / total) * 360
                    const startAngle = currentAngle
                    const endAngle = currentAngle + sliceAngle
                    currentAngle = endAngle

                    const startRad = (startAngle * Math.PI) / 180
                    const endRad = (endAngle * Math.PI) / 180

                    const x1 = cx + r * Math.cos(startRad)
                    const y1 = cy + r * Math.sin(startRad)
                    const x2 = cx + r * Math.cos(endRad)
                    const y2 = cy + r * Math.sin(endRad)

                    const ix1 = cx + innerR * Math.cos(endRad)
                    const iy1 = cy + innerR * Math.sin(endRad)
                    const ix2 = cx + innerR * Math.cos(startRad)
                    const iy2 = cy + innerR * Math.sin(startRad)

                    const largeArc = sliceAngle > 180 ? 1 : 0
                    const pathData = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`

                    const isHovered = hoveredIndex === i

                    return (
                      <path
                        key={i}
                        d={pathData}
                        fill={palette[i % palette.length]}
                        opacity={hoveredIndex !== null && !isHovered ? 0.35 : 1}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                    )
                  })}
                  <text x={cx} y={cy} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">
                    {hoveredIndex !== null ? `${Math.round((values[hoveredIndex] / total) * 100)}%` : 'Total'}
                  </text>
                  <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize="10">
                    {hoveredIndex !== null ? labels[hoveredIndex] : total.toLocaleString()}
                  </text>
                </g>
              )
            })()}
          </svg>
        )}
      </div>
    </div>
  )
}
