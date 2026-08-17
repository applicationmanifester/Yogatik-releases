/** Framework-agnostic utilities. Keep these tree-shakeable and side-effect free. */

/** Format an epoch-ms timestamp as a locale date-time string. */
export function formatDate(ts: number, locale = "en-US"): string {
  return new Date(ts).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Simple debounce (trailing edge). */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): (...args: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
