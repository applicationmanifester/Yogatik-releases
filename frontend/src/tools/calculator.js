// Safe math evaluation using Function constructor with Math scope
export const calculatorTool = {
  schema: {
    description: 'Evaluate a mathematical expression',
    parameters: { type: 'object', properties: {
      expression: { type: 'string', description: 'Math expression like "sqrt(144) + 2^3"' },
    }, required: ['expression'] },
  },
  async execute({ expression }) {
    const safe = expression
      .replace(/\^/g, '**')
      .replace(/sqrt/g, 'Math.sqrt')
      .replace(/abs/g, 'Math.abs')
      .replace(/sin/g, 'Math.sin')
      .replace(/cos/g, 'Math.cos')
      .replace(/tan/g, 'Math.tan')
      .replace(/log/g, 'Math.log')
      .replace(/pi/gi, 'Math.PI')
      .replace(/e(?![a-z])/gi, 'Math.E')
      .replace(/ceil/g, 'Math.ceil')
      .replace(/floor/g, 'Math.floor')
      .replace(/round/g, 'Math.round')
      .replace(/pow/g, 'Math.pow')
      .replace(/min/g, 'Math.min')
      .replace(/max/g, 'Math.max')

    if (/[a-zA-Z_$]/.test(safe.replace(/Math\.\w+/g, '').replace(/\d/g, ''))) {
      return { success: false, error: 'Invalid expression' }
    }
    try {
      const result = new Function(`return (${safe})`)()
      return { success: true, tool: 'calculator', expression, result: Number(result) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}
