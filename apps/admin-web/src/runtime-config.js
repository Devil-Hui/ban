export function resolveApiBaseUrl({ configured, isDevelopment }) {
  const value = String(configured || '').trim().replace(/\/+$/, '');
  return value || (isDevelopment ? 'http://127.0.0.1:3010/api/v1' : '');
}

export function buildAdminLoginPayload(username, password, totpCode) {
  const payload = { username, password };
  const normalizedCode = String(totpCode || '').trim();
  if (normalizedCode) payload.totpCode = normalizedCode;
  return payload;
}
