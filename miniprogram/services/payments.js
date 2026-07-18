// services/payments.js — 微信支付（小程序端）
const { get, post } = require('../utils/request');

/**
 * 创建订单
 * @param {Object} data { groupId?, taskId?, amount(分), channel:'wechat_mini' }
 * 后端返回：{ orderId, channel, payment: { timeStamp, nonceStr, package, signType, paySign } }
 */
const createOrder = (data) => post('/payments/orders', Object.assign({ channel: 'wechat_mini' }, data));

const getOrder = (orderId) => get(`/payments/orders/${orderId}`);

/**
 * 拉起微信支付
 * @param {Object} payment 后端返回的 payment 字段（5 个签名参数）
 * @returns Promise<{ success:boolean, reason?:string }>
 */
const pay = (payment) =>
  new Promise((resolve) => {
    if (!payment || !payment.package) {
      return resolve({ success: false, reason: 'no_payment' });
    }
    wx.requestPayment({
      timeStamp: String(payment.timeStamp),
      nonceStr: payment.nonceStr,
      package: payment.package,
      signType: payment.signType || 'RSA',
      paySign: payment.paySign,
      success: () => resolve({ success: true }),
      fail: (err) => {
        const cancelled = (err && (err.errMsg || '').includes('cancel')) || false;
        resolve({ success: false, reason: cancelled ? 'cancelled' : 'failed', detail: err });
      },
    });
  });

// 便捷：创建并立即支付
const createAndPay = (data) =>
  createOrder(data).then((res) => pay(res.payment).then((r) => Object.assign({ orderId: res.orderId }, r)));

module.exports = { createOrder, getOrder, pay, createAndPay };
