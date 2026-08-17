import { EventEmitter } from 'events';
import type { IPty } from 'node-pty';

interface KittyGraphicsCommand {
  action: 'transmit' | 'delete' | 'query';
  id?: number;
  format?: 'png' | 'jpeg' | 'rgba' | 'rgb' | 'auto';
  width?: number;
  height?: number;
  cells?: { w: number; h: number };
  pixels?: { w: number; h: number };
  compression?: 'none' | 'zlib';
  data?: string;
  key?: string;
  opt?: string;
  placement?: { x: number; y: number };
  zIndex?: number;
}

interface SixelImage {
  width: number;
  height: number;
  data: Uint8Array;
  palette: number[];
}

export class GraphicsProtocolHandler extends EventEmitter {
  private kittyImages: Map<number, { data: string; width: number; height: number }> = new Map();
  private sixelParser: SixelParser;
  private pty: IPty | null = null;

  constructor() {
    super();
    this.sixelParser = new SixelParser();
  }

  attachPty(pty: IPty): void {
    this.pty = pty;
    this.setupPtyListener();
  }

  private setupPtyListener(): void {
    if (!this.pty) return;

    this.pty.onData((data: string) => {
      this.handleOutput(data);
    });
  }

  private handleOutput(data: string): void {
    // Handle Kitty graphics protocol (OSC 1337 or escape sequence \x1b_G)
    const kittyMatches = data.match(/\x1b_G([^\\]*)\x1b\\/g);
    if (kittyMatches) {
      for (const match of kittyMatches) {
        const payload = match.slice(3, -2);
        this.parseKittyCommand(payload);
      }
    }

    // Handle Sixel graphics (DECGRA)
    const sixelMatches = data.match(/\x1bPq([^\x1b]*)\x1b\\/g);
    if (sixelMatches) {
      for (const match of sixelMatches) {
        const payload = match.slice(3, -2);
        this.parseSixel(payload);
      }
    }

    // Handle OSC 1337 (iTerm2 style)
    const osc1337Matches = data.match(/\x1b\]1337;([^\\]*)\x1b\\/g);
    if (osc1337Matches) {
      for (const match of osc1337Matches) {
        this.parseOSC1337(match.slice(7, -2));
      }
    }
  }

  private parseKittyCommand(payload: string): void {
    const parts = payload.split(';');
    const cmd: KittyGraphicsCommand = { action: 'transmit' };

    for (const part of parts) {
      const [key, value] = part.split('=');
      switch (key) {
        case 'a':
          cmd.action = value as KittyGraphicsCommand['action'];
          break;
        case 'i':
          cmd.id = parseInt(value, 10);
          break;
        case 'f':
          cmd.format = value as KittyGraphicsCommand['format'];
          break;
        case 'w':
        case 'W':
          cmd.width = parseInt(value, 10);
          break;
        case 'h':
        case 'H':
          cmd.height = parseInt(value, 10);
          break;
        case 'c':
          cmd.cells = { w: parseInt(value.split('x')[0], 10), h: parseInt(value.split('x')[1] || '0', 10) };
          break;
        case 'p':
          cmd.pixels = { w: parseInt(value.split('x')[0], 10), h: parseInt(value.split('x')[1] || '0', 10) };
          break;
        case 'o':
          cmd.compression = value as KittyGraphicsCommand['compression'];
          break;
        case 'd':
          cmd.data = value;
          break;
        case 'k':
          cmd.key = value;
          break;
        case 'q':
          cmd.opt = value;
          break;
      }
    }

    this.executeKittyCommand(cmd);
  }

  private executeKittyCommand(cmd: KittyGraphicsCommand): void {
    switch (cmd.action) {
      case 'transmit':
        this.handleKittyTransmit(cmd);
        break;
      case 'delete':
        this.handleKittyDelete(cmd);
        break;
      case 'query':
        this.handleKittyQuery(cmd);
        break;
    }
  }

  private handleKittyTransmit(cmd: KittyGraphicsCommand): void {
    if (!cmd.data || !cmd.id) return;

    // Decode base64 data
    let imageData: string;
    try {
      imageData = Buffer.from(cmd.data, 'base64').toString('binary');
    } catch {
      return;
    }

    // Store image
    this.kittyImages.set(cmd.id, {
      data: imageData,
      width: cmd.width || 0,
      height: cmd.height || 0,
    });

    // Emit for renderer to display
    this.emit('kitty-image', {
      id: cmd.id,
      data: `data:image/${cmd.format || 'png'};base64,${cmd.data}`,
      width: cmd.width,
      height: cmd.height,
      cells: cmd.cells,
      pixels: cmd.pixels,
      placement: cmd.placement,
      zIndex: cmd.zIndex,
    });
  }

  private handleKittyDelete(cmd: KittyGraphicsCommand): void {
    if (cmd.id) {
      this.kittyImages.delete(cmd.id);
      this.emit('kitty-delete', { id: cmd.id });
    } else if (cmd.key) {
      // Delete by key pattern
      for (const [id, img] of this.kittyImages) {
        // Would need to store key with image
      }
      this.emit('kitty-delete', { key: cmd.key });
    }
  }

  private handleKittyQuery(cmd: KittyGraphicsCommand): void {
    // Respond with supported features
    const response = {
      type: 'kitty-query-response',
      graphics: true,
      unicode_placeholders: true,
      animations: true,
      max_size: 1024 * 1024 * 10, // 10MB
    };
    
    if (this.pty) {
      this.pty.write(`\x1b_Ga=q;i=${cmd.id};d=${Buffer.from(JSON.stringify(response)).toString('base64')}\x1b\\`);
    }
  }

  private parseSixel(payload: string): void {
    const image = this.sixelParser.parse(payload);
    if (image) {
      // Emit raw pixel data for renderer to convert to image
      this.emit('sixel-image', {
        data: Array.from(image.data),
        palette: image.palette,
        width: image.width,
        height: image.height,
      });
    }
  }

  private parseOSC1337(payload: string): void {
    // iTerm2 proprietary protocol: File=inline;size=...;width=...;height=...:base64data
    const parts = payload.split(':');
    if (parts.length < 2) return;

    const params = parts[0].split(';');
    const data = parts.slice(1).join(':');

    const opts: Record<string, string> = {};
    for (const param of params) {
      const [key, value] = param.split('=');
      if (key && value) opts[key] = value;
    }

    if (opts.File === 'inline') {
      this.emit('iterm2-image', {
        data: `data:image/${opts.format || 'png'};base64,${data}`,
        width: parseInt(opts.width || '0', 10),
        height: parseInt(opts.height || '0', 10),
        name: opts.name,
        size: parseInt(opts.size || '0', 10),
        preserveAspectRatio: opts.preserveAspectRatio !== '0',
      });
    }
  }

  getKittyImage(id: number): { data: string; width: number; height: number } | undefined {
    return this.kittyImages.get(id);
  }

  clear(): void {
    this.kittyImages.clear();
    this.sixelParser.resetParser();
  }
}

class SixelParser {
  private width = 0;
  private height = 0;
  private currentColor = 0;
  private palette: number[] = [];
  private pixels: number[] = [];
  private x = 0;
  private y = 0;
  private repeatCount = 1;
  private inRepeat = false;

  parse(data: string): SixelImage | null {
    this.resetParser();
    
    let i = 0;
    while (i < data.length) {
      const char = data[i];
      
      if (char === '#') {
        // Color register: #Pindex;r;g;b
        i++;
        const end = data.indexOf('#', i);
        const params = data.slice(i, end === -1 ? data.length : end).split(';');
        if (params.length >= 4) {
          const index = parseInt(params[0], 10);
          const r = Math.round(parseInt(params[1], 10) * 255 / 100);
          const g = Math.round(parseInt(params[2], 10) * 255 / 100);
          const b = Math.round(parseInt(params[3], 10) * 255 / 100);
          this.palette[index] = (r << 16) | (g << 8) | b;
        }
        i = end === -1 ? data.length : end;
      } else if (char === '!') {
        // Repeat count: !count
        i++;
        let countStr = '';
        while (i < data.length && /\d/.test(data[i])) {
          countStr += data[i++];
        }
        this.repeatCount = parseInt(countStr, 10) || 1;
        this.inRepeat = true;
      } else if (char >= '?' && char <= '~') {
        // Sixel data (6 bits per char)
        const sixelValue = char.charCodeAt(0) - 63;
        this.processSixel(sixelValue);
      } else if (char === '$') {
        // Carriage return
        this.x = 0;
        this.y++;
        i++;
      } else if (char === '-') {
        // New line
        this.x = 0;
        this.y++;
        i++;
      } else if (char === '@') {
        // Reset
        this.x = 0;
        this.y = 0;
        i++;
      } else {
        i++;
      }
    }

    if (this.pixels.length === 0) return null;

    return {
      width: this.width || this.x,
      height: this.height || this.y + 1,
      data: new Uint8Array(this.pixels),
      palette: this.palette,
    };
  }

  private processSixel(value: number): void {
    // Each sixel represents 6 vertical pixels
    for (let bit = 0; bit < 6; bit++) {
      if (value & (1 << bit)) {
        const pixelY = this.y * 6 + bit;
        const index = pixelY * this.width + this.x;
        
        // Ensure array is large enough
        while (this.pixels.length <= index) {
          this.pixels.push(0);
        }
        
        // Draw pixel for repeat count
        for (let r = 0; r < this.repeatCount; r++) {
          const drawX = this.x + r;
          const drawIndex = pixelY * this.width + drawX;
          while (this.pixels.length <= drawIndex) {
            this.pixels.push(0);
          }
          this.pixels[drawIndex] = this.currentColor;
        }
      }
      
      this.x += this.repeatCount;
      this.repeatCount = 1;
      this.inRepeat = false;
      
      if (this.x >= this.width) {
        this.width = this.x + 1;
      }
    }
  }

  resetParser(): void {
    this.width = 0;
    this.height = 0;
    this.currentColor = 0;
    this.palette = [0]; // Default palette starts with black
    this.pixels = [];
    this.x = 0;
    this.y = 0;
    this.repeatCount = 1;
    this.inRepeat = false;
  }
}

export const graphicsProtocolHandler = new GraphicsProtocolHandler();