import React, { useState, useEffect, useCallback } from 'react';
import { X, Play, Trash2, Download, FileText, Clock, RotateCcw } from 'lucide-react';
import { SessionRecording } from '@shared/types';

interface RecordingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RecordingsPanel({ isOpen, onClose }: RecordingsPanelProps) {
  const [recordings, setRecordings] = useState<SessionRecording[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecording, setSelectedRecording] = useState<SessionRecording | null>(null);
  const [exportFormat, setExportFormat] = useState<'asciicast' | 'json'>('asciicast');

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.terminalAPI?.recording.list();
      if (result) {
        setRecordings(result);
      }
    } catch (error) {
      console.error('Failed to load recordings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRecordings();
    }
  }, [isOpen, loadRecordings]);

  const handlePlay = async (recording: SessionRecording) => {
    // Find active session to replay in
    const sessions = await window.terminalAPI?.pty.getAllSessions();
    if (!sessions?.length) return;

    const session = sessions[0];
    const result = await window.terminalAPI?.recording.replay(recording.id, session.id);
    if (result?.error) {
      alert(`Replay failed: ${result.error}`);
    }
  };

  const handleExport = async (recording: SessionRecording) => {
    const result = await window.terminalAPI?.recording.export(recording.id, exportFormat);
    if (result?.data) {
      const blob = new Blob([result.data], { 
        type: exportFormat === 'json' ? 'application/json' : 'text/plain' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${recording.id}.${exportFormat === 'json' ? 'json' : 'cast'}`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleDelete = async (recordingId: string) => {
    if (!confirm('Delete this recording?')) return;
    await window.terminalAPI?.recording.delete(recordingId);
    loadRecordings();
  };

  const formatDuration = (startedAt: number, endedAt?: number) => {
    const end = endedAt || Date.now();
    const diff = end - startedAt;
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <div className="recordings-panel-overlay" onClick={onClose}>
      <div className="recordings-panel" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Session Recordings">
        <div className="recordings-header">
          <h2>Session Recordings</h2>
          <div className="header-actions">
            <select
              value={exportFormat}
              onChange={e => setExportFormat(e.target.value as 'asciicast' | 'json')}
              className="export-format-select"
            >
              <option value="asciicast">Asciicast (.cast)</option>
              <option value="json">JSON</option>
            </select>
            <button className="panel-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="recordings-content">
          {loading ? (
            <div className="recordings-loading">Loading recordings...</div>
          ) : recordings.length === 0 ? (
            <div className="recordings-empty">
              <FileText size={48} className="empty-icon" />
              <p>No recordings yet</p>
              <p className="empty-hint">Enable "Log PTY Traffic" in Advanced settings to record sessions</p>
            </div>
          ) : (
            <div className="recordings-list">
              {recordings.map(recording => (
                <div key={recording.id} className="recording-item">
                  <div className="recording-info">
                    <div className="recording-meta">
                      <span className="recording-id">{recording.id}</span>
                      <span className="recording-shell">{recording.metadata.shell.split('/').pop() || recording.metadata.shell}</span>
                    </div>
                    <div className="recording-details">
                      <span><Clock size={12} /> {formatDate(recording.startedAt)}</span>
                      <span><RotateCcw size={12} /> {formatDuration(recording.startedAt, recording.endedAt)}</span>
                      <span>{recording.frames.length} frames</span>
                      <span>{recording.metadata.cols}×{recording.metadata.rows}</span>
                    </div>
                  </div>
                  <div className="recording-actions">
                    <button 
                      className="action-btn play" 
                      onClick={() => handlePlay(recording)}
                      title="Replay in active session"
                    >
                      <Play size={16} />
                    </button>
                    <button 
                      className="action-btn export" 
                      onClick={() => handleExport(recording)}
                      title="Export"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      className="action-btn delete" 
                      onClick={() => handleDelete(recording.id)}
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}