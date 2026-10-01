import React from 'react';
import { useAdaptivePolling } from './useAdaptivePolling';
import styles from './CadenceIndicator.module.css';

export function CadenceIndicator() {
  const { intervalMs, isBusy, cadenceDesc, noteObservation } = useAdaptivePolling();

  // Simulate an observation source (e.g., from screenHash or liveWatch)
  React.useEffect(() => {
    // In practice you would call this whenever you have a new screen‑hash diff
    // or an engagement event from the UI.
    const fakeCheck = () => {
      const changed = Math.random() > 0.7; // 30% chance of change
      noteObservation({ changed, engaged: false });
    };
    const id = setInterval(fakeCheck, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, noteObservation]);

  return React.createElement(
    'div',
    { className: styles.indicator },
    React.createElement('div', null, `Polling: ${cadenceDesc}`),
    React.createElement('div', null, isBusy ? '🟢 Busy' : '⚪ Idle')
  );
}