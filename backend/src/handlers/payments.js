'use strict';

/**
 * 支付模块。
 * 端差异：
 *  - 小程序端：创建订单后由客户端调用 wx.requestPayment（参数来自微信统一下单接口）；
 *    本接口返回 prepayId，客户端配合 wx.login 拿到的信息完成支付。
 *  - H5 端：返回 mwebUrl（微信 H5 支付中间页），用户点击跳转完成支付。
 * 回调：微信支付结果回调（无需登录态），验签后更新订单状态。
 */

const { required } = require('../core/validate');
const { err } = require('../core/errors');
const { verifyWxPayCallback } = require('../core/auth');
const { requireAuth } = require('./guard');

/** POST /api/v1/payments/orders */
async function createOrder(ctx) {
  const user = requireAuth(ctx);
  const { amount } = required(ctx.body, { amount: { type: 'number', label: 'amount', min: 0.01 } });
  // 端差异：渠道由 client-type 决定（默认小程序）
  const channel = ctx.clientType === 'h5' ? 'wechat_h5' : ctx.body.channel || 'wechat_mini';
  const repos = require('../repositories').getRepos();
  const order = await repos.payments.createOrder({ userId: user.userId, amount, channel });
  const data = { orderId: order.id, channel: order.channel, prepayId: order.prepayId };
  if (channel === 'wechat_h5') data.mwebUrl = order.mwebUrl;
  return data;
}

/** POST /api/v1/payments/notify —— 微信支付回调（无登录态） */
async function callback(ctx) {
  // 真实环境微信回调为 XML；此处按 JSON 约定处理，并支持注入验签。tests 注入 verifyPayCallback。
  const ok = verifyWxPayCallback(JSON.stringify(ctx.body), ctx.headers['x-wx-signature'] || '');
  if (!ok) throw err('PAY_CALLBACK_VERIFY_FAILED');
  const { outTradeNo } = required(ctx.body, { outTradeNo: { type: 'string', label: 'outTradeNo' } });
  const repos = require('../repositories').getRepos();
  const order = await repos.payments.getOrder(outTradeNo);
  if (!order) throw err('PAY_ORDER_NOT_FOUND');
  await repos.payments.updateOrder(outTradeNo, { status: 'paid' });
  // 微信要求返回成功标记；此处简化为 { received: true }
  return { received: true };
}

/** GET /api/v1/payments/orders/{order_id} */
async function getOrder(ctx) {
  const user = requireAuth(ctx);
  const repos = require('../repositories').getRepos();
  const order = await repos.payments.getOrder(ctx.params.orderId);
  if (!order) throw err('PAY_ORDER_NOT_FOUND');
  if (order.userId !== user.userId) throw err('FORBIDDEN');
  return { order };
}

module.exports = { createOrder, callback, getOrder };
