const base = process.env.API_BASE_URL || 'http://127.0.0.1:3010/api/v1';

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(options.token ? { authorization: `Bearer ${options.token}` } : {}), ...(options.body ? { 'content-type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const expect = (value, message) => { if (!value) throw new Error(message); };
const ownerLogin = await call('/auth/wechat/login', { method: 'POST', body: { code: 'mock:U03' } });
const memberLogin = await call('/auth/wechat/login', { method: 'POST', body: { code: 'mock:U04' } });
const owner = ownerLogin.accessToken;
const member = memberLogin.accessToken;
const group = await call('/groups', { method: 'POST', token: owner, body: { name: `http-flow-${Date.now()}` } });
await call('/groups/join', { method: 'POST', token: member, body: { inviteCode: group.inviteCode, displayName: 'flow-member' } });
const template = await call(`/groups/${group.id}/templates`, { method: 'POST', token: owner, body: { name: 'flow-template', templateType: 'school_section', periods: [{ code: 'p1', label: 'first', startMinute: 480, endMinute: 540, minPeople: 1, targetPeople: 1, maxPeople: 1 }] } });
const task = await call(`/groups/${group.id}/tasks`, { method: 'POST', token: owner, body: { title: 'HTTP flow', templateId: template.id, dateStart: '2099-08-01', dateEnd: '2099-08-01', deadline: '2099-07-31T12:00:00.000Z' } });
const detail = await call(`/tasks/${task.id}`, { token: member });
const entries = detail.slots.map((slot) => ({ slotId: slot.id, state: 'preferred' }));
await call(`/tasks/${task.id}/availability`, { method: 'POST', token: member, body: { entries } });
await call(`/tasks/${task.id}/fixed-assignments`, { method: 'PATCH', token: owner, body: { assignments: detail.slots.map((slot) => ({ slotId: slot.id, userId: memberLogin.user.id })) } });
const job = await call(`/tasks/${task.id}/solve`, { method: 'POST', token: owner, headers: { 'idempotency-key': `http-flow-${Date.now()}` } });
let completed;
for (let attempt = 0; attempt < 60; attempt += 1) {
  completed = await call(`/tasks/${task.id}/solve/${job.id}`, { token: owner });
  if (completed.status === 'completed' || completed.status === 'failed') break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
expect(completed.status === 'completed', `solver did not complete: ${completed.status}`);
const candidates = await call(`/tasks/${task.id}/solve/${job.id}/candidates`, { token: owner });
expect(candidates.length > 0, 'solver returned no candidates');
const assignments = Object.entries(candidates[0].assignments).flatMap(([slotId, userIds]) => userIds.map((userId) => ({ slotId, userId })));
const firstVersion = await call(`/tasks/${task.id}/publish`, { method: 'POST', token: owner, body: { assignments } });
const share = await call(`/tasks/${task.id}/versions/${firstVersion.versionId}/shares`, { method: 'POST', token: owner, body: { expiresInHours: 2 } });
await call(`/public/shares/${share.token}`);
await call(`/tasks/${task.id}/versions/${firstVersion.versionId}/receipt`, { method: 'POST', token: member });
const objection = await call(`/tasks/${task.id}/versions/${firstVersion.versionId}/objections`, { method: 'POST', token: member, body: { reason: 'HTTP flow adjustment' } });
const listed = await call(`/tasks/${task.id}/versions/${firstVersion.versionId}/objections`, { token: owner });
expect(listed.some((item) => item.id === objection.id), 'objection not listed');
await call(`/tasks/${task.id}/versions/${firstVersion.versionId}/objections/${objection.id}`, { method: 'PATCH', token: owner, body: { status: 'accepted', note: 'replace assignment' } });
await call(`/tasks/${task.id}/fixed-assignments`, { method: 'PATCH', token: owner, body: { assignments: [] } });
const secondVersion = await call(`/tasks/${task.id}/publish`, { method: 'POST', token: owner, body: { assignments: detail.slots.map((slot) => ({ slotId: slot.id, userId: group.ownerId })) } });
expect(secondVersion.versionNumber === firstVersion.versionNumber + 1, 'version did not increment');
const revoked = await fetch(`${base.replace(/\/api\/v1$/, '')}/api/v1/public/shares/${share.token}`);
expect(revoked.status === 404, `old share remained active: ${revoked.status}`);
console.log('scheduling-http-flow: PASS');
