/** Shared Tailwind preset — design tokens live here so web + desktop match. */
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#4f46e5",
          fg: "#ffffff",
          muted: "#6366f1"
        }
      },
      borderRadius: { xl: "0.9rem" }
    }
  },
  plugins: []
};
