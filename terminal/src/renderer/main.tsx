import React from 'react';
import { createRoot } from 'react-dom/client';
import { TerminalApp } from './components/TerminalApp';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TerminalApp />
  </React.StrictMode>
);