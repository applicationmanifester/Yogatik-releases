// Mermaid.js via CDN — diagrams in the browser
async function loadMermaid() {
  if (window.mermaid) return window.mermaid
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
  document.head.appendChild(script)
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
  window.mermaid.initialize({
    startOnLoad: false,
    // Diagram source comes from model output and the SVG is injected with
    // dangerouslySetInnerHTML — pin sanitisation instead of trusting the
    // library default to stay strict.
    securityLevel: 'strict',
    htmlLabels: false,
    theme: 'dark', themeVariables: {
    primaryColor: '#ff6b35', primaryTextColor: '#e4e8ee', primaryBorderColor: '#253040',
    lineColor: '#8899aa', secondaryColor: '#1a2233', tertiaryColor: '#111820',
  }})
  return window.mermaid
}

export const diagramTool = {
  schema: {
    description: 'Generate a diagram from Mermaid syntax (flowchart, sequence, class, etc.)',
    parameters: { type: 'object', properties: {
      code: { type: 'string', description: 'Mermaid diagram code' },
    }, required: ['code'] },
  },
  async execute({ code }) {
    if (typeof code !== 'string' || !code.trim()) return { success: false, error: 'code is required (Mermaid source)' }
    const mermaid = await loadMermaid()
    const id = 'mermaid-' + Date.now()
    const { svg } = await mermaid.render(id, code)
    return { success: true, tool: 'diagram', svg, code }
  }
}
