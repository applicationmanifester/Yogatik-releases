import fs from 'fs';
import path from 'path';

const srcDir = path.resolve('frontend/src');

function getImports(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const regex = /(?:import\s+.*?from\s+['"](.*?)['"]|export\s+.*?from\s+['"](.*?)['"])/g;
  let match;
  while ((match = regex.exec(code)) !== null) {
    const importPath = match[1] || match[2];
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filePath), importPath);
      for (const ext of ['', '.js', '.jsx', '.ts', '.tsx', '/index.js']) {
        if (fs.existsSync(resolved + ext) && fs.statSync(resolved + ext).isFile()) {
          imports.push(resolved + ext);
          break;
        }
      }
    }
  }
  return imports;
}

const graph = new Map();
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full);
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.includes('.test.')) {
      graph.set(full, getImports(full));
    }
  }
}

scan(srcDir);

// Find cycles
const visited = new Set();
const recStack = new Set();
const cycles = [];

function dfs(node, pathArr) {
  visited.add(node);
  recStack.add(node);

  const neighbors = graph.get(node) || [];
  for (const neighbor of neighbors) {
    if (!visited.has(neighbor)) {
      dfs(neighbor, [...pathArr, neighbor]);
    } else if (recStack.has(neighbor)) {
      const cycleStart = pathArr.indexOf(neighbor);
      if (cycleStart !== -1) {
        cycles.push(pathArr.slice(cycleStart).concat(neighbor));
      } else {
        cycles.push([node, neighbor]);
      }
    }
  }

  recStack.delete(node);
}

for (const node of graph.keys()) {
  if (!visited.has(node)) {
    dfs(node, [node]);
  }
}

console.log(`Found ${cycles.length} circular dependencies:`);
for (let i = 0; i < Math.min(cycles.length, 15); i++) {
  console.log(`Cycle ${i + 1}:`);
  console.log(cycles[i].map(p => path.relative(srcDir, p).replace(/\\/g, '/')).join(' -> '));
}
