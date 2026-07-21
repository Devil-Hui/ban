# 智能排班小程序

本仓库只维护一套现行源码。所有代码均从仓库根目录引用，不使用 `new`、worktree 或目录链接作为运行入口。

## 目录

| 目录 | 用途 |
| --- | --- |
| `apps/miniprogram` | 微信小程序，微信开发者工具应打开此目录 |
| `apps/admin-web` | 管理端 Web 应用 |
| `services/api` | NestJS + Fastify API |
| `services/deadline-worker` | 截止时间与提醒任务 |
| `services/notification-worker` | 微信订阅消息发送任务 |
| `services/scheduler` | 排班求解服务 |
| `packages/contracts` | 跨服务共享契约 |
| `infra` | MySQL、Nginx 等基础设施配置 |
| `tools` | 初始化、检查和冒烟验证工具 |
| `docs` | 产品、架构、接口、部署与实施文档 |

## 开发环境

1. 使用 `.env.example` 初始化本地 `.env`。
2. 运行 `npm install`。
3. 运行 `npm run infra:up` 和 `npm run db:migrate`。
4. 运行 `npm run dev:api`。
5. 微信开发者工具打开 `apps/miniprogram`。

开发版依据微信 `envVersion=develop` 使用本地 API，默认采用 mock 登录；可通过小程序开发设置覆盖 API 地址或切换真实微信登录。

## 上线环境

1. 以 `.env.production.example` 创建部署环境变量，密钥不得提交到 Git。
2. 使用 `docker-compose.production.yml` 启动生产服务。
3. 小程序体验版和正式版必须通过 `extConfig.apiBaseUrl` 提供 HTTPS API 地址。
4. 体验版和正式版强制使用真实微信登录，后端设置 `WECHAT_MODE=production`。

开发版与上线版共用同一套源码，通过环境变量、Compose 配置和微信版本标识切换。

## 本地资源

小程序图标与字体必须放在 `apps/miniprogram/assets` 并使用本地路径。当前 TDesign 图标字体位于 `apps/miniprogram/assets/fonts/t.woff`，禁止改回 CDN 链接。

## 验证

```sh
npm run check:workspace
npm run build
npm test
```
