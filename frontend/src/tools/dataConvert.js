// RFC 4180-compliant CSV so Excel/Sheets open it cleanly: fields with commas,
// quotes or newlines are quoted (quotes doubled), rows joined with CRLF, and a
// UTF-8 BOM is prepended so unicode (accents, emoji, CJK) is not garbled.
const BOM = '﻿'

export function csvCell(v) {
  const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, keys) {
  const cols = keys || [...rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set }, new Set())]
  const body = rows.map(r => cols.map(k => csvCell(r[k])).join(','))
  return BOM + [cols.map(csvCell).join(','), ...body].join('\r\n')
}

/** Parse CSV respecting quoted fields (commas/newlines/escaped quotes inside). */
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', i = 0, inQ = false
  const s = text.replace(/^﻿/, '')
  while (i < s.length) {
    const c = s[i]
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
    i++
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

export const dataConvertTool = {
  schema: {
    description: 'Convert between JSON and CSV (RFC 4180, Excel-safe), or prettify/minify JSON',
    parameters: { type: 'object', properties: {
      data: { type: 'string', description: 'Input data (JSON or CSV string)' },
      operation: { type: 'string', enum: ['json_to_csv', 'csv_to_json', 'prettify', 'minify'], description: 'Conversion operation' },
    }, required: ['data', 'operation'] },
  },
  async execute({ data, operation }) {
    try {
      if (operation === 'prettify') return { success: true, tool: 'data_convert', result: JSON.stringify(JSON.parse(data), null, 2) }
      if (operation === 'minify') return { success: true, tool: 'data_convert', result: JSON.stringify(JSON.parse(data)) }
      if (operation === 'json_to_csv') {
        const arr = JSON.parse(data)
        if (!Array.isArray(arr)) return { success: false, error: 'Input must be a JSON array' }
        if (!arr.length) return { success: true, tool: 'data_convert', result: '' }
        return { success: true, tool: 'data_convert', result: toCsv(arr) }
      }
      if (operation === 'csv_to_json') {
        const rows = parseCsv(data.trim())
        if (!rows.length) return { success: true, tool: 'data_convert', result: '[]' }
        const headers = rows[0]
        const result = rows.slice(1).map(vals => Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])))
        return { success: true, tool: 'data_convert', result: JSON.stringify(result, null, 2) }
      }
      return { success: false, error: `Unknown operation: ${operation}` }
    } catch (e) { return { success: false, error: e.message } }
  },
}
