import { access, readFile } from 'node:fs/promises';

const required = [
  'package.json',
  'tsconfig.base.json',
  '.editorconfig',
  'apps',
  'services',
  'packages',
];

for (const path of required) await access(path);

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const expected = ['apps/*', 'services/*', 'packages/*'];
if (JSON.stringify(pkg.workspaces) !== JSON.stringify(expected)) {
  throw new Error(`workspaces must equal ${JSON.stringify(expected)}`);
}
if (pkg.private !== true) throw new Error('root package must be private');
console.log('workspace-baseline=ok');
