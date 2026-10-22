import { build } from 'esbuild';
await build({ entryPoints: [new URL('../src/index.ts', import.meta.url).pathname], outfile: new URL('../dist/index.js', import.meta.url).pathname, platform: 'node', format: 'esm', target: 'node22', bundle: true, packages: 'external' });
