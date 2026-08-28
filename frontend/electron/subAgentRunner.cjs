/**
 * Sub-Agent Runner — spawns isolated sub-agents with their own terminals and Python RPC
 * 
 * This runs in the Electron main process and manages:
 * - Isolated Node.js processes for sub-agents
 * - Python RPC servers for code execution
 * - IPC communication between main and sub-agents
 * - Terminal sessions per sub-agent
 */

const { ipcMain, app } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

// Active sub-agent processes
const subAgents = new Map()
const MAX_SUB_AGENTS = 8
const AGENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

function assertAgentId(agentId) {
  const id = String(agentId || '')
  if (!AGENT_ID_RE.test(id)) {
    throw new Error('agentId must be 1–64 characters using letters, numbers, underscores, or hyphens.')
  }
  return id
}

function agentWorkspace(agentId) {
  const dir = path.join(app.getPath('userData'), 'subagents', agentId, 'workspace')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Python RPC server template
const PYTHON_RPC_SERVER = `
import json
import sys
import traceback
import base64
import os

# Set up a persistent namespace for stateful execution
namespace = {}
workspace = os.path.abspath(os.environ.get('YOGATIK_SUBAGENT_WORKSPACE', os.getcwd()))

def safe_workspace_path(filename):
    # Files supplied through the UI are relative to this worker's private
    # workspace. A filename must never escape into the user's profile just
    # because it contains ../ or happens to be absolute.
    if not isinstance(filename, str) or not filename:
        raise ValueError('File name must be a non-empty relative path')
    target = os.path.abspath(os.path.join(workspace, filename))
    if os.path.commonpath([workspace, target]) != workspace:
        raise ValueError(f'File path escapes the sub-agent workspace: {filename}')
    return target

def execute(code, files=None):
    """Execute Python code in persistent namespace"""
    if files:
        for fname, content in files.items():
            target = safe_workspace_path(fname)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'w', encoding='utf-8') as f:
                f.write(content)
    
    # Capture stdout/stderr
    import io
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = io.StringIO()
    sys.stderr = io.StringIO()
    
    try:
        # Support top-level await
        if '\\n' in code and not code.strip().startswith('await'):
            # Check if code contains await at top level
            lines = code.split('\\n')
            has_await = any(line.strip().startswith('await ') for line in lines)
            if has_await:
                code = f'async def __async_main():\\n' + '\\n'.join('    ' + line for line in lines) + '\\n\\nimport asyncio\\nasyncio.run(__async_main())'
        
        exec(code, namespace)
        stdout = sys.stdout.getvalue()
        stderr = sys.stderr.getvalue()
        result = {'success': True, 'stdout': stdout, 'stderr': stderr, 'namespace_keys': list(namespace.keys())}
    except Exception as e:
        stdout = sys.stdout.getvalue()
        stderr = sys.stderr.getvalue()
        result = {'success': False, 'stdout': stdout, 'stderr': stderr, 'error': traceback.format_exc()}
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr
    
    return result

def install_packages(packages):
    """Install packages into the active CPython environment."""
    try:
        import subprocess
        if not isinstance(packages, list) or not packages:
            return {'success': False, 'error': 'Provide at least one package name'}
        clean = []
        for package in packages:
            if not isinstance(package, str) or not package.strip() or package.startswith('-'):
                return {'success': False, 'error': f'Invalid package name: {package!r}'}
            clean.append(package.strip())
        completed = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check', '--no-input', *clean],
            cwd=workspace, text=True, capture_output=True, timeout=120,
        )
        if completed.returncode != 0:
            return {'success': False, 'error': completed.stderr[-4000:] or completed.stdout[-4000:] or 'pip install failed'}
        return {'success': True, 'installed': clean, 'output': completed.stdout[-4000:]}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def reset_namespace():
    """Clear the persistent namespace"""
    global namespace
    namespace = {}
    return {'success': True, 'message': 'Namespace reset'}

def get_namespace():
    """Get current namespace keys and types"""
    return {'success': True, 'workspace': workspace, 'keys': {k: str(type(v)) for k, v in namespace.items() if not k.startswith('__')}}

# Main loop - read JSON commands from stdin, write JSON responses to stdout
print(json.dumps({'ready': True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        cmd = json.loads(line)
        action = cmd.get('action')
        request_id = cmd.get('id')
        
        if action == 'execute':
            result = execute(cmd.get('code', ''), cmd.get('files'))
        elif action == 'install':
            result = install_packages(cmd.get('packages', []))
        elif action == 'reset':
            result = reset_namespace()
        elif action == 'namespace':
            result = get_namespace()
        elif action == 'ping':
            result = {'success': True, 'pong': True}
        else:
            result = {'success': False, 'error': f'Unknown action: {action}'}
        
        result['id'] = request_id
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({'id': cmd.get('id') if 'cmd' in locals() else None, 'success': False, 'error': str(e)}), flush=True)
`

function createPythonRpcServer(agentId) {
  const serverPath = path.join(app.getPath('userData'), 'subagents', agentId, 'python_rpc.py')
  fs.mkdirSync(path.dirname(serverPath), { recursive: true })
  fs.writeFileSync(serverPath, PYTHON_RPC_SERVER)
  return serverPath
}

/**
 * Spawn a new sub-agent process
 */
function spawnSubAgent(agentId, config) {
  return new Promise((resolve, reject) => {
    const id = assertAgentId(agentId)
    if (subAgents.has(id)) return reject(new Error(`A sub-agent named "${id}" already exists.`))
    if (subAgents.size >= MAX_SUB_AGENTS) return reject(new Error(`At most ${MAX_SUB_AGENTS} sub-agents may run at once.`))
    // Create Python RPC server
    const pythonServerPath = createPythonRpcServer(id)
    const workspace = agentWorkspace(id)
    
    // Spawn Python process for code execution
    const pythonExecutable = process.env.YOGATIK_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3')
    const pythonProc = spawn(pythonExecutable, ['-u', pythonServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: workspace,
      windowsHide: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1', YOGATIK_SUBAGENT_WORKSPACE: workspace }
    })
    
    let pythonReady = false
    const pendingPythonRequests = new Map()
    let pythonRequestId = 0
    
    pythonProc.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (!line) continue
        try {
          const response = JSON.parse(line)
          if (response.ready) {
            pythonReady = true
            continue
          }
          const { id, ...result } = response
          const pending = pendingPythonRequests.get(id)
          if (pending) {
            pendingPythonRequests.delete(id)
            pending.resolve(result)
          }
        } catch (e) {
          console.error('[SubAgent] Python RPC parse error:', e, line)
        }
      }
    })
    
    pythonProc.stderr.on('data', (data) => {
      console.error('[SubAgent] Python stderr:', data.toString())
    })
    
    pythonProc.on('error', (err) => {
      console.error('[SubAgent] Python process error:', err)
      if (!pythonReady) reject(new Error(`Unable to start Python (${pythonExecutable}): ${err.message}`))
    })
    
    pythonProc.on('exit', (code) => {
      console.log('[SubAgent] Python process exited:', code)
      if (!pythonReady) reject(new Error(`Python worker exited before it was ready (exit code ${code}).`))
      // Reject all pending requests
      for (const [, pending] of pendingPythonRequests) {
        pending.reject(new Error('Python process exited'))
      }
      pendingPythonRequests.clear()
    })
    
    // Python RPC client
    const requestPython = (action, payload = {}, timeout = 60000) => new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error('Python RPC not ready'))
        const id = ++pythonRequestId
        pendingPythonRequests.set(id, { resolve, reject })
        pythonProc.stdin.write(JSON.stringify({ id, action, ...payload }) + '\n')
        setTimeout(() => {
          if (pendingPythonRequests.has(id)) {
            pendingPythonRequests.delete(id)
            reject(new Error(`Python ${action} timeout`))
          }
        }, timeout)
      })

    const pythonRpc = {
      execute: (code, files) => requestPython('execute', { code, files }),
      install: (packages) => requestPython('install', { packages }, 130000),
      reset: () => requestPython('reset'),
      namespace: () => requestPython('namespace'),
      kill: () => {
        try { pythonProc.kill() } catch { /* already stopped */ }
      }
    }
    
    // Wait for Python to be ready
    const readyTimeout = setTimeout(() => {
      reject(new Error('Python RPC server failed to start'))
    }, 10000)
    
    const checkReady = setInterval(() => {
      if (pythonReady) {
        clearInterval(checkReady)
        clearTimeout(readyTimeout)
        
        // Create sub-agent object
        const subAgent = {
          id,
          config,
          pythonProc,
          pythonRpc,
          pythonServerPath,
          workspace,
          createdAt: Date.now(),
          status: 'ready',
          messageCount: 0
        }
        
        subAgents.set(agentId, subAgent)
        resolve(subAgent)
      }
    }, 100)
  })
}

/**
 * Execute a task in a sub-agent
 */
async function executeInSubAgent(agentId, task, options = {}) {
  const subAgent = subAgents.get(agentId)
  if (!subAgent) throw new Error(`Sub-agent not found: ${agentId}`)
  
  subAgent.status = 'working'
  subAgent.messageCount++
  
  try {
    // This runner owns a real isolated Python workspace, not an LLM provider.
    // The old implementation spawned a timer-based child that *pretended* a
    // natural-language task had completed. Real AI delegation is provided by
    // the renderer's spawn_agents / crew_orchestrator tools, which have the
    // active provider, model, tool policy, and streaming context.
    const pythonCode = options?.pythonCode ?? options?.python_code
    if (typeof pythonCode !== 'string' || !pythonCode.trim()) {
      throw new Error('This is an isolated Python worker, not an AI model runner. Use spawn_agents or crew_orchestrator for natural-language sub-agent tasks; use pythonCode here for durable isolated computation.')
    }
    const result = await subAgent.pythonRpc.execute(pythonCode, options?.files || {})
    subAgent.status = 'ready'
    return { success: !!result?.success, mode: 'python', task: String(task || ''), ...result }
  } catch (e) {
    subAgent.status = 'error'
    subAgent.lastError = e.message
    throw e
  }
}

/**
 * Run agent in a completely isolated Node.js process
 * This provides true isolation with separate memory, terminal, etc.
 */
function runAgentInSubProcess(subAgent, task, options) {
  return new Promise((resolve, reject) => {
    // Create a script that runs the agent loop
    const scriptPath = path.join(app.getPath('userData'), `subagent_${subAgent.id}_runner.js`)
    
    const runnerScript = `
const { spawn } = require('child_process');
const path = require('path');

// This would be a full agent implementation
// For now, we communicate back via IPC

const task = ${JSON.stringify(task)};
const options = ${JSON.stringify(options)};

// Send progress back to main process
function sendProgress(data) {
  process.send({ type: 'progress', agentId: '${subAgent.id}', data });
}

function sendResult(result) {
  process.send({ type: 'result', agentId: '${subAgent.id}', result });
}

function sendError(error) {
  process.send({ type: 'error', agentId: '${subAgent.id}', error: error.message });
}

// Simulate agent work
console.log('Sub-agent starting task:', task);

setTimeout(() => {
  sendProgress({ message: 'Analyzing task...' });
}, 100);

setTimeout(() => {
  sendProgress({ message: 'Executing...' });
}, 500);

setTimeout(() => {
  sendResult({ 
    success: true, 
    output: \`Sub-agent completed: \${task}\`,
    toolsUsed: []
  });
}, 1000);
`
    
    fs.writeFileSync(scriptPath, runnerScript)
    
    // Spawn isolated Node.js process
    const proc = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { 
        ...process.env,
        NODE_ENV: 'production'
      }
    })
    
    let output = ''
    let completed = false
    
    proc.on('message', (msg) => {
      if (msg.agentId !== subAgent.id) return
      
      switch (msg.type) {
        case 'progress':
          // Could emit to renderer via IPC
          console.log('[SubAgent] Progress:', msg.data)
          break
        case 'result':
          completed = true
          proc.kill()
          resolve(msg.result)
          break
        case 'error':
          completed = true
          proc.kill()
          reject(new Error(msg.error))
          break
      }
    })
    
    proc.stdout.on('data', (data) => {
      output += data.toString()
    })
    
    proc.stderr.on('data', (data) => {
      console.error('[SubAgent] stderr:', data.toString())
    })
    
    proc.on('exit', (code) => {
      if (!completed) {
        if (code === 0) {
          resolve({ success: true, output })
        } else {
          reject(new Error(`Sub-agent exited with code ${code}: ${output}`))
        }
      }
      
      // Clean up script
      try { fs.unlinkSync(scriptPath) } catch {}
    })
    
    // Timeout after 5 minutes
    setTimeout(() => {
      if (!completed) {
        proc.kill()
        reject(new Error('Sub-agent timeout'))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Get sub-agent status
 */
function getSubAgentStatus(agentId) {
  const subAgent = subAgents.get(agentId)
  if (!subAgent) return null
  
  return {
    id: subAgent.id,
    status: subAgent.status,
    messageCount: subAgent.messageCount,
    createdAt: subAgent.createdAt,
    lastError: subAgent.lastError,
    workspace: subAgent.workspace,
    config: subAgent.config
  }
}

/**
 * List all sub-agents
 */
function listSubAgents() {
  const agents = []
  for (const [id, agent] of subAgents) {
    agents.push(getSubAgentStatus(id))
  }
  return agents
}

/**
 * Kill a sub-agent
 */
function killSubAgent(agentId) {
  const subAgent = subAgents.get(agentId)
  if (!subAgent) return false
  
  subAgent.pythonRpc.kill()
  try { fs.rmSync(subAgent.pythonServerPath, { force: true }) } catch { /* best effort */ }
  subAgents.delete(agentId)
  return true
}

/**
 * Kill all sub-agents
 */
function killAllSubAgents() {
  for (const [id, agent] of subAgents) {
    agent.pythonRpc.kill()
  }
  subAgents.clear()
}

// IPC Handlers for renderer
function registerSubAgentIPC() {
  // Spawn sub-agent
  ipcMain.handle('subagent:spawn', async (_e, { agentId, config }) => {
    try {
      const agent = await spawnSubAgent(agentId, config)
      return { success: true, agent: getSubAgentStatus(agentId) }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  // Execute task in sub-agent
  ipcMain.handle('subagent:execute', async (_e, { agentId, task, options }) => {
    try {
      const result = await executeInSubAgent(agentId, task, options)
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  // Get status
  ipcMain.handle('subagent:status', (_e, agentId) => {
    const status = getSubAgentStatus(agentId)
    return { success: true, status }
  })
  
  // List all
  ipcMain.handle('subagent:list', () => {
    return { success: true, agents: listSubAgents() }
  })
  
  // Kill
  ipcMain.handle('subagent:kill', (_e, agentId) => {
    const success = killSubAgent(agentId)
    return { success }
  })
  
  // Python RPC direct access
  ipcMain.handle('subagent:python:execute', async (_e, { agentId, code, files }) => {
    const subAgent = subAgents.get(agentId)
    if (!subAgent) return { success: false, error: 'Sub-agent not found' }
    try {
      const result = await subAgent.pythonRpc.execute(code, files)
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  ipcMain.handle('subagent:python:install', async (_e, { agentId, packages }) => {
    const subAgent = subAgents.get(agentId)
    if (!subAgent) return { success: false, error: 'Sub-agent not found' }
    try {
      const result = await subAgent.pythonRpc.install(packages)
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  ipcMain.handle('subagent:python:reset', async (_e, agentId) => {
    const subAgent = subAgents.get(agentId)
    if (!subAgent) return { success: false, error: 'Sub-agent not found' }
    try {
      const result = await subAgent.pythonRpc.reset()
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
  
  ipcMain.handle('subagent:python:namespace', async (_e, agentId) => {
    const subAgent = subAgents.get(agentId)
    if (!subAgent) return { success: false, error: 'Sub-agent not found' }
    try {
      const result = await subAgent.pythonRpc.namespace()
      return { success: true, result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

// Cleanup on app quit
app.on('before-quit', () => {
  killAllSubAgents()
})

module.exports = {
  spawnSubAgent,
  executeInSubAgent,
  getSubAgentStatus,
  listSubAgents,
  killSubAgent,
  killAllSubAgents,
  registerSubAgentIPC
}
