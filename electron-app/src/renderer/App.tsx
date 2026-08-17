// Main App Component
import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [platform, setPlatform] = useState<string>('Loading...');
  const [files, setFiles] = useState<string[]>([]);

  useEffect(() => {
    // Get app version and platform from Electron
    window.electronAPI.getVersion().then(setVersion);
    window.electronAPI.getPlatform().then(setPlatform);
  }, []);

  const handleOpenFile = async () => {
    const filePaths = await window.electronAPI.openFile();
    setFiles(filePaths);
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Electron Desktop App</h1>
        <div className="app-info">
          <span>Version: {version}</span>
          <span>Platform: {platform}</span>
        </div>
      </header>

      <main className="app-main">
        <section className="card">
          <h2>File System Access</h2>
          <button onClick={handleOpenFile} className="btn btn-primary">
            Open File Dialog
          </button>
          {files.length > 0 && (
            <ul className="file-list">
              {files.map((file, index) => (
                <li key={index}>{file}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Electron APIs</h2>
          <p>Access native desktop capabilities through the preload bridge:</p>
          <ul className="api-list">
            <li><code>window.electronAPI.getVersion()</code> - Get app version</li>
            <li><code>window.electronAPI.getPlatform()</code> - Get OS platform</li>
            <li><code>window.electronAPI.openFile()</code> - Open file dialog</li>
            <li><code>window.electronAPI.minimize()</code> - Minimize window</li>
            <li><code>window.electronAPI.maximize()</code> - Maximize window</li>
            <li><code>window.electronAPI.close()</code> - Close window</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

export default App;