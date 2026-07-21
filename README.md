# 智能排班小程序

> 校园/社团智能排班平台

## 技术栈

- **小程序端**：微信小程序 + TDesign 组件库
- **管理端**：React + Vite
- **后端**：NestJS / Fastify（Node.js）+ 微服务（deadline-worker / notification-worker / scheduler）
- **基础设施**：MySQL + Redis + MinIO
- **工程化**：npm workspaces monorepo + TypeScript

## 目录结构

```
排班小程序/
├── apps/
│   ├── miniprogram/        # 微信小程序（微信开发者工具打开此目录）
│   └── admin-web/          # 管理端（React + Vite）
├── services/
│   ├── api/                # NestJS/Fastify API
│   ├── deadline-worker/    # 截止提醒微服务
│   ├── notification-worker/# 通知投递微服务
│   └── scheduler/          # 排班求解微服务（Python）
├── packages/
│   └── contracts/          # 共享类型定义（@scheduling/contracts）
├── infra/
│   ├── mysql/              # MySQL 配置
│   └── nginx/              # Nginx 反向代理配置
├── tools/                  # 工作区校验、环境初始化、冒烟测试脚本
├── docs/                   # 规格与计划文档
├── package.json            # workspaces 根
├── tsconfig.base.json
├── docker-compose.yml              # 开发环境
└── docker-compose.production.yml   # 生产环境
```

> `apps/miniprogram/domain/` 为 DDD 领域层（纯业务函数，无 wx 依赖）；`apps/miniprogram/tools/` 为小程序构建脚本。两者均通过 `package.json` 配套调用。

## 本地开发

```bash
# 1. 安装依赖
npm install

# 2. 启动基础设施（MySQL / Redis / MinIO）
npm run infra:up

# 3. 数据库迁移
npm run db:migrate

# 4. 构建 contracts + api
npm run build

# 5. 启动 API（开发模式，端口 3010）
npm run dev:api

# 6. 健康检查
curl http://127.0.0.1:3010/health/live

# 7. 微信开发者工具打开 apps/miniprogram 目录
```

## 双版本切换

### 小程序端（envVersion 自动路由）

小程序的 `envVersion`（develop / trial / release）由微信运行时注入，`apps/miniprogram/utils/runtime-config.js` 自动路由 API 地址：

| 环境 | envVersion | API 地址来源 |
|------|------------|--------------|
| 开发版 | `develop` | `LOCAL_API_BASE_URL`（`http://127.0.0.1:3010/api/v1`） |
| 体验版 | `trial` | `PRODUCTION_API_BASE_URL`（或 extConfig 覆盖） |
| 正式版 | `release` | `PRODUCTION_API_BASE_URL`（或 extConfig 覆盖） |

> ⚠️ **上线前**：将 `apps/miniprogram/utils/runtime-config.js` 中的 `PRODUCTION_API_BASE_URL` 占位符替换为实际 HTTPS 域名，并在小程序后台「开发管理 → 服务器域名」配置 request 合法域名。

### 后端（开发 / 生产）

| 维度 | 开发环境 | 生产环境 |
|------|----------|----------|
| 环境文件 | `.env`（本地，不入库） | `.env.production`（本地，不入库） |
| 模板文件 | `.env.example` | `.env.production.example` |
| Compose 文件 | `docker-compose.yml` | `docker-compose.production.yml` |
| API_PORT | 3010 | 3000（容器内，nginx 反代） |

```bash
# 生产部署
cp .env.production.example .env.production   # 填写实际密钥
docker compose -f docker-compose.production.yml up -d --build
```

## 已移除的旧栈

以下旧目录已在本次重构中移除，代码已提升到 monorepo 根目录：

- `miniprogram/`（旧微信小程序）→ `apps/miniprogram/`
- `backend/`（旧 Express API）→ `services/api/`
- `admin-web/`（旧 H5 管理端）→ `apps/admin-web/`
- `shared/`（旧共享常量）→ `packages/contracts/`

历史文档见 `docs/superpowers/`（已标注归档）。

## 密钥管理

- `.env` / `.env.production` 不入库（已被 `.gitignore` 忽略）
- 参考 `.env.example` / `.env.production.example` 填写实际密钥
- 密钥占位项（如 `MYSQL_PASSWORD=`、`TOKEN_SIGNING_SECRET=`）需在本地填写实际值
