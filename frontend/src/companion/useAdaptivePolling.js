import { useState, useCallback } from 'react';
import {
  createAdaptiveState,
  noteObservation,
  nextDelay,
  isBusy,
  describeCadence,
  FLOOR_MS,
  CEILING_MS,
} from './adaptive';

/**
 * Hook that exposes the adaptive‑polling state and helpers.
 *
 * @param {Object} [options] – Override defaults for testing or customization.
 * @param {number} [options.floorMs] – Fastest poll interval (default: 6000).
 * @param {number} [options.ceilingMs] – Slowest poll interval (default: 120000).
 * @param {number} [options.growth] – Backoff multiplier (default: 1.6).
 * @returns {{
 *   intervalMs: number,
 *   isBusy: boolean,
 *   cadenceDesc: string,
 *   noteObservation: (obs: {changed: boolean, engaged: boolean}) => void,
 *   reset: () => void
 * }}
 */
export function useAdaptivePolling(options = {}) {
  const [state, setState] = useState(() =>
    createAdaptiveState({
      floorMs: options.floorMs ?? FLOOR_MS,
      ceilingMs: options.ceilingMs ?? CEILING_MS,
      growth: options.growth ?? 1.6,
    })
  );

  /** Report a new observation (screen changed / user engaged). */
  const handleNoteObservation = useCallback(
    (obs) => {
      setState((prev) => ({ ...noteObservation({ ...prev }, obs) }));
    },
    [] // deps: none – noteObservation is pure
  );

  /** Reset the adaptive state to its initial values. */
  const reset = useCallback(() => {
    setState(() =>
      createAdaptiveState({
        floorMs: options.floorMs ?? FLOOR_MS,
        ceilingMs: options.ceilingMs ?? CEILING_MS,
        growth: options.growth ?? 1.6,
      })
    );
  }, [options.floorMs, options.ceilingMs, options.growth]);

  // Derived values for UI / logging
  const intervalMs = state.intervalMs;
  const isBusyFlag = isBusy(state);
  const cadenceDesc = describeCadence(state);

  return {
    intervalMs,
    isBusy: isBusyFlag,
    cadenceDesc,
    noteObservation: handleNoteObservation,
    reset,
  };
}