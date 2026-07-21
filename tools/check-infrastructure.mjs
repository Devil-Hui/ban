import { execFileSync } from 'node:child_process';

const services = ['mysql', 'redis', 'minio'];
for (const service of services) {
  const id = execFileSync('docker', ['compose', 'ps', '-q', service], { encoding: 'utf8' }).trim();
  if (!id) throw new Error(`${service} container is not running`);
  const health = execFileSync(
    'docker',
    ['inspect', '--format', '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}', id],
    { encoding: 'utf8' },
  ).trim();
  if (!['healthy', 'running'].includes(health)) throw new Error(`${service} health=${health}`);
}
console.log('infrastructure=healthy');
