import type { UserConfig } from "vitest/config";

/** Shared Vitest defaults; each package merges this. */
export const vitestPreset: UserConfig = {
  test: {
    environment: "jsdom",
    globals: true,
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
};
