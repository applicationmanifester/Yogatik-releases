import { describe, it, expect } from 'vitest'
import { codeValidateTool } from './codeValidate'

describe('code_validate tool', () => {
  it('validates correct JSON', async () => {
    const res = await codeValidateTool.execute({
      code: JSON.stringify({ name: 'yogatik', version: 1, items: [1, 2, 3] }, null, 2),
      language: 'json',
    })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('detects invalid JSON with line and column pointers', async () => {
    const invalidJson = `{\n  "name": "yogatik",\n  "broken": \n}`
    const res = await codeValidateTool.execute({
      code: invalidJson,
      language: 'json',
    })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(false)
    expect(res.errors.length).toBeGreaterThan(0)
    expect(res.errors[0].line).toBeDefined()
  })

  it('validates matching brackets and parentheses in JavaScript', async () => {
    const code = `
      function add(a, b) {
        const list = [a, b];
        return list.reduce((acc, x) => acc + x, 0);
      }
    `
    const res = await codeValidateTool.execute({ code, language: 'javascript' })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(true)
  })

  it('catches mismatched brackets in JS/TS', async () => {
    const code = `function broken() { return [1, 2, 3); }`
    const res = await codeValidateTool.execute({ code, language: 'javascript' })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(false)
    expect(res.errors[0].message).toContain('Mismatched delimiter')
  })

  it('catches unclosed curly braces in JS/TS', async () => {
    const code = `export function test() { if (true) { console.log("missing closing"); }`
    const res = await codeValidateTool.execute({ code, language: 'javascript' })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(false)
    expect(res.errors[0].message).toContain('Unclosed delimiter')
  })

  it('validates balanced JSX tags', async () => {
    const jsx = `
      export function Card({ title, children }) {
        return (
          <div className="card">
            <h2>{title}</h2>
            <img src="logo.png" alt="logo" />
            <div className="content">{children}</div>
          </div>
        );
      }
    `
    const res = await codeValidateTool.execute({ code: jsx, language: 'jsx' })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(true)
  })

  it('catches mismatched or unclosed JSX tags', async () => {
    const jsx = `
      export function Broken() {
        return (
          <div>
            <span>text</div>
          </span>
        );
      }
    `
    const res = await codeValidateTool.execute({ code: jsx, language: 'jsx' })
    expect(res.success).toBe(true)
    expect(res.valid).toBe(false)
    expect(res.errors[0].message).toContain('Mismatched tag')
  })
})
