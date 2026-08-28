// Mermaid.js via CDN — diagrams in the browser
async function loadMermaid() {
  if (window.mermaid) return window.mermaid
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js'
  document.head.appendChild(script)
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'dark',
    themeVariables: {
      darkMode: true,
      background: '#1e1e2e',
      primaryColor: '#313244',
      primaryTextColor: '#cdd6f4',
      primaryBorderColor: '#89b4fa',
      lineColor: '#89dceb',
      secondaryColor: '#45475a',
      tertiaryColor: '#181825',
      mainBkg: '#1e1e2e',
      nodeBorder: '#89b4fa',
      clusterBkg: 'rgba(255, 255, 255, 0.04)',
      clusterBorder: '#6c7086',
      titleColor: '#cdd6f4',
      edgeLabelBackground: '#181825',
      nodeTextColor: '#cdd6f4',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
  })
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
