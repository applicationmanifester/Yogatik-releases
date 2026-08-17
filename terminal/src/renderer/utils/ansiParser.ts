export interface CursorPosition {
  row: number;
  col: number;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export interface SGRAttributes {
  fg?: ColorRGB;
  bg?: ColorRGB;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
}

export interface ShellMark {
  type: 'prompt' | 'command-start' | 'command-end' | 'output';
  line: number;
  timestamp: number;
  exitCode?: number;
}

export class AnsiParser {
  cursor: CursorPosition = { row: 1, col: 1 };
  currentAttr: SGRAttributes = {};
  cwd = '';
  marks: ShellMark[] = [];
  
  private state: 'ground' | 'escape' | 'csi' | 'osc' | 'dcs' = 'ground';
  private csiParamBuffer = '';
  private csiParams: number[] = [];
  private csiIntermediates: string = '';
  private oscBuffer: string = '';
  private oscCode: number = 0;

  parse(data: string): void {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      this.processChar(char);
    }
  }

  private processChar(char: string): void {
    switch (this.state) {
      case 'ground':
        if (char === '\x1b') {
          this.state = 'escape';
        } else if (char === '\r') {
          this.cursor.col = 1;
        } else if (char === '\n') {
          this.cursor.row++;
        } else {
          this.cursor.col++;
        }
        break;

      case 'escape':
        if (char === '[') {
          this.state = 'csi';
          this.csiParams = [];
          this.csiParamBuffer = '';
          this.csiIntermediates = '';
        } else if (char === ']') {
          this.state = 'osc';
          this.oscBuffer = '';
          this.oscCode = 0;
        } else if (char === 'P') {
          this.state = 'dcs';
        } else if (char === '7') {
          // DECSC - Save cursor
        } else if (char === '8') {
          // DECRC - Restore cursor
        } else {
          this.state = 'ground';
        }
        break;

      case 'csi':
        if (char >= '0' && char <= '9') {
          this.csiParamBuffer += char;
        } else if (char === ';') {
          if (this.csiParamBuffer !== '') {
            this.csiParams.push(parseInt(this.csiParamBuffer, 10));
            this.csiParamBuffer = '';
          } else {
            this.csiParams.push(0);
          }
        } else if (char >= '<' && char <= '?') {
          this.csiIntermediates += char;
        } else if (char >= '@' && char <= '~') {
          if (this.csiParamBuffer !== '') {
            this.csiParams.push(parseInt(this.csiParamBuffer, 10));
            this.csiParamBuffer = '';
          }
          this.handleCSI(char);
          this.state = 'ground';
        }
        break;

      case 'osc':
        if (char === '\x1b') {
          // Might be ESC \ terminator - peek next char
        } else if (char === '\x07') {
          // BEL terminator
          this.handleOSC();
          this.state = 'ground';
        } else if (char === '\\') {
          // ESC \ terminator (ST)
          this.handleOSC();
          this.state = 'ground';
        } else {
          this.oscBuffer += char;
        }
        break;

      case 'dcs':
        if (char === '\x1b') {
          // Might be ESC \ terminator
        } else if (char === '\x07' || char === '\\') {
          this.state = 'ground';
        }
        break;
    }
  }

  private handleCSI(final: string): void {
    const params = this.csiParams;
    
    switch (final) {
      case 'H': // CUP - Cursor Position
      case 'f': // HVP - Horizontal and Vertical Position
        this.cursor.row = params[0] || 1;
        this.cursor.col = params[1] || 1;
        break;
      case 'A': // CUU - Cursor Up
        this.cursor.row = Math.max(1, this.cursor.row - (params[0] || 1));
        break;
      case 'B': // CUD - Cursor Down
        this.cursor.row += params[0] || 1;
        break;
      case 'C': // CUF - Cursor Forward
        this.cursor.col += params[0] || 1;
        break;
      case 'D': // CUB - Cursor Backward
        this.cursor.col = Math.max(1, this.cursor.col - (params[0] || 1));
        break;
      case 'J': // ED - Erase in Display
        break;
      case 'K': // EL - Erase in Line
        break;
      case 'm': // SGR - Select Graphic Rendition
        this.handleSGR(params);
        break;
      case 'n': // DSR - Device Status Report
        break;
      case 's': // SCP - Save Cursor Position
        break;
      case 'u': // RCP - Restore Cursor Position
        break;
    }
    
    // Reset CSI state
    this.csiParams = [];
    this.csiParamBuffer = '';
    this.csiIntermediates = '';
  }

  private handleSGR(params: number[]): void {
    let i = 0;
    while (i < params.length) {
      const param = params[i];
      
      switch (param) {
        case 0: // Reset
          this.currentAttr = {};
          break;
        case 1: // Bold
          this.currentAttr.bold = true;
          break;
        case 3: // Italic
          this.currentAttr.italic = true;
          break;
        case 4: // Underline
          this.currentAttr.underline = true;
          break;
        case 7: // Inverse
          this.currentAttr.inverse = true;
          break;
        case 9: // Strikethrough
          this.currentAttr.strikethrough = true;
          break;
        case 22: // Not bold
          this.currentAttr.bold = false;
          break;
        case 23: // Not italic
          this.currentAttr.italic = false;
          break;
        case 24: // Not underline
          this.currentAttr.underline = false;
          break;
        case 27: // Not inverse
          this.currentAttr.inverse = false;
          break;
        case 29: // Not strikethrough
          this.currentAttr.strikethrough = false;
          break;
        case 38: // Foreground color
          if (i + 1 < params.length && params[i + 1] === 2) {
            // True color: 38;2;r;g;b
            this.currentAttr.fg = {
              r: params[i + 2],
              g: params[i + 3],
              b: params[i + 4],
            };
            i += 4;
          } else if (i + 1 < params.length && params[i + 1] === 5) {
            // 256-color: 38;5;n
            // Would map to RGB
            i += 2;
          }
          break;
        case 48: // Background color
          if (i + 1 < params.length && params[i + 1] === 2) {
            this.currentAttr.bg = {
              r: params[i + 2],
              g: params[i + 3],
              b: params[i + 4],
            };
            i += 4;
          } else if (i + 1 < params.length && params[i + 1] === 5) {
            i += 2;
          }
          break;
      }
      i++;
    }
  }

  private handleOSC(): void {
    const parts = this.oscBuffer.split(';');
    this.oscCode = parseInt(parts[0], 10);
    const payload = parts.slice(1).join(';');

    switch (this.oscCode) {
      case 0: // Window title
      case 2: // Window title
        // Title would be set
        break;
      case 7: // Working directory
        if (payload.startsWith('file://')) {
          try {
            const url = new URL(payload);
            this.cwd = url.pathname;
          } catch {
            this.cwd = '';
          }
        }
        break;
      case 8: // Hyperlink
        break;
      case 133: // Shell integration
        this.handleShellIntegration(payload);
        break;
      case 52: // Clipboard
        break;
    }
    
    // Reset OSC state
    this.oscBuffer = '';
    this.oscCode = 0;
  }

  private handleShellIntegration(payload: string): void {
    const parts = payload.split(';');
    const type = parts[0];
    const code = parts[1] ? parseInt(parts[1], 10) : undefined;

    if (type === 'A') {
      // Prompt start
      this.marks.push({
        type: 'prompt',
        line: this.cursor.row,
        timestamp: Date.now(),
      });
    } else if (type === 'B') {
      // Prompt end / command exit
      const lastPrompt = [...this.marks].reverse().find(m => m.type === 'prompt');
      if (lastPrompt) {
        lastPrompt.type = 'command-end';
        lastPrompt.exitCode = code;
      }
      this.marks.push({
        type: 'command-start',
        line: this.cursor.row,
        timestamp: Date.now(),
        exitCode: code,
      });
    }
  }
}