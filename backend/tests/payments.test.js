'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { setup, request } = require('./helpers');
const { setPayCallbackVerifier } = require('../src/core/auth');

test('支付下单：小程序端返回 prepayId（无 mwebUrl）', async () => {
  setup();
  const token = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const res = await request('POST', '/api/v1/payments/orders', { token, body: { amount: 9.9 } });
  assert.ok(res.orderId);
  assert.ok(res.prepayId);
  assert.strictEqual(res.channel, 'wechat_mini');
  assert.strictEqual(res.mwebUrl, undefined);
});

test('支付下单：H5 端返回 mwebUrl', async () => {
  setup();
  const token = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const res = await request('POST', '/api/v1/payments/orders', {
    token,
    headers: { 'x-client-type': 'h5' },
    body: { amount: 9.9 },
  });
  assert.strictEqual(res.channel, 'wechat_h5');
  assert.ok(res.mwebUrl);
});

test('支付回调：验签通过后将订单置为已支付', async () => {
  setup();
  setPayCallbackVerifier(() => true); // 测试注入：始终验签通过
  const token = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const order = await request('POST', '/api/v1/payments/orders', { token, body: { amount: 9.9 } });
  const cb = await request('POST', '/api/v1/payments/notify', { body: { outTradeNo: order.orderId } });
  assert.strictEqual(cb.received, true);
  const got = (await request('GET', `/api/v1/payments/orders/${order.orderId}`, { token })).order;
  assert.strictEqual(got.status, 'paid');
});

test('支付回调：验签失败返回 1803', async () => {
  setup();
  setPayCallbackVerifier(() => false);
  await assert.rejects(
    () => request('POST', '/api/v1/payments/notify', { body: { outTradeNo: 'o_x' } }),
    (e) => e.code === 1803
  );
});

test('订单查询：非本人订单返回 4030', async () => {
  setup();
  const t1 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u1' } })).accessToken;
  const t2 = (await request('POST', '/api/v1/auth/miniprogram/login', { body: { code: 'u2' } })).accessToken;
  const order = await request('POST', '/api/v1/payments/orders', { token: t1, body: { amount: 1 } });
  await assert.rejects(
    () => request('GET', `/api/v1/payments/orders/${order.orderId}`, { token: t2 }),
    (e) => e.code === 4030
  );
});
