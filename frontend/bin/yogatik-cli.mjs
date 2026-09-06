#!/usr/bin/env node

/**
 * Yogatik Terminal CLI — Interactive TUI Assistant for Antigravity & Terminal
 * Works natively with local Ollama, Groq, Gemini, and OpenRouter.
 */

import readline from 'node:readline'
import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WORKSPACE_DIR = process.cwd()

// ANSI Color Codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  // Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  orange: '\x1b[38;5;208m',
  emerald: '\x1b[38;5;42m',
  violet: '\x1b[38;5;135m',
  gray: '\x1b[38;5;244m',
  lightGray: '\x1b[38;5;250m',
  
  // Backgrounds
  bgDark: '\x1b[48;5;234m',
  bgCard: '\x1b[48;5;236m',
  bgHighlight: '\x1b[48;5;238m',
}

// Banner Art
const BANNER = `
  ${C.orange}██╗   ██╗ ██████╗  ██████╗  █████╗ ████████╗██╗██╗  ██╗${C.reset}
  ${C.orange}╚██╗ ██╔╝██╔═══██╗██╔════╝ ██╔══██╗╚══██╔══╝██║██║ ██╔╝${C.reset}
   ${C.orange}╚████╔╝ ██║   ██║██║  ███╗███████║   ██║   ██║█████╔╝ ${C.reset}
    ${C.orange}╚██╔╝  ██║   ██║██║   ██║██╔══██║   ██║   ██║██╔═██╗ ${C.reset}
     ${C.orange}██║   ╚██████╔╝╚██████╔╝██║  ██║   ██║   ██║██║  ██╗${C.reset}
     ${C.orange}╚═╝    ╚═════╝  ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝╚═╝  ╚═╝${C.reset}
`

// State
let activeProvider = 'ollama'
let activeModel = 'qwen2.5-coder:7b'
let availableOllamaModels = []
let conversationHistory = []

// Get git branch safely
function getGitBranch() {
  try {
    const out = execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    return out.toString().trim()
  } catch {
    return 'local'
  }
}

// Detect Ollama models
async function detectOllama() {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })
    if (res.ok) {
      const data = await res.json()
      availableOllamaModels = (data.models || []).map(m => m.name)
      if (availableOllamaModels.length > 0) {
        // Preferred coder models
        const pref = availableOllamaModels.find(m => m.includes('qwen') || m.includes('coder'))
          || availableOllamaModels.find(m => m.includes('llama3'))
          || availableOllamaModels[0]
        activeModel = pref
        activeProvider = 'ollama'
        return true
      }
    }
  } catch {}
  return false
}

// Print Header UI
function renderHeader() {
  console.clear()
  console.log(BANNER)
  const branch = getGitBranch()
  const relPath = path.basename(WORKSPACE_DIR)
  
  console.log(`  ${C.bold}${C.white}Yogatik Terminal Studio${C.reset} ${C.gray}v7.3.0 · Built for Antigravity & Local Workspaces${C.reset}`)
  console.log(`  ${C.gray}─`.repeat(68) + C.reset)
  console.log(`  ${C.emerald}●${C.reset} ${C.bold}Engine:${C.reset} ${C.cyan}${activeModel}${C.reset} ${C.gray}(${activeProvider.toUpperCase()})${C.reset}  │  ${C.bold}Workspace:${C.reset} ${C.lightGray}${relPath}${C.reset} ${C.gray}(git: ${branch})${C.reset}`)
  console.log(`  ${C.gray}Type a question or task, or use:${C.reset} ${C.yellow}/help${C.reset} · ${C.yellow}/model${C.reset} · ${C.yellow}/git${C.reset} · ${C.yellow}/files${C.reset} · ${C.yellow}/run${C.reset} · ${C.yellow}/clear${C.reset}`)
  console.log(`  ${C.gray}─`.repeat(68) + C.reset)
  console.log('')
}

// Print help
function printHelp() {
  console.log(`\n  ${C.bold}${C.white}⚡ Yogatik Terminal Commands:${C.reset}`)
  console.log(`    ${C.yellow}/help${C.reset}            Show this command guide`)
  console.log(`    ${C.yellow}/model${C.reset}           Switch between local Ollama models or API providers`)
  console.log(`    ${C.yellow}/files [filter]${C.reset}  List files in the workspace (e.g. /files src)`)
  console.log(`    ${C.yellow}/read <file>${C.reset}     Quick preview of a local file`)
  console.log(`    ${C.yellow}/git${C.reset}             Show git status and active branch diff summary`)
  console.log(`    ${C.yellow}/run <command>${C.reset}   Execute terminal command directly from Yogatik`)
  console.log(`    ${C.yellow}/calc <math>${C.reset}     Run Yogatik built-in mathematical evaluator`)
  console.log(`    ${C.yellow}/clear${C.reset}           Clear terminal screen and reset view`)
  console.log(`    ${C.yellow}/exit${C.reset}            Quit Yogatik CLI\n`)
}

// List workspace files
function listWorkspaceFiles(filter = '') {
  try {
    const files = []
    function walk(dir, depth = 0) {
      if (depth > 4) return
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') continue
        const full = path.join(dir, e.name)
        const rel = path.relative(WORKSPACE_DIR, full)
        if (e.isDirectory()) {
          walk(full, depth + 1)
        } else {
          if (!filter || rel.toLowerCase().includes(filter.toLowerCase())) {
            files.push(rel)
          }
        }
      }
    }
    walk(WORKSPACE_DIR)
    console.log(`\n  ${C.bold}📁 Workspace Files (${files.length} found):${C.reset}`)
    files.slice(0, 30).forEach(f => console.log(`    ${C.cyan}${f}${C.reset}`))
    if (files.length > 30) console.log(`    ${C.gray}...and ${files.length - 30} more${C.reset}`)
    console.log('')
  } catch (err) {
    console.log(`  ${C.red}Failed to list files: ${err.message}${C.reset}\n`)
  }
}

// Preview file
function readFilePreview(filePath) {
  try {
    const target = path.resolve(WORKSPACE_DIR, filePath.trim())
    if (!fs.existsSync(target)) {
      console.log(`  ${C.red}File not found: ${filePath}${C.reset}\n`)
      return
    }
    const content = fs.readFileSync(target, 'utf8')
    console.log(`\n  ${C.bold}📄 File: ${filePath} (${content.length} chars)${C.reset}`)
    console.log(`  ${C.gray}─`.repeat(50) + C.reset)
    const lines = content.split('\n')
    lines.slice(0, 40).forEach((l, i) => {
      console.log(`  ${C.gray}${(i + 1).toString().padStart(3)} │${C.reset} ${l}`)
    })
    if (lines.length > 40) console.log(`  ${C.gray}...[${lines.length - 40} lines truncated]...${C.reset}`)
    console.log(`  ${C.gray}─`.repeat(50) + C.reset + '\n')
  } catch (err) {
    console.log(`  ${C.red}Error reading file: ${err.message}${C.reset}\n`)
  }
}

// Show git status
function showGit() {
  try {
    const status = execSync('git status -s', { encoding: 'utf8' })
    const branch = getGitBranch()
    console.log(`\n  ${C.bold}🌿 Git Status (${branch}):${C.reset}`)
    if (!status.trim()) {
      console.log(`    ${C.emerald}✓ Working tree is clean${C.reset}\n`)
    } else {
      console.log(status.trim().split('\n').map(l => `    ${l}`).join('\n'))
      console.log('')
    }
  } catch (err) {
    console.log(`  ${C.red}Git command failed: ${err.message}${C.reset}\n`)
  }
}

// Execute local command
function runCommand(cmd) {
  if (!cmd.trim()) {
    console.log(`  ${C.yellow}Usage: /run <command>${C.reset}\n`)
    return
  }
  console.log(`\n  ${C.bold}⚡ Executing:${C.reset} ${C.cyan}${cmd}${C.reset}`)
  try {
    execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_DIR })
    console.log(`  ${C.emerald}✓ Command finished${C.reset}\n`)
  } catch (err) {
    console.log(`  ${C.red}Command failed with exit code ${err.status || 1}${C.reset}\n`)
  }
}

// Stream query to Ollama
async function streamOllama(prompt) {
  conversationHistory.push({ role: 'user', content: prompt })
  const url = 'http://127.0.0.1:11434/api/chat'
  
  process.stdout.write(`\n  ${C.orange}⚡ Yogatik:${C.reset} `)
  
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        messages: [
          {
            role: 'system',
            content: `You are Yogatik, a helpful, precise agentic AI assistant running in Antigravity IDE terminal on Windows. You provide direct, expert programming and analytical responses. Keep explanations sharp and code clean.`
          },
          ...conversationHistory.slice(-8)
        ],
        stream: true,
      })
    })

    if (!res.ok || !res.body) {
      console.log(`${C.red}Ollama error: ${res.statusText}${C.reset}\n`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder('utf8')
    let fullReply = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          const chunk = parsed.message?.content || ''
          fullReply += chunk
          process.stdout.write(chunk)
        } catch {}
      }
    }
    console.log('\n')
    conversationHistory.push({ role: 'assistant', content: fullReply })
  } catch (err) {
    console.log(`\n  ${C.red}Connection error: ${err.message}. Is Ollama running on http://127.0.0.1:11434?${C.reset}\n`)
  }
}

// Stream query to Cloud (Groq / Gemini fallback if chosen)
async function streamCloud(prompt) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.log(`\n  ${C.yellow}No API key found in environment for cloud provider.${C.reset}`)
    console.log(`  Set GROQ_API_KEY, GEMINI_API_KEY, or switch back to local Ollama with /model.\n`)
    return
  }

  process.stdout.write(`\n  ${C.orange}⚡ Yogatik (${activeProvider}):${C.reset} `)
  // Simple Groq / OpenAI compatible endpoint
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are Yogatik, a concise AI assistant in Antigravity IDE.' },
          { role: 'user', content: prompt }
        ],
        stream: true
      })
    })

    if (!res.ok) {
      console.log(`${C.red}API Error: ${res.statusText}${C.reset}\n`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const str = decoder.decode(value)
      const lines = str.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.slice(6))
            const text = data.choices?.[0]?.delta?.content || ''
            process.stdout.write(text)
          } catch {}
        }
      }
    }
    console.log('\n')
  } catch (err) {
    console.log(`\n  ${C.red}Cloud request failed: ${err.message}${C.reset}\n`)
  }
}

// Main Interactive Loop
async function main() {
  const ollamaOnline = await detectOllama()
  renderHeader()

  if (ollamaOnline) {
    console.log(`  ${C.emerald}✓ Connected to Ollama local daemon${C.reset} ${C.gray}(${availableOllamaModels.length} models detected)${C.reset}\n`)
  } else {
    console.log(`  ${C.yellow}⚠ Ollama not detected on port 11434.${C.reset} ${C.gray}Start Ollama or set GROQ_API_KEY / GEMINI_API_KEY.${C.reset}\n`)
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `  ${C.cyan}yogatik > ${C.reset}`,
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) {
      rl.prompt()
      return
    }

    // Handle Slash Commands
    if (input === '/help' || input === '/?') {
      printHelp()
    } else if (input === '/clear' || input === '/cls') {
      renderHeader()
    } else if (input === '/exit' || input === '/quit') {
      console.log(`\n  ${C.orange}Goodbye! Have a great coding session in Antigravity.${C.reset}\n`)
      process.exit(0)
    } else if (input.startsWith('/files')) {
      const filter = input.replace('/files', '').trim()
      listWorkspaceFiles(filter)
    } else if (input.startsWith('/read ')) {
      const file = input.replace('/read', '').trim()
      readFilePreview(file)
    } else if (input === '/git') {
      showGit()
    } else if (input.startsWith('/run ')) {
      const cmd = input.slice(5)
      runCommand(cmd)
    } else if (input.startsWith('/calc ')) {
      const expr = input.slice(6)
      try {
        // Safe math evaluation
        const clean = expr.replace(/[^0-9+\-*/().%^ ]/g, '')
        const val = Function(`"use strict"; return (${clean})`)()
        console.log(`\n  ${C.emerald}Result:${C.reset} ${C.bold}${val}${C.reset}\n`)
      } catch (e) {
        console.log(`  ${C.red}Invalid math expression${C.reset}\n`)
      }
    } else if (input === '/model') {
      console.log(`\n  ${C.bold}Available Models & Engines:${C.reset}`)
      availableOllamaModels.forEach((m, i) => {
        const isCur = m === activeModel ? `${C.emerald}* [ACTIVE]${C.reset}` : ' '
        console.log(`    ${C.cyan}${i + 1}.${C.reset} ${m} (Ollama Local) ${isCur}`)
      })
      console.log(`    ${C.yellow}g.${C.reset} Groq (Cloud - Llama 3.3 70B)`)
      console.log(`  ${C.gray}To select, type: /model <name_or_number>${C.reset}\n`)
    } else if (input.startsWith('/model ')) {
      const target = input.slice(7).trim()
      const num = parseInt(target, 10)
      if (!isNaN(num) && availableOllamaModels[num - 1]) {
        activeModel = availableOllamaModels[num - 1]
        activeProvider = 'ollama'
        console.log(`  ${C.emerald}✓ Switched to ${activeModel}${C.reset}\n`)
      } else if (target.toLowerCase() === 'groq' || target.toLowerCase() === 'g') {
        activeProvider = 'groq'
        activeModel = 'llama-3.3-70b-versatile'
        console.log(`  ${C.emerald}✓ Switched to Groq (Cloud)${C.reset}\n`)
      } else if (availableOllamaModels.includes(target)) {
        activeModel = target
        activeProvider = 'ollama'
        console.log(`  ${C.emerald}✓ Switched to ${activeModel}${C.reset}\n`)
      } else {
        console.log(`  ${C.red}Unknown model: ${target}${C.reset}\n`)
      }
    } else {
      // Stream conversation
      if (activeProvider === 'ollama') {
        await streamOllama(input)
      } else {
        await streamCloud(input)
      }
    }

    rl.prompt()
  })

  rl.on('close', () => {
    console.log(`\n  ${C.orange}Exited Yogatik Terminal.${C.reset}\n`)
    process.exit(0)
  })
}

main()
