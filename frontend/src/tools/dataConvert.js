export const dataConvertTool = {
  schema: {
    description: 'Convert between JSON and CSV, or prettify/minify JSON',
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
        const keys = Object.keys(arr[0] || {})
        const csv = [keys.join(','), ...arr.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
        return { success: true, tool: 'data_convert', result: csv }
      }
      if (operation === 'csv_to_json') {
        const lines = data.trim().split('\n')
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
        const result = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
          return Object.fromEntries(headers.map((h, i) => [h, vals[i]]))
        })
        return { success: true, tool: 'data_convert', result: JSON.stringify(result, null, 2) }
      }
    } catch (e) { return { success: false, error: e.message } }
  }
}
