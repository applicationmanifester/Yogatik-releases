// Mermaid.js — diagrams in the browser
export const diagramTool = {
  schema: {
    description: 'Generate a diagram from Mermaid syntax (flowchart, sequence, class, etc.)',
    parameters: { type: 'object', properties: {
      code: { type: 'string', description: 'Mermaid diagram code' },
    }, required: ['code'] },
  },
  async execute({ code }) {
    const mermaid = (await import('mermaid')).default
    mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: {
      primaryColor: '#ff6b35', primaryTextColor: '#e4e8ee', primaryBorderColor: '#253040',
      lineColor: '#8899aa', secondaryColor: '#1a2233', tertiaryColor: '#111820',
    }})
    const id = 'mermaid-' + Date.now()
    const { svg } = await mermaid.render(id, code)
    return { success: true, tool: 'diagram', svg, code }
  }
}
