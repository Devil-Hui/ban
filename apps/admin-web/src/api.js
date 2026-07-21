import { buildAdminLoginPayload, resolveApiBaseUrl } from "./runtime-config";

export const apiBaseUrl = resolveApiBaseUrl({ configured: import.meta.env.VITE_API_BASE_URL, isDevelopment: import.meta.env.DEV });
export const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

export async function login(username, password, totpCode) {
  if (!apiBaseUrl) throw new Error("运营 API 地址未配置");
  const response = await fetch(`${apiBaseUrl}/admin/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildAdminLoginPayload(username, password, totpCode)),
  });
  if (!response.ok) throw new Error("账号或密码不正确");
  return response.json();
}

export async function adminGet(path, accessToken) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("无法加载运营数据");
  return response.json();
}
export async function adminPost(path, accessToken, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("操作未完成");
  return response.status === 204 ? null : response.json();
}
export async function adminPatch(path, accessToken, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("操作未完成");
  return response.status === 204 ? null : response.json();
}
