import { EventEmitter } from 'events';
import type { TerminalSession } from '../shared/types';

interface RecordingFrame {
  timestamp: number;
  data: Uint8Array;
}

interface SessionRecording {
  id: string;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  frames: RecordingFrame[];
  metadata: {
    cols: number;
    rows: number;
    shell: string;
    cwd: string;
  };
}

export class SessionRecorder extends EventEmitter {
  private recordings: Map<string, SessionRecording> = new Map();
  private maxRecordings = 100;
  private maxFramesPerRecording = 10000;

  startRecording(session: TerminalSession): string {
    const recordingId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const recording: SessionRecording = {
      id: recordingId,
      sessionId: session.id,
      startedAt: Date.now(),
      frames: [],
      metadata: {
        cols: session.cols,
        rows: session.rows,
        shell: session.shell.path,
        cwd: session.cwd,
      },
    };

    this.recordings.set(recordingId, recording);
    
    // Clean up old recordings if over limit
    if (this.recordings.size > this.maxRecordings) {
      const oldest = [...this.recordings.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt)[0];
      this.recordings.delete(oldest[0]);
    }

    this.emit('recording-started', { recordingId, sessionId: session.id });
    return recordingId;
  }

  stopRecording(recordingId: string): SessionRecording | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;

    recording.endedAt = Date.now();
    this.emit('recording-stopped', recording);
    return recording;
  }

  addFrame(recordingId: string, data: Uint8Array): void {
    const recording = this.recordings.get(recordingId);
    if (!recording || recording.endedAt) return;

    recording.frames.push({
      timestamp: Date.now() - recording.startedAt,
      data: new Uint8Array(data), // Copy to avoid reference issues
    });

    // Limit frames per recording
    if (recording.frames.length > this.maxFramesPerRecording) {
      recording.frames.shift();
    }
  }

  getRecording(recordingId: string): SessionRecording | undefined {
    return this.recordings.get(recordingId);
  }

  getAllRecordings(): SessionRecording[] {
    return [...this.recordings.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  deleteRecording(recordingId: string): boolean {
    return this.recordings.delete(recordingId);
  }

  exportAsAsciicast(recordingId: string): string | null {
    const recording = this.recordings.get(recordingId);
    if (!recording) return null;

    const header = {
      version: 2,
      width: recording.metadata.cols,
      height: recording.metadata.rows,
      timestamp: Math.floor(recording.startedAt / 1000),
      env: {
        SHELL: recording.metadata.shell,
        TERM: 'xterm-256color',
      },
    };

    let output = JSON.stringify(header) + '\n';
    
    for (const frame of recording.frames) {
      const decoder = new TextDecoder();
      const text = decoder.decode(frame.data);
      // Escape for asciicast format
      const escaped = text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/"/g, '\\"');
      output += `[${(frame.timestamp / 1000).toFixed(6)}, "o", "${escaped}"]\n`;
    }

    return output;
  }

  async replay(recordingId: string, onFrame: (data: Uint8Array, delay: number) => Promise<void>): Promise<void> {
    const recording = this.recordings.get(recordingId);
    if (!recording) return;

    let lastTimestamp = 0;
    for (const frame of recording.frames) {
      const delay = frame.timestamp - lastTimestamp;
      await onFrame(frame.data, delay);
      lastTimestamp = frame.timestamp;
    }
  }
}

export const sessionRecorder = new SessionRecorder();