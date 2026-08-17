import { useRef, useEffect, useCallback } from 'react';

interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  memoryUsage: number;
}

interface UseTerminalPerformanceOptions {
  targetFps?: number;
  onMetrics?: (metrics: PerformanceMetrics) => void;
  enabled?: boolean;
}

export function useTerminalPerformance({
  targetFps = 60,
  onMetrics,
  enabled = true,
}: UseTerminalPerformanceOptions = {}) {
  const frameTimes = useRef<number[]>([]);
  const lastFrameTime = useRef<number>(performance.now());
  const frameCount = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const metricsRef = useRef<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    drawCalls: 0,
    memoryUsage: 0,
  });

  const calculateMetrics = useCallback(() => {
    const now = performance.now();
    const frameTime = now - lastFrameTime.current;
    lastFrameTime.current = now;

    frameTimes.current.push(frameTime);
    if (frameTimes.current.length > 60) {
      frameTimes.current.shift();
    }

    frameCount.current++;

    // Calculate FPS every 60 frames
    if (frameCount.current % 60 === 0) {
      const avgFrameTime = frameTimes.current.reduce((a, b) => a + b, 0) / frameTimes.current.length;
      const fps = 1000 / avgFrameTime;

      // Memory usage (if available)
      let memoryUsage = 0;
      if ('memory' in performance) {
        const mem = (performance as any).memory;
        memoryUsage = mem.usedJSHeapSize / 1024 / 1024; // MB
      }

      const metrics: PerformanceMetrics = {
        fps: Math.round(fps),
        frameTime: Math.round(avgFrameTime * 100) / 100,
        drawCalls: 0, // Would need WebGL extension to track
        memoryUsage: Math.round(memoryUsage * 100) / 100,
      };

      metricsRef.current = metrics;
      onMetrics?.(metrics);
    }
  }, [onMetrics]);

  // Frame loop for metrics collection
  useEffect(() => {
    if (!enabled) return;

    const loop = () => {
      calculateMetrics();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [enabled, calculateMetrics]);

  return metricsRef.current;
}

// Frame throttling utility
export function createFrameThrottler(targetFps: number = 60) {
  const frameInterval = 1000 / targetFps;
  let lastFrameTime = 0;
  let scheduledCallback: (() => void) | null = null;
  let animationFrameId: number | null = null;

  const throttle = (callback: () => void): void => {
    const now = performance.now();
    const timeSinceLastFrame = now - lastFrameTime;

    if (timeSinceLastFrame >= frameInterval) {
      lastFrameTime = now;
      callback();
    } else {
      // Schedule for next frame
      if (!scheduledCallback) {
        scheduledCallback = callback;
        animationFrameId = requestAnimationFrame(() => {
          scheduledCallback = null;
          if (animationFrameId) {
            throttle(callback);
          }
        });
      }
    }
  };

  const cancel = (): void => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    scheduledCallback = null;
  };

  return { throttle, cancel };
}

// Debounced resize handler
export function createResizeDebouncer(callback: (width: number, height: number) => void, delay: number = 16) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  return (width: number, height: number) => {
    if (width === lastWidth && height === lastHeight) return;
    
    lastWidth = width;
    lastHeight = height;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      callback(width, height);
      timeoutId = null;
    }, delay);
  };
}

// Virtual scrolling helper for large scrollback
export function createVirtualScroller<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const getVisibleRange = (scrollTop: number) => {
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
    return { start, end };
  };

  const getItemOffset = (index: number) => index * itemHeight;
  const getTotalHeight = () => items.length * itemHeight;

  return { getVisibleRange, getItemOffset, getTotalHeight };
}