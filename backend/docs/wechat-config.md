# 微信支付 / 订阅消息 / 合规配置指南

本文档说明排班小程序接入微信生态所需的后台配置，与 `backend/.env.example` 中的环境变量一一对应。前端调用示例见 `miniprogram/services/payments.js` 与 `miniprogram/services/notify.js`。

---

## 一、小程序后台基础配置

进入 **微信公众平台 → 开发 → 开发管理 → 开发设置**：

| 配置项 | 说明 | 对应变量 |
| --- | --- | --- |
| 小程序 AppID | 唯一标识 | `WX_APPID` |
| AppSecret | 用于 `wx.login` code 换 openid（服务端调用 `code2Session`） | `WX_SECRET` |

### 1.1 服务器域名（必须 HTTPS）
**开发 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名** 添加：
```
https://api.example.com
```
- 所有 `wx.request` 的 `BASE_URL` 必须在此白名单内，否则真机请求被拦截。
- 本地联调：开发版可在「微信开发者工具 → 详情 → 本地设置」勾选 **不校验合法域名**；但提交审核/生产必须配置。
- uploadFile / downloadFile 域名按需添加（本项目的日历 OCR 走普通 request，无需单独配）。

### 1.2 成员与权限
- 体验版/开发版可在「成员管理」添加开发者微信号，便于真机预览。
- 「业务域名」仅在使用 `web-view` 嵌 H5 时需要（本项目 H5 分享页用 `web-view` 嵌入时再配）。

---

## 二、微信支付配置（小程序端）

### 2.1 申请与参数
1. **微信支付商户号（MCH_ID）**：在 [pay.weixin.qq.com](https://pay.weixin.qq.com) 申请，绑定同主体小程序。
2. 在商户平台 **API 安全** 中设置：
   - **APIv2 密钥（商户密钥）** → `WX_MCH_KEY`（用于 `signType=MD5` 签名）
   - **APIv3 密钥** 与 **API 证书（apiclient_cert.pem / apiclient_key.pem）**（用于 `signType=RSA`、退款、账单下载）
   - 本项目后端默认采用 **RSA** 签名（与 `services/payments.js` 中 `signType:'RSA'` 一致），请配置 APIv3 密钥并把证书放到后端安全目录，**切勿入库**（`.gitignore` 已忽略密钥）。
3. **支付结果回调地址** → `WX_PAY_NOTIFY_URL`，需为公网 HTTPS 且返回 `<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>`。后端 `POST /api/v1/payments/notify` 已实现验签（见 `backend/src/core/auth.js` 的 `verifyWxPayCallback`，verifier 可注入测试）。

### 2.2 前端支付链路
```
services/payments.js: createOrder({ groupId?, taskId?, amount, channel:'wechat_mini' })
  → POST /payments/orders
  → 后端调用微信「JSAPI 统一下单」拿到 prepay_id，服务端签名返回 5 个参数
  → pay(payment) 调 wx.requestPayment({ timeStamp, nonceStr, package, signType, paySign })
  → 成功回调 → 后端异步收到 /payments/notify 置订单为 paid
```
- **务必在 `wx.requestPayment` 的 `fail` 中区分「用户取消」与「支付失败」**（代码已处理 `errMsg.includes('cancel')`）。
- 金额以 **分** 为单位传给后端，避免浮点误差。

### 2.3 H5 支付差异（双端区分）
- 小程序：`trade_type=JSAPI`，返回 `prepay_id` + 前端签名 → `wx.requestPayment`。
- H5（运维/分享页）：`trade_type=MWEB`，后端返回 `mweb_url`，由 H5 页面跳转。渠道由请求头 `X-Client-Type` 区分（见 `API.md` 双端差异表）。

---

## 三、订阅消息（一次性订阅）

### 3.1 申请模板
**微信公众平台 → 功能 → 订阅消息 → 我的模板**，选用/申请以下类型（改为你自己的模板 ID）：
- 排班发布通知（`TEMPLATE_ID_TASK_PUBLISHED`）
- 截止提醒（`TEMPLATE_ID_DEADLINE_REMIND`）

把真实 ID 填入 `miniprogram/utils/config.js` 的 `subscribeTemplateIds`。

### 3.2 触发时机（转化率最高原则）
`wx.requestSubscribeMessage` **必须由用户点击行为触发**，不能在 onLoad 里静默弹。本项目在以下高意图节点调用（见 `services/notify.js` 的 `subscribe`）：
- **发布排班成功后**（`pages/task` 的 `onPublish`）—— 发布者最关心「谁没填」，顺势请求订阅。
- **提交意愿后** 也可请求「截止提醒」。

调用后把用户「接受」的模板 ID 上报后端 `POST /notify/subscribe`，便于后续定向推送（后端仅存授权结果，不存敏感信息）。

### 3.3 下发
后端通过 `subscribeMessage.send` 给用户推送（需用户此前已授权该模板）。注意一次性订阅**每次授权仅能下发 1 条**，长期触达需引导用户多次授权或改用「服务通知」能力。

---

## 四、隐私与合规（PIPL / 微信平台要求）

1. **隐私协议**：在 **微信公众平台 → 设置 → 服务内容/用户隐私保护指引** 填写《隐私保护指引》，并配置小程序内的隐私弹窗。调用 `wx.getUserProfile`、`wx.chooseAddress` 等涉及用户信息的接口前须完成授权说明。
2. **用户授权顺序**：本项目 `utils/auth.js` 的 `loginWithProfile` 在用户点击「微信登录」按钮后才调 `wx.getUserProfile`，符合「先告知后收集」。
3. **数据最小化**：后端 `users.phone_masked` 仅存脱敏号；真实手机号加密存储；`is_blacklisted`、`banned_reason` 用于内容安全与风控。
4. **内容安全**：用户生成的排班备注、异议内容含 UGC，生产环境调用微信 `msgSecCheck` / `imgSecCheck` 做前置审核（后端 `core` 预留接口位）。
5. **注销与导出**：依 PIPL 提供账号注销与数据导出（接口已在 `api-spec.md` 规划，H5 运维端落地）。

---

## 五、环境变量对照（backend/.env.example）

| 变量 | 用途 |
| --- | --- |
| `WX_APPID` / `WX_SECRET` | 小程序身份与 code2Session |
| `WX_MCH_ID` | 微信支付商户号 |
| `WX_MCH_KEY` | 商户 API 密钥（RSA 签名用 APIv3 密钥，此处作兼容字段） |
| `WX_PAY_NOTIFY_URL` | 支付结果回调公网地址 |
| `SHARE_TOKEN_TTL` | 分享只读 token 有效期（秒，默认 7 天） |
| `JWT_SECRET` / `JWT_ACCESS_EXPIRE` / `JWT_REFRESH_EXPIRE` | 登录态签发与刷新 |

> 部署到 CloudBase 云函数时，通过「云函数 → 配置 → 环境变量」注入上述值，无需改代码；详见 `README.md` 的「数据库与环境变量切换」。

---

## 六、上架前自查清单
- [ ] request 合法域名已配且为 HTTPS
- [ ] 微信支付商户号已绑定、回调地址可达且验签通过
- [ ] 订阅消息模板 ID 已替换为真实值
- [ ] 《隐私保护指引》已发布，隐私弹窗已接入
- [ ] 真机（iOS + Android）登录、支付、分享、订阅全链路自测通过
- [ ] 后端错误码与前端 Toast 文案对齐（`API.md` 统一错误码表）
