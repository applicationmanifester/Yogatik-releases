// Canvas-based chart generation — renders to data URL
export const chartTool = {
  schema: {
    description: 'Generate a chart/graph from data',
    parameters: { type: 'object', properties: {
      type: { type: 'string', enum: ['bar', 'line', 'pie'], description: 'Chart type' },
      title: { type: 'string', description: 'Chart title' },
      labels: { type: 'array', items: { type: 'string' }, description: 'X-axis labels' },
      values: { type: 'array', items: { type: 'number' }, description: 'Data values' },
    }, required: ['type', 'labels', 'values'] },
  },
  async execute({ type, title = '', labels, values }) {
    if (!Array.isArray(values) || !values.length) {
      return { success: false, error: 'values must be a non-empty array of numbers' }
    }
    if (labels && !Array.isArray(labels)) return { success: false, error: 'labels must be an array of strings' }
    const canvas = document.createElement('canvas')
    canvas.width = 600; canvas.height = 400
    const ctx = canvas.getContext('2d')

    const colors = ['#ff6b35','#f7c948','#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316']
    const bg = '#0a0e14'
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 600, 400)

    const max = Math.max(...values) * 1.2
    const pad = { top: 50, right: 30, bottom: 60, left: 60 }
    const w = 600 - pad.left - pad.right, h = 400 - pad.top - pad.bottom

    // Title
    ctx.fillStyle = '#e4e8ee'; ctx.font = 'bold 16px Inter, sans-serif'
    ctx.textAlign = 'center'; ctx.fillText(title, 300, 30)

    if (type === 'pie') {
      const total = values.reduce((a, b) => a + b, 0)
      let angle = -Math.PI / 2
      const cx = 300, cy = 220, r = 130
      values.forEach((v, i) => {
        const slice = (v / total) * 2 * Math.PI
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, angle, angle + slice)
        ctx.fillStyle = colors[i % colors.length]; ctx.fill()
        // Label
        const mid = angle + slice / 2
        const lx = cx + (r + 20) * Math.cos(mid), ly = cy + (r + 20) * Math.sin(mid)
        ctx.fillStyle = '#8899aa'; ctx.font = '11px Inter'; ctx.textAlign = 'center'
        ctx.fillText(`${labels[i]} (${Math.round(v/total*100)}%)`, lx, ly)
        angle += slice
      })
    } else {
      // Axes
      ctx.strokeStyle = '#253040'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(pad.left, pad.top); ctx.lineTo(pad.left, pad.top + h)
      ctx.lineTo(pad.left + w, pad.top + h); ctx.stroke()

      // Y-axis labels
      ctx.fillStyle = '#556677'; ctx.font = '11px Inter'; ctx.textAlign = 'right'
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + h - (h * i / 4)
        ctx.fillText(Math.round(max * i / 4), pad.left - 8, y + 4)
        ctx.strokeStyle = '#1a2233'; ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke()
      }

      if (type === 'bar') {
        const barW = w / labels.length * 0.7, gap = w / labels.length
        labels.forEach((l, i) => {
          const bh = (values[i] / max) * h
          const x = pad.left + gap * i + (gap - barW) / 2
          ctx.fillStyle = colors[i % colors.length]
          ctx.fillRect(x, pad.top + h - bh, barW, bh)
          ctx.fillStyle = '#8899aa'; ctx.font = '11px Inter'; ctx.textAlign = 'center'
          ctx.fillText(l, x + barW / 2, pad.top + h + 18)
        })
      } else {
        // Line
        ctx.strokeStyle = colors[0]; ctx.lineWidth = 2.5; ctx.beginPath()
        labels.forEach((l, i) => {
          const x = pad.left + (w / (labels.length - 1 || 1)) * i
          const y = pad.top + h - (values[i] / max) * h
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
          ctx.fillStyle = '#8899aa'; ctx.font = '11px Inter'; ctx.textAlign = 'center'
          ctx.fillText(l, x, pad.top + h + 18)
        })
        ctx.stroke()
        // Dots
        labels.forEach((_, i) => {
          const x = pad.left + (w / (labels.length - 1 || 1)) * i
          const y = pad.top + h - (values[i] / max) * h
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2)
          ctx.fillStyle = colors[0]; ctx.fill()
        })
      }
    }

    return { success: true, tool: 'chart', image_url: canvas.toDataURL('image/png'), title }
  }
}
