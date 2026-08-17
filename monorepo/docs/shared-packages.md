# Working with shared packages

## Where does code go?
- Pure logic, types, API, validation → `packages/shared` (no React!).
- React components, tokens → `packages/ui`.
- Lint/TS/Tailwind/test presets → `packages/config`.

## Add code to `shared`
1. Create `packages/shared/src/foo.ts`.
2. Re-export it from `src/index.ts` (and add a subpath in `package.json#exports`
   if you want `@acme/shared/foo`).
3. `pnpm build --filter @acme/shared`.

## Add a UI component
`node tools/generate-component.mjs Card` — scaffolds the file and exports it.

## Import rules
- Import by package name: `import { Button } from "@acme/ui"`.
- Never deep-import into another package's `src/`.
- Internal deps use `workspace:*`.
