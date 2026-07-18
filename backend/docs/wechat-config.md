# 微信登录 / 订阅消息 / 合规配置指南

本文档说明排班小程序接入微信生态所需的后台配置，与 `backend/.env.example` 中的环境变量一一对应。前端调用示例见 `miniprogram/services/notify.js`。**本产品不接入微信支付。**

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

## 二、微信支付（已明确不做）

产品决策：**不接入微信支付**。后端无 `/payments/*` 路由，无商户密钥配置，前端无 `services/payments.js`。若未来要做增值能力，再单独设计，不要从历史分支恢复半成品支付代码。

---

## 三、
## 三、订阅消息（一次性订阅）

### 3.1 已选用模板（本项目）

| 公众平台名称 | 模板 ID | 环境变量 / 前端字段 | 业务场景 |
| --- | --- | --- | --- |
| 排班加入通知 | `mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg` | `WX_TMPL_TASK_PUBLISHED` / `WX_TMPL_GROUP_JOINED` · `taskPublished` / `groupJoined` | 发布排班、加入分组 |
| 未提交日志 | `JQYOa6W-Fq1qZBSvJVD3vVRxfm2iQ2IaYQs-ex5DYic` | `WX_TMPL_DEADLINE_REMIND` · `deadlineRemind` | 填报截止/未提交提醒 |

写入位置：
- 后端 `.env`（见 `.env.example`）
- 小程序 `miniprogram/utils/config.js` → `subscribeTemplateIds`

**MVP 够用：2 个即可。** 可选再加（非必须）：
- 异议处理结果通知（有人提异议 / 发布者处理后）
- 方案生成完成（异步生成耗时较长时）

显式写空 `WX_TMPL_TASK_PUBLISHED=` 可强制仅站内 inbox。  
`GET /api/v1/meta/notify-templates` 可查看当前 mode（`wechat_subscribe` / `inbox_only`）。

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
| `WX_TMPL_TASK_PUBLISHED` | 排班加入/发布通知模板 ID |
| `WX_TMPL_GROUP_JOINED` | 加入分组通知（可与上一项同 ID） |
| `WX_TMPL_DEADLINE_REMIND` | 未提交/截止提醒模板 ID |
| `DEADLINE_REMIND_HOURS` | 截止前提醒提前小时数 |
| `SHARE_TOKEN_TTL` | 分享只读 token 有效期（秒，默认 7 天） |
| `JWT_SECRET` / `JWT_ACCESS_EXPIRE` / `JWT_REFRESH_EXPIRE` | 登录态签发与刷新 |

> 部署到 CloudBase 云函数时，通过「云函数 → 配置 → 环境变量」注入上述值，无需改代码；详见 `README.md` 的「数据库与环境变量切换」。

---

## 六、上架前自查清单
- [ ] request 合法域名已配且为 HTTPS
- [x] 确认产品不做支付，代码与配置无商户密钥残留
- [x] 订阅消息模板 ID 已配置（排班加入 + 未提交日志）
- [ ] 《隐私保护指引》已发布，隐私弹窗已接入
- [ ] 真机（iOS + Android）登录、分享、订阅全链路自测通过
- [ ] 后端错误码与前端 Toast 文案对齐（`API.md` 统一错误码表）
