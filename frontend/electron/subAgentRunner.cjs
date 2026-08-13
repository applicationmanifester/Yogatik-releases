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

// Python RPC server template
const PYTHON_RPC_SERVER = `
import json
import sys
import traceback
import base64
import os

# Set up a persistent namespace for stateful execution
namespace = {}

def execute(code, files=None):
    """Execute Python code in persistent namespace"""
    if files:
        for fname, content in files.items():
            with open(fname, 'w') as f:
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
    """Install packages via micropip"""
    try:
        import micropip
        import asyncio
        asyncio.run(micropip.install(packages))
        return {'success': True, 'installed': packages}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def reset_namespace():
    """Clear the persistent namespace"""
    global namespace
    namespace = {}
    return {'success': True, 'message': 'Namespace reset'}

def get_namespace():
    """Get current namespace keys and types"""
    return {'success': True, 'keys': {k: str(type(v)) for k, v in namespace.items()}}

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
  const serverPath = path.join(app.getPath('userData'), `subagent_${agentId}_python_rpc.py`)
  fs.writeFileSync(serverPath, PYTHON_RPC_SERVER)
  return serverPath
}

/**
 * Spawn a new sub-agent process
 */
function spawnSubAgent(agentId, config) {
  return new Promise((resolve, reject) => {
    // Create Python RPC server
    const pythonServerPath = createPythonRpcServer(agentId)
    
    // Spawn Python process for code execution
    const pythonProc = spawn('python3', ['-u', pythonServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
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
    })
    
    pythonProc.on('exit', (code) => {
      console.log('[SubAgent] Python process exited:', code)
      // Reject all pending requests
      for (const [, pending] of pendingPythonRequests) {
        pending.reject(new Error('Python process exited'))
      }
      pendingPythonRequests.clear()
    })
    
    // Python RPC client
    const pythonRpc = {
      execute: (code, files) => new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error('Python RPC not ready'))
        const id = ++pythonRequestId
        pendingPythonRequests.set(id, { resolve, reject })
        pythonProc.stdin.write(JSON.stringify({ id, action: 'execute', code, files }) + '\n')
        // Timeout after 60 seconds
        setTimeout(() => {
          if (pendingPythonRequests.has(id)) {
            pendingPythonRequests.delete(id)
            reject(new Error('Python execution timeout'))
          }
        }, 60000)
      }),
      install: (packages) => new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error('Python RPC not ready'))
        const id = ++pythonRequestId
        pendingPythonRequests.set(id, { resolve, reject })
        pythonProc.stdin.write(JSON.stringify({ id, action: 'install', packages }) + '\n')
        setTimeout(() => {
          if (pendingPythonRequests.has(id)) {
            pendingPythonRequests.delete(id)
            reject(new Error('Package install timeout'))
          }
        }, 120000)
      }),
      reset: () => new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error('Python RPC not ready'))
        const id = ++pythonRequestId
        pendingPythonRequests.set(id, { resolve, reject })
        pythonProc.stdin.write(JSON.stringify({ id, action: 'reset' }) + '\n')
      }),
      namespace: () => new Promise((resolve, reject) => {
        if (!pythonReady) return reject(new Error('Python RPC not ready'))
        const id = ++pythonRequestId
        pendingPythonRequests.set(id, { resolve, reject })
        pythonProc.stdin.write(JSON.stringify({ id, action: 'namespace' }) + '\n')
      }),
      kill: () => {
        pythonProc.kill()
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
          id: agentId,
          config,
          pythonProc,
          pythonRpc,
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
    // For now, we use the existing streamMessage from the renderer
    // In the future, this could run a completely isolated agent loop
    const result = await runAgentInSubProcess(subAgent, task, options)
    subAgent.status = 'ready'
    return result
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