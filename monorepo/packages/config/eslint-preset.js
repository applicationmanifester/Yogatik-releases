import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Flat ESLint config shared across the monorepo. Apps/packages spread this. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },
  { ignores: ["dist/**", "dist-electron/**", "release/**", "**/*.config.*"] }
);
