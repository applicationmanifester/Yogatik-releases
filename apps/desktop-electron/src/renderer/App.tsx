// apps/desktop-electron/src/renderer/App.tsx
import { useState, useEffect } from 'react';
import { Button, Card, Heading, Text } from '@my-app/shared-ui';

function App() {
  const [version, setVersion] = useState<string>('Loading...');
  const [platform, setPlatform] = useState<string>('Loading...');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  useEffect(() => {
    // Get app version and platform via Electron API
    window.electronAPI.getVersion().then(setVersion);
    window.electronAPI.getPlatform().then(setPlatform);
  }, []);

  const handleOpenFile = async () => {
    const files = await window.electronAPI.openFile();
    setSelectedFiles(files);
  };

  return (
    <div style={styles.container}>
      <Heading level={1} style={styles.title}>
        Desktop Electron App
      </Heading>

      <Card style={styles.card}>
        <Heading level={2}>Environment Info</Heading>
        <Text><strong>Version:</strong> {version}</Text>
        <Text><strong>Platform:</strong> {platform}</Text>
      </Card>

      <Card style={styles.card}>
        <Heading level={2}>Native File Dialog</Heading>
        <Button onClick={handleOpenFile} variant="primary">
          Open File Dialog
        </Button>
        {selectedFiles.length > 0 && (
          <div style={styles.fileList}>
            <Text><strong>Selected:</strong></Text>
            <ul>
              {selectedFiles.map((file, i) => (
                <li key={i}>{file}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card style={styles.card}>
        <Heading level={2}>Shared UI Components</Heading>
        <Text>
          This app uses components from <code>@my-app/shared-ui</code> package.
          The same components can be used in the web app.
        </Text>
        <Button variant="secondary" style={styles.button}>
          Shared Button
        </Button>
        <Button variant="outline" style={styles.button}>
          Outline Button
        </Button>
      </Card>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  title: {
    marginBottom: '24px',
    textAlign: 'center',
  },
  card: {
    marginBottom: '16px',
  },
  fileList: {
    marginTop: '12px',
    padding: '12px',
    background: '#f5f5f5',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '12px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  button: {
    marginRight: '8px',
    marginTop: '8px',
  },
};

export default App;