// Electron Renderer Entry Point
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Handle hot module replacement
if (import.meta.hot) {
  import.meta.hot.accept('./App', () => {
    const newApp = await import('./App');
    root.render(
      <React.StrictMode>
        <newApp.default />
      </React.StrictMode>
    );
  });
}