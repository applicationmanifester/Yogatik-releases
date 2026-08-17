// Example plugin in JavaScript (for demonstration)
// In production, this would be compiled from Rust/C++ to WASM

export interface PluginExports {
  on_load: (context: any) => void;
  on_unload: (context: any) => void;
  command: (args: string[], context: any) => Promise<void>;
  terminal_data: (sessionId: string, data: Uint8Array, context: any) => void;
}

const plugin: PluginExports = {
  on_load: (context) => {
    context.log('info', 'Example plugin loaded!');
    
    // Register a command
    // context.terminal.onData((sessionId, data) => {
    //   if (data.includes('hello')) {
    //     context.terminal.write(sessionId, new TextEncoder().encode('Hello from plugin!\n'));
    //   }
    // });
  },

  on_unload: (context) => {
    context.log('info', 'Example plugin unloaded!');
  },

  command: async (args, context) => {
    context.log('info', `Command executed with args: ${args.join(' ')}`);
    
    if (args[0] === 'greet') {
      const sessionId = await context.terminal.getActiveSession();
      if (sessionId) {
        await context.terminal.write(sessionId, new TextEncoder().encode('Hello from plugin!\n'));
      }
    }
  },

  terminal_data: (sessionId, data, context) => {
    // Process terminal output
    const text = new TextDecoder().decode(data);
    if (text.includes('error')) {
      context.log('warn', `Error detected in session ${sessionId}`);
    }
  },
};

export default plugin;