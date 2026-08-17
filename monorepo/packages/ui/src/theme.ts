/** Design tokens consumed by components and re-exported for app theming. */
export const tokens = {
  color: {
    brand: "#4f46e5",
    brandFg: "#ffffff",
    danger: "#e11d48",
    surface: "#ffffff",
    text: "#111827",
    border: "#e5e7eb",
  },
  radius: { sm: "6px", md: "10px", lg: "14px" },
  space: (n: number) => `${n * 4}px`,
} as const;

export type Tokens = typeof tokens;
