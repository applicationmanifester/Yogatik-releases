// Pure JS unit conversion — covers common units
const CONVERSIONS = {
  km: { m: 1000, mi: 0.621371, ft: 3280.84, cm: 100000 },
  m: { km: 0.001, mi: 0.000621371, ft: 3.28084, cm: 100, in: 39.3701 },
  mi: { km: 1.60934, m: 1609.34, ft: 5280 },
  ft: { m: 0.3048, in: 12, cm: 30.48 },
  kg: { g: 1000, lb: 2.20462, oz: 35.274 },
  g: { kg: 0.001, lb: 0.00220462, mg: 1000, oz: 0.035274 },
  lb: { kg: 0.453592, g: 453.592, oz: 16 },
  oz: { g: 28.3495, lb: 0.0625, kg: 0.0283495 },
  l: { ml: 1000, gal: 0.264172, qt: 1.05669 },
  ml: { l: 0.001, gal: 0.000264172 },
  gal: { l: 3.78541, ml: 3785.41, qt: 4 },
  c: { f: (v) => v * 9/5 + 32, k: (v) => v + 273.15 },
  f: { c: (v) => (v - 32) * 5/9, k: (v) => (v - 32) * 5/9 + 273.15 },
  k: { c: (v) => v - 273.15, f: (v) => (v - 273.15) * 9/5 + 32 },
}

export const unitConvertTool = {
  schema: {
    description: 'Convert between units (length, weight, volume, temperature)',
    parameters: { type: 'object', properties: {
      value: { type: 'number', description: 'Numeric value' },
      from: { type: 'string', description: 'Source unit (km, m, mi, ft, kg, g, lb, oz, l, ml, gal, c, f, k)' },
      to: { type: 'string', description: 'Target unit' },
    }, required: ['value', 'from', 'to'] },
  },
  async execute({ value, from, to }) {
    if (typeof from !== 'string' || typeof to !== 'string' || !Number.isFinite(Number(value))) {
      return { success: false, error: 'value (number), from and to are all required, e.g. {value: 5, from: "km", to: "mi"}' }
    }
    const f = from.toLowerCase(), t = to.toLowerCase()
    const conv = CONVERSIONS[f]?.[t]
    if (conv === undefined) return { success: false, error: `Cannot convert ${from} to ${to}` }
    const raw = typeof conv === 'function' ? conv(value) : value * conv
    const result = Math.round(raw * 10000) / 10000
    // The card renders formatted/output and copies it — returning only `result`
    // left the result box and the Copy button empty.
    return {
      success: true, tool: 'unit_convert', value, from, to, result,
      formatted: `${result.toLocaleString()} ${t}`,
      output: `${result} ${t}`,
      formula: typeof conv === 'function' ? `${f} → ${t}` : `× ${conv}`,
      explanation: `${value.toLocaleString()} ${f} = ${result.toLocaleString()} ${t}`,
    }
  }
}
