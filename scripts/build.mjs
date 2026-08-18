import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const outdir = path.resolve('dist');
await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const buttplugWeb = path.join(path.dirname(require.resolve('buttplug/package.json')), 'dist/web/buttplug.mjs');

await build({
  entryPoints: ['src/extension/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'iife',
  target: ['es2022'],
  platform: 'browser',
  sourcemap: false,
  minify: true,
  legalComments: 'external',
  alias: { buttplug: buttplugWeb },
  define: { 'process.env.NODE_ENV': '"production"' },
});
await copyFile('src/ui/styles.css', 'dist/style.css');

const legalPath = path.join(outdir, 'index.js.LEGAL.txt');
let legal = '';
try { legal = await readFile(legalPath, 'utf8'); } catch { /* esbuild may not emit one */ }
const notice = `ToyLink includes buttplug-js 5.0.1 (BSD-3-Clause).\nCopyright (c) 2016-2023, Nonpolynomial Labs LLC.\nSee THIRD_PARTY_NOTICES.md in the repository.\n`;
if (!legal.includes('buttplug-js')) await writeFile(legalPath, `${legal}${legal ? '\n' : ''}${notice}`, 'utf8');
