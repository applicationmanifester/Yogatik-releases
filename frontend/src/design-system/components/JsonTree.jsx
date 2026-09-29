import React, { useState } from 'react'
import { Braces, FileJson2, ChevronRight } from 'lucide-react'

/**
 * JsonTree — Renders parsed JSON as an interactive collapsible tree.
 *
 * Shared design-system component (moved out of VisionModal so every modal and
 * panel can render structured model output the same way).
 *
 * @param {any}    data            parsed JSON value
 * @param {number} level           internal recursion depth
 * @param {number} defaultExpanded auto-expand nodes shallower than this depth
 */
export function JsonTree({ data, level = 0, defaultExpanded = 2 }) {
  const isObject = data !== null && typeof data === 'object' && !Array.isArray(data)
  const isArray = Array.isArray(data)
  const isPrimitive = data === null || (typeof data !== 'object' && typeof data !== 'function')

  const [expanded, setExpanded] = useState(level < defaultExpanded)
  const toggleExpanded = () => setExpanded(!expanded)

  if (isPrimitive) {
    let displayValue = data
    if (data === null) displayValue = 'null'
    else if (typeof data === 'string') displayValue = `"${data}"`
    else displayValue = String(data)
    const color = typeof data === 'string'
      ? '#10b981'
      : typeof data === 'number'
        ? '#f59e0b'
        : typeof data === 'boolean'
          ? '#8b5cf6'
          : '#6b7280'
    return <span className="json-primitive" style={{ color }}>{displayValue}</span>
  }

  const entries = isObject ? Object.entries(data) : data.map((v, i) => [i, v])

  return (
    <div className="json-node" style={{ marginLeft: `${level * 16}px` }}>
      {level > 0 && (
        <span
          className="json-toggle"
          onClick={toggleExpanded}
          style={{ cursor: 'pointer', marginRight: '8px', userSelect: 'none', display: 'inline-flex', alignItems: 'center' }}
        >
          <ChevronRight
            size={12}
            style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}
          />
        </span>
      )}
      <span className="json-bracket" style={{ color: '#94a3b8' }}>{isObject ? '{' : '['}</span>
      {expanded && entries.length > 0 && (
        <div className="json-children">
          {entries.map(([key, value], index) => (
            <div key={`${level}-${key}-${index}`} className="json-entry">
              <span className="json-key" style={{ color: '#8b5cf6', marginRight: '8px' }}>
                {isObject ? `"${key}":` : ''}
              </span>
              <JsonTree data={value} level={level + 1} defaultExpanded={defaultExpanded} />
              {index < entries.length - 1 && <span className="json-comma" style={{ color: '#94a3b8' }}> ,</span>}
            </div>
          ))}
        </div>
      )}
      {expanded && entries.length === 0 && (
        <span style={{ color: '#94a3b8', padding: '0 8px' }}>{isObject ? '}' : ']'}</span>
      )}
      {!expanded && (
        <>
          <span className="json-preview" style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '12px' }}>
            {`... ${entries.length} ${isObject ? 'keys' : 'items'}`}
          </span>
          <span className="json-bracket" style={{ color: '#94a3b8', marginLeft: '4px' }}>{isObject ? '}' : ']'}</span>
        </>
      )}
    </div>
  )
}

/**
 * JsonViewer — Header + formatted/raw toggle around a JsonTree.
 *
 * @param {any}     data            parsed JSON value
 * @param {string}  title           header label
 * @param {boolean} collapsible     show the formatted/raw toggle
 * @param {number}  defaultExpanded auto-expand depth passed to the tree
 */
export function JsonViewer({ data, title = 'JSON Response', collapsible = true, defaultExpanded = 2 }) {
  const [raw, setRaw] = useState(false)
  if (data === null || data === undefined) return null
  return (
    <div className="vision-modal-json-viewer">
      <div className="json-viewer-header">
        <span className="json-viewer-title">
          <FileJson2 size={14} /> {title}
        </span>
        {collapsible && (
          <button
            className={`json-view-toggle ${raw ? 'active' : ''}`}
            onClick={() => setRaw(!raw)}
            title={raw ? 'View formatted' : 'View raw JSON'}
          >
            {raw ? <FileJson2 size={14} /> : <Braces size={14} />}
            <span>{raw ? 'Raw' : 'Formatted'}</span>
          </button>
        )}
      </div>
      {raw ? (
        <pre className="json-raw-view"><code>{JSON.stringify(data, null, 2)}</code></pre>
      ) : (
        <JsonTree data={data} defaultExpanded={defaultExpanded} />
      )}
    </div>
  )
}

export default JsonViewer
