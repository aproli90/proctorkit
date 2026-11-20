// Builds dist/proctorkit.js (ES module), dist/proctorkit.global.js (script tag, window.ProctorKit) and the type declarations.
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const common = { entryPoints: ['src/index.ts'], bundle: true, target: 'es2020', loader: { '.css': 'text' }, minify: true, legalComments: 'none' };
await build({ ...common, format: 'esm', outfile: 'dist/proctorkit.js' });
await build({ ...common, format: 'iife', globalName: 'ProctorKit', outfile: 'dist/proctorkit.global.js' });
// Minifying drops the comments that tell bundlers (webpack, Turbopack, Vite) to leave the face detector's CDN import
// alone; without them Next.js and others try to bundle the URL and the camera check fails to load. Put them back.
for (const f of ['dist/proctorkit.js', 'dist/proctorkit.global.js']) {
  const code = readFileSync(f, 'utf8');
  const n = code.split('import(').length - 1;
  if (n !== 1) throw new Error(`${f}: expected one dynamic import, found ${n}`);
  writeFileSync(f, code.replace('import(', 'import(/* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ '));
}
execSync('npx tsc -p tsconfig.json', { stdio: 'inherit' });
console.log('built');
