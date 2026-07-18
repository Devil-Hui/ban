'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { verifyToken } = require('../src/core/auth');
const { setup, request } = require('./helpers');

test('小程序登录：code 换 openid 并签发双 token', async () => {
  setup();
  const res = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'abc', nickname: '小明' } });
  assert.ok(res.accessToken);
  assert.ok(res.refreshToken);
  assert.strictEqual(res.tokenType, 'Bearer');
  assert.strictEqual(typeof res.expiresIn, 'number');
});

test('H5 登录：正确凭证返回 admin token', async () => {
  setup();
  const res = await request('POST', '/api/v1/auth/h5/login', { body: { username: 'admin', password: 'admin123' } });
  assert.ok(res.accessToken);
});

test('H5 登录：错误密码返回 4010', async () => {
  setup();
  await assert.rejects(
    () => request('POST', '/api/v1/auth/h5/login', { body: { username: 'admin', password: 'wrong' } }),
    (e) => e.code === 4010
  );
});

test('refresh：刷新出新的 access token', async () => {
  setup();
  const login = await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'x1' } });
  const res = await request('POST', '/api/v1/auth/refresh', { body: { refreshToken: login.refreshToken } });
  assert.ok(res.accessToken);
  // 同秒内生成的 token 内容可能一致，这里校验刷新出的 token 可解析且身份一致
  const payload = verifyToken(res.accessToken);
  assert.strictEqual(payload.userId, 'u_1');
  assert.strictEqual(payload.role, 'user');
});

test('无 token 访问受保护接口返回 4010', async () => {
  setup();
  await assert.rejects(() => request('GET', '/api/v1/users/me', {}), (e) => e.code === 4010);
});
