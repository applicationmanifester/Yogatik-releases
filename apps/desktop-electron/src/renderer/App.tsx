// apps/desktop-electron/src/renderer/App.tsx
import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Heading, Text } from '@my-app/shared-ui'
import styles from './App.module.css'

function App() {
  const [version, setVersion] = useState<string>('Loading…')
  const [platform, setPlatform] = useState<string>('Loading…')
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    window.electronAPI.getVersion().then(v => mounted && setVersion(v))
    window.electronAPI.getPlatform().then(p => mounted && setPlatform(p))
    return () => { mounted = false }
  }, [])

  const handleOpenFile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const files = await window.electronAPI.openFile()
      setSelectedFiles(files)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open file dialog')
    } finally {
      setLoading(false)
    }
  }, [])

  return (
    <div className={styles.container}>
      <Heading level={1} className={styles.title}>Desktop Electron App</Heading>

      <Card className={styles.card}>
        <Heading level={2}>Environment Info</Heading>
        <Text><strong>Version:</strong> {version}</Text>
        <Text><strong>Platform:</strong> {platform}</Text>
      </Card>

      <Card className={styles.card}>
        <Heading level={2}>Native File Dialog</Heading>
        <Button onClick={handleOpenFile} variant="primary" disabled={loading}>
          {loading ? 'Opening…' : 'Open File Dialog'}
        </Button>
        {error && <Text className={styles.error}>{error}</Text>}
        {selectedFiles.length > 0 && (
          <div className={styles.fileList}>
            <Text><strong>Selected:</strong></Text>
            <ul>
              {selectedFiles.map((file, idx) => (
                <li key={`${file}-${idx}`}>{file}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className={styles.card}>
        <Heading level={2}>Shared UI Components</Heading>
        <Text>This app uses components from <code>@my-app/shared-ui</code> package.</Text>
        <Button variant="secondary" className={styles.button}>Shared Button</Button>
        <Button variant="outline" className={styles.button}>Outline Button</Button>
      </Card>
    </div>
  )
}

export default App