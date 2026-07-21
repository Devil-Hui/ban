const base = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

async function get(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
  return { status: response.status, body: await response.json(), requestId: response.headers.get('x-request-id') };
}

const live = await get('/health/live');
if (live.status !== 200 || live.body.status !== 'ok') throw new Error(`live failed: ${JSON.stringify(live)}`);

const ready = await get('/health/ready');
if (ready.status !== 200 || ready.body.status !== 'ready') throw new Error(`ready failed: ${JSON.stringify(ready)}`);
if (!ready.requestId) throw new Error('x-request-id header missing');

console.log('foundation-smoke=ok');
