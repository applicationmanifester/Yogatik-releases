#!/usr/bin/env node
/**
 * Yogatik CLI — OpenCode-compatible terminal interface
 * 
 * Usage:
 *   yogatik "fix the login bug"
 *   yogatik --model gpt-4 --file src/auth.ts "add tests"
 *   yogatik --cwd ./my-project "refactor the API layer"
 *   yogatik --headless --model claude-3 "generate README"
 */

import { program } from 'commander'
import { fileURLToPath } from 'url'
import { dirname, resolve, join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { open } from 'open'
import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface YogatikConfig {
  model?: string
  tools?: string[]
  rules?: string
  workingDir?: string
  headless?: boolean
  autoApprove?: boolean
}

interface CLIOptions {
  model?: string
  file?: string[]
  cwd?: string
  headless?: boolean
  config?: string
  autoApprove?: boolean
  version?: boolean
}

function loadConfig(cwd: string): YogatikConfig {
  const configPath = join(cwd, '.yogatik', 'config.json')
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      console.warn(chalk.yellow('Warning: Failed to parse .yogatik/config.json'))
    }
  }
  return {}
}

function saveConfig(cwd: string, config: YogatikConfig): void {
  const configDir = join(cwd, '.yogatik')
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  const configPath = join(configDir, 'config.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))
}

function buildDeepLink(options: CLIOptions & { prompt: string }): string {
  const params = new URLSearchParams()
  params.set('prompt', options.prompt)
  if (options.cwd) params.set('cwd', resolve(options.cwd))
  if (options.model) params.set('model', options.model)
  if (options.file?.length) params.set('files', options.file.join(','))
  if (options.headless) params.set('headless', 'true')
  if (options.autoApprove) params.set('autoApprove', 'true')
  return `yogatik://send-prompt?${params.toString()}`
}

async function launchHeadless(options: CLIOptions & { prompt: string }): Promise<string> {
  // Use the existing Electron app's headless IPC
  const { spawn } = await import('child_process')
  const electronPath = process.platform === 'win32' 
    ? 'yogatik.exe' 
    : 'yogatik'
  
  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      `--prompt=${options.prompt}`,
      `--model=${options.model || ''}`,
      `--cwd=${options.cwd || process.cwd()}`
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    
    let output = ''
    child.stdout.on('data', (data) => {
      output += data.toString()
    })
    child.stderr.on('data', (data) => {
      console.error(chalk.red(data.toString()))
    })
    child.on('close', (code) => {
      if (code === 0) resolve(output.trim())
      else reject(new Error(`Headless process exited with code ${code}`))
    })
    child.on('error', reject)
  })
}

async function main() {
  program
    .name('yogatik')
    .description('Yogatik AI — OpenCode-compatible coding agent')
    .version('10.10.0')
    .argument('[prompt]', 'Prompt to send to the agent')
    .option('-m, --model <model>', 'Model to use (e.g., gpt-4, claude-3, gemini-pro)')
    .option('-f, --file <file...>', 'Files to include in context')
    .option('-c, --cwd <dir>', 'Working directory', process.cwd())
    .option('--headless', 'Run in headless mode (no UI)')
    .option('--auto-approve', 'Auto-approve all tool calls')
    .option('--config <path>', 'Path to config file')
    .option('--init', 'Initialize .yogatik/config.json in current directory')
    .option('--tui', 'Launch Terminal UI mode')
    .action(async (prompt: string | undefined, options: CLIOptions) => {
      const cwd = resolve(options.cwd || process.cwd())
      const config = loadConfig(cwd)
      
      // Merge config with CLI options (CLI wins)
      const mergedConfig: YogatikConfig = {
        ...config,
        ...(options.model && { model: options.model }),
        ...(options.headless && { headless: options.headless }),
        ...(options.autoApprove && { autoApprove: options.autoApprove }),
      }
      
      if (options.init) {
        saveConfig(cwd, {
          model: 'gpt-4',
          tools: ['fs_read', 'fs_write', 'fs_edit', 'fs_search', 'terminal_run', 'git_status'],
          rules: 'Follow AGENTS.md in repo root if present.',
          workingDir: '.',
        })
        console.log(chalk.green('✓ Created .yogatik/config.json'))
        return
      }
      
      if (options.tui) {
        console.log(chalk.cyan('Starting TUI mode...'))
        // Launch Electron with TUI flag
        const { spawn } = await import('child_process')
        const electronPath = process.platform === 'win32' ? 'yogatik.exe' : 'yogatik'
        const child = spawn(electronPath, ['--tui'], {
          stdio: 'inherit',
          cwd
        })
        child.on('close', (code) => process.exit(code || 0))
        return
      }
      
      if (!prompt) {
        program.help()
        return
      }
      
      // Build full prompt with file context if specified
      let fullPrompt = prompt
      if (options.file?.length) {
        const fileContents = options.file.map(f => {
          const fp = resolve(cwd, f)
          if (existsSync(fp)) {
            return `\n--- FILE: ${f} ---\n${readFileSync(fp, 'utf-8')}`
          }
          return `\n--- FILE: ${f} (NOT FOUND) ---`
        }).join('')
        fullPrompt = `${prompt}\n\nContext files:${fileContents}`
      }
      
      if (options.headless || mergedConfig.headless) {
        console.log(chalk.gray('Running in headless mode...'))
        try {
          const result = await launchHeadless({ ...options, prompt: fullPrompt })
          console.log(result)
        } catch (err) {
          console.error(chalk.red('Headless execution failed:'), err)
          process.exit(1)
        }
        return
      }
      
      // Default: open deep link to running Yogatik instance
      const url = buildDeepLink({ ...options, prompt: fullPrompt })
      console.log(chalk.cyan('Opening Yogatik...'))
      try {
        await open(url)
        console.log(chalk.green('✓ Prompt sent to Yogatik'))
      } catch (err) {
        console.error(chalk.red('Failed to open Yogatik. Is it installed?'))
        console.log(chalk.gray('Deep link:'), url)
        process.exit(1)
      }
    })
  
  program.parse()
}

main().catch(err => {
  console.error(chalk.red('Error:'), err.message)
  process.exit(1)
})