import { describe, it, expect } from 'vitest'
import { parseToolCalls, stripToolCallSyntax, repairJson } from './promptedTools'
import { classifyQuery } from './api'

// Regression harness: the weak-model outputs prompted tool-calling must survive.
describe('prompted tool-call parsing (repair harness)', () => {
  const cases = [
    ['clean fenced', '```json\n{"tool_calls":[{"name":"web_search","arguments":{"query":"x"}}]}\n```', 'web_search'],
    ['trailing comma', '```json\n{"tool_calls":[{"name":"weather","arguments":{"location":"Paris",},}]}\n```', 'weather'],
    ['python literals', '```json\n{"tool_calls":[{"name":"code_execute","arguments":{"reset":True}}]}\n```', 'code_execute'],
    ['reasoning then block', '<think>I should search</think>\n```json\n{"tool_calls":[{"name":"deep_research","arguments":{"query":"y"}}]}\n```', 'deep_research'],
    ['bare no fence', 'sure: {"tool_calls":[{"name":"calculator","arguments":{"expression":"2+2"}}]}', 'calculator'],
    ['args as string', '```json\n{"tool_calls":[{"name":"translate","arguments":"{\\"text\\":\\"hi\\"}"}]}\n```', 'translate'],
    ['smart quotes', '```json\n{“tool_calls”:[{“name”:“ocr”,“arguments”:{}}]}\n```', 'ocr'],
    ['nemotron xml format', '<tool_call> <function=terminal_run> <parameter=command> cmd /c "cd /d C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Dramster && npm run build" </parameter> <parameter=timeout> 300000 </parameter> </function> </tool_call>', 'terminal_run'],
    ['claude invoke xml', '<invoke name="fs_read"><parameter name="path">src/app.js</parameter></invoke>', 'fs_read'],
    ['xml wrapped json', '<tool_call>\n{"name": "web_search", "arguments": {"query": "test"}}\n</tool_call>', 'web_search'],
    ['react action format', 'Action: terminal_run\nAction Input: {"command": "npm test"}', 'terminal_run'],
    ['bracketed pseudo tool call', '[Tool called: fs_file_tree for workspace exploration]', 'fs_file_tree'],
    ['bracketed tool call with args', '[Calling tool: fs_read path="src/index.js"]', 'fs_read'],
  ]
  for (const [label, reply, expected] of cases) {
    it(`parses: ${label}`, () => {
      const { calls } = parseToolCalls(reply)
      expect(calls[0]?.name).toBe(expected)
    })
  }

  it('correctly extracts arguments from nemotron XML format', () => {
    const reply = '<tool_call> <function=terminal_run> <parameter=command> cmd /c "cd /d C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Dramster && npm run build" </parameter> <parameter=timeout> 300000 </parameter> </function> </tool_call>'
    const { calls, text } = parseToolCalls(reply)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('terminal_run')
    expect(calls[0].parsedArgs.command).toContain('npm run build')
    expect(calls[0].parsedArgs.timeout).toBe(300000)
    expect(text).toBe('')
  })

  it('flags a malformed block for reprompt', () => {
    const { calls, malformed } = parseToolCalls('```json\n{"tool_calls":[{"name" "web_search"]}\n```')
    expect(calls).toHaveLength(0)
    expect(malformed).toBe(true)
  })

  it('plain prose is not malformed', () => {
    const { calls, malformed, text } = parseToolCalls('The capital of France is Paris.')
    expect(calls).toHaveLength(0)
    expect(malformed).toBe(false)
    expect(text).toMatch(/Paris/)
  })
})

// Query classification must stay stable — routing depends on it.
describe('query classification fixtures', () => {
  const cases = [
    ['fix the bug in my python function', 'code'],
    ['derive the quadratic formula step by step', 'reasoning'],
    ['write a blog post about cats', 'writing'],
    ['what time is it', 'quick'],
  ]
  for (const [q, expected] of cases) {
    it(`${q} → ${expected}`, () => expect(classifyQuery(q)).toBe(expected))
  }
})

describe('stripToolCallSyntax', () => {
  // OBSERVED: after the round cap, a nemotron turn's forced-final pass emitted
  // a raw tool call and the user saw it verbatim in the answer:
  //   <tool_call> <function=browser_control> <parameter=action> evaluate ...
  it('removes the exact markup that reached a user', () => {
    const leaked = 'The dev server is running on http://localhost:5176. Let me test the UI.\n\n' +
      '<tool_call> <function=browser_control> <parameter=action> evaluate </parameter> ' +
      '<parameter=expression> window.__errors || [] </parameter> ' +
      '<parameter=tabId> tab-1 </parameter> </function> </tool_call>'
    const out = stripToolCallSyntax(leaked)
    expect(out).not.toMatch(/tool_call|<function|<parameter/)
    expect(out).toContain('localhost:5176')
  })

  it('removes an UNCLOSED call — a truncated stream leaves a dangling tag', () => {
    // The old inline regexes required a closing tag, so a stream cut mid-call
    // rendered the whole tail as markup.
    expect(stripToolCallSyntax('Checking now.\n<tool_call> <function=browser_control> <parameter=action> read'))
      .toBe('Checking now.')
    expect(stripToolCallSyntax('Done.\n<function=fs_read><parameter=path>a.js'))
      .toBe('Done.')
  })

  it('removes provider-specific call markers', () => {
    expect(stripToolCallSyntax('Here you go.\n<|python_tag|>{"name":"x"}')).toBe('Here you go.')
    expect(stripToolCallSyntax('Sure.\n[TOOL_CALLS][{"name":"x"}]')).toBe('Sure.')
  })

  it('removes bare and fenced JSON tool calls so they never leak into prose', () => {
    const rawJson = 'Here is the result.\n{"tool_calls": [{"name": "fs_write", "arguments": {"path": "C:\\\\Users\\\\test.js"}}]}'
    expect(stripToolCallSyntax(rawJson)).toBe('Here is the result.')

    const fencedJson = 'Processing...\n```json\n{"tool_calls": [{"name": "fs_read", "arguments": {"path": "test.js"}}]}\n```'
    expect(stripToolCallSyntax(fencedJson)).toBe('Processing...')

    const onlyJson = '{"tool_calls": [{"name": "fs_write", "arguments": {"path": "C:\\\\file.txt"}}]}'
    expect(stripToolCallSyntax(onlyJson)).toBe('')
  })

  it('removes broken brace stutter and malformed tool attempts from reasoning models', () => {
    const broken = '{\n{\n{\n{\n{\n"tool{\n"{\nBased on the repository, OpenViking provides memory.'
    expect(stripToolCallSyntax(broken)).toBe('Based on the repository, OpenViking provides memory.')
  })

  it('leaves ordinary prose and code alone', () => {
    const prose = 'Use `<function>` in a type signature, and `a < b` compares numbers.'
    expect(stripToolCallSyntax(prose)).toBe(prose)
    expect(stripToolCallSyntax('')).toBe('')
    expect(stripToolCallSyntax(null)).toBe('')
  })
})

describe('Windows path tolerant tool-call parsing', () => {
  it('parses tool calls containing unescaped single backslashes in Windows file paths', () => {
    const raw = String.raw`{"tool_calls":[{"name":"fs_write","arguments":{"path":"C:\Users\project\Desktop\test.js","content":"console.log(1)"}}]}`
    const { calls } = parseToolCalls(raw)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('fs_write')
    expect(calls[0].parsedArgs.path).toContain('test.js')
  })
})
