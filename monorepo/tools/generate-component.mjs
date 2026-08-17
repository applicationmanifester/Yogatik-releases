#!/usr/bin/env node
/**
 * Scaffold a new component in packages/ui.
 * Usage: node tools/generate-component.mjs Card
 */
import { writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const name = process.argv[2];
if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
  console.error("Usage: node tools/generate-component.mjs <PascalCaseName>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, "packages/ui/src");

const component = `import type { HTMLAttributes } from "react";
import { tokens } from "./theme.js";

export interface ${name}Props extends HTMLAttributes<HTMLDivElement> {}

export function ${name}(props: ${name}Props) {
  return <div style={{ padding: tokens.space(4) }} {...props} />;
}
`;

await writeFile(resolve(dir, `${name}.tsx`), component);

const indexPath = resolve(dir, "index.ts");
const index = await readFile(indexPath, "utf8");
await writeFile(
  indexPath,
  index + `export { ${name}, type ${name}Props } from "./${name}.js";\n`,
);

console.warn(`Created packages/ui/src/${name}.tsx and exported it.`);
