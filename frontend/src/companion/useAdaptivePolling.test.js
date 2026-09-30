import { renderHook, act } from '@testing-library/react-hooks';
import { useAdaptivePolling } from './useAdaptivePolling';

describe('useAdaptivePolling', () => {
  test('starts at floor interval', () => {
    const { result } = renderHook(() => useAdaptivePolling());
    expect(result.current.intervalMs).toBe(6000);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.cadenceDesc).toBe('every 6s');
  });

  test('interval grows after unchanged observations', () => {
    const { result } = renderHook(() => useAdaptivePolling());
    act(() => {
      result.current.noteObservation({ changed: false, engaged: false });
    });
    expect(result.current.intervalMs).toBeCloseTo(6000 * 1.6); // 9600
    expect(result.current.cadenceDesc).toMatch(/every ~16s/);
  });

  test('resets to floor after a change', () => {
    const { result } = renderHook(() => useAdaptivePolling());
    // First push it up
    act(() => {
      result.current.noteObservation({ changed: false, engaged: false });
      result.current.noteObservation({ changed: false, engaged: false });
    });
    let high = result.current.intervalMs;
    expect(high).toBeGreaterThan(6000);
    // Now report a change
    act(() => {
      result.current.noteObservation({ changed: true, engaged: false });
    });
    expect(result.current.intervalMs).toBe(6000);
  });

  test('isBusy becomes true after ACTIVE_STREAK changes', () => {
    const { result } = renderHook(() => useAdaptivePolling());
    // Need 3 consecutive changes (ACTIVE_STREAK = 3)
    act(() => {
      result.current.noteObservation({ changed: true, engaged: false });
      result.current.noteObservation({ changed: true, engaged: false });
      expect(result.current.isBusy).toBe(false); // still 2
      result.current.noteObservation({ changed: true, engaged: false });
    });
    expect(result.current.isBusy).toBe(true);
  });
});