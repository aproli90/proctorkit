// Builds dist/proctorkit.js (ES module), dist/proctorkit.global.js (script tag, window.ProctorKit) and the type declarations.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const common = { entryPoints: ['src/index.ts'], bundle: true, target: 'es2020', loader: { '.css': 'text' }, minify: true, legalComments: 'none' };
await build({ ...common, format: 'esm', outfile: 'dist/proctorkit.js' });
await build({ ...common, format: 'iife', globalName: 'ProctorKit', outfile: 'dist/proctorkit.global.js' });
execSync('npx tsc -p tsconfig.json', { stdio: 'inherit' });
console.log('built');
