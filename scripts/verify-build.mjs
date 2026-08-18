import { access, readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
for (const key of ['js', 'css']) {
  if (typeof manifest[key] !== 'string' || manifest[key].length === 0) throw new Error(`manifest.json 缺少 ${key}`);
  await access(manifest[key]);
}
await access('dist/index.js.LEGAL.txt');
console.log('构建产物与 manifest.json 一致。');
