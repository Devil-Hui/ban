# 排班小程序后端（scheduling-miniprogram-backend）

微信小程序 + H5 运维端的后端 API。RESTful 风格，支持双端（小程序 `miniprogram` / H5 `h5`），可运行于本地 Express 或微信云开发 CloudBase 云函数，逻辑与数据链完整（麻雀虽小五脏俱全）。

## 目录结构

```
backend/
├── package.json
├── .env.example                # 环境变量示例（复制为 .env 按需修改）
├── config.js                   # 统一配置：env/DB/JWT/微信/H5/限流…
├── openapi.yaml                # OpenAPI 3.0（Apifox 可导入）
├── API.md                      # 中文接口文档（参数/返回/错误码）
├── src/
│   ├── core/                   # 基础设施
│   │   ├── errors.js           # 分层业务错误码 + ApiError
│   │   ├── response.js         # 统一响应包络
│   │   ├── db.js               # mysql2 连接池 + 事务封装（lazy require）
│   │   ├── auth.js             # JWT(HS256) + wx.login + H5 登录
│   │   ├── context.js          # 请求→ctx 适配（client-type/鉴权）
│   │   └── validate.js         # 轻量参数校验
│   ├── repositories/           # 数据访问层（可替换）
│   │   ├── memory.js           # 内存实现（测试/无DB本地运行）
│   │   ├── mysql.js            # MySQL 实现（生产，事务发布）
│   │   └── index.js            # 按 DB_MODE 选择 + setRepos 注入
│   ├── handlers/               # 业务逻辑（框架无关：ctx => data）
│   │   ├── auth / users / groups / tasks / responses
│   │   └── receipts / preview / notify
│   └── server/
│       ├── routes.js           # 统一路由表（Express/云函数共用）
│       ├── express.js          # 本地 Express 服务
│       └── cloud-function.js    # 云函数入口（main）
└── tests/                      # node --test，零外部依赖
    ├── helpers.js
    ├── auth.test.js / groups.test.js / tasks.test.js
    ├── flow.test.js            # 端到端逻辑链+数据链
    └── schedule-profiles / time-domain
```

## 快速开始

```bash
# 安装依赖（仅本地服务/生产需要；测试无需安装）
npm install

# 内存模式启动（无需数据库）
npm run dev
# → listening on :3000 (mode=memory)

# 运行测试（覆盖用户/分组/任务/时段模板/分享/消息；不含支付）
npm test
```

## 数据库切换（环境变量，无需改代码）

复制 `.env.example` 为 `.env` 并修改：

```ini
DB_MODE=mysql
DB_HOST=10.0.0.5
DB_PORT=3306
DB_USER=scheduler
DB_PASSWORD=******
DB_NAME=scheduling
```

代码侧 `src/config.js` 读取上述变量；`src/core/db.js` 据此建立连接池（字符集 `utf8mb4`、时区 `UTC`、连接池上限 `DB_POOL_LIMIT`）。切换连接地址**只改环境变量**，不触碰代码。

## 双端差异

通过请求头 `X-Client-Type` 区分：

- **鉴权**：小程序 `wx.login`+openid 签发 JWT；H5 账号密码签发 admin JWT。
- **分享**：小程序 `onShareAppMessage` 内页；H5 `GET /share/tasks/{id}?token=` 只读脱敏。
- **订阅**：小程序 `wx.requestSubscribeMessage` 回传受理；H5 走消息中心轮询。

## 部署

- **本地/容器**：`DB_MODE=mysql node src/server/express.js`
- **微信云开发/SCF**：将 `src/server/cloud-function.js` 的 `main` 作为入口；同一套 `handlers` + `routes` 无需改动。

## 一致性保障

- **乐观锁**：`tasks.version` 字段，并发更新冲突返回 `1307`。
- **事务**：发布方案（`publish`）在 `mysql.js` 中以事务原子写入 `tasks` + `user_assignments`。
- **异步 job**：方案生成/课表 OCR 走 `schedule_jobs`，前端轮询 `GET /jobs/{id}`。
- **软删除/审计**：成员退出/踢人仅改 `status`，历史数据保留。
