import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const target = new URL('../.env', import.meta.url);
const template = new URL('../.env.example', import.meta.url);
const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');
const replacements = {
  MYSQL_PASSWORD: secret(24),
  MYSQL_ROOT_PASSWORD: secret(32),
  MINIO_ACCESS_KEY: `minio_${randomBytes(8).toString('hex')}`,
  MINIO_SECRET_KEY: secret(32),
  ADMIN_BOOTSTRAP_PASSWORD: secret(24),
  TOKEN_SIGNING_SECRET: secret(48),
  PHONE_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
};

let content = await readFile(template, 'utf8');
for (const [name, value] of Object.entries(replacements)) {
  content = content.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${value}`);
}

await writeFile(target, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log('local-env=created path=.env');
