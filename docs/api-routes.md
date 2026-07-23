# 前后端路由对照表

> 后端路由以 NestJS 启动日志 `[RouterExplorer] Mapped` 为准。
> 前端调用以 `utils/api.js` 实际路径为准。
> ⚠️ 后端改路由必须同步更新此表+前端代码。

## 认证

| 方法 | 后端路由 | 前端调用 | 状态 |
|------|----------|---------|------|
| POST | `/api/v1/auth/wechat/login` | `POST /auth/wechat/login` | ✅ |
| POST | `/api/v1/auth/wechat/phone-login` | `POST /auth/wechat/phone-login` | ✅ |
| POST | `/api/v1/auth/refresh` | `POST /auth/refresh` | ✅ |
| POST | `/api/v1/auth/logout` | — | — |

## 分组

| 方法 | 后端路由 | 前端调用 | 状态 |
|------|----------|---------|------|
| GET | `/api/v1/groups` | `GET /groups` | ✅ |
| POST | `/api/v1/groups` | `POST /groups` | ✅ |
| GET | `/api/v1/groups/:groupId` | `GET /groups/:groupId` | ✅ |
| GET | `/api/v1/groups/:groupId/members` | `GET /groups/:groupId/members` | ✅ |
| POST | `/api/v1/groups/join` | `POST /groups/join` | ✅ |

## 排班任务

| 方法 | 后端路由 | 前端调用 | 状态 |
|------|----------|---------|------|
| POST | `/api/v1/groups/:groupId/tasks` | `POST /groups/:groupId/tasks` | ✅ |
| GET | `/api/v1/groups/:groupId/tasks` | `GET /groups/:groupId/tasks` | ✅ |
| GET | `/api/v1/tasks/:taskId` | `GET /tasks/:taskId` | ✅ |
| GET | `/api/v1/tasks/:taskId/collection` | `GET /tasks/:taskId/collection` | ✅ |
| POST | `/api/v1/tasks/:taskId/availability` | `POST /tasks/:taskId/availability` | ✅ |
| GET | `/api/v1/tasks/:taskId/availability/me` | `GET /tasks/:taskId/availability/me` | ✅ |
| POST | `/api/v1/tasks/:taskId/solve` | `POST /tasks/:taskId/solve` | ✅ |
| POST | `/api/v1/tasks/:taskId/publish` | `POST /tasks/:taskId/publish` | ✅ |
| GET | `/api/v1/tasks/:taskId/schedule` | `GET /tasks/:taskId/schedule` | ✅ |
| GET | `/api/v1/users/me/schedule` | `GET /users/me/schedule` | ✅ |

## Catalog

| 方法 | 后端路由 | 前端调用 | 状态 |
|------|----------|---------|------|
| GET | `/api/v1/catalog/task-create` | `GET /catalog/task-create` | ✅ |
| GET | `/api/v1/catalog/campus-schedule-presets` | — | — |

## 管理

| 方法 | 后端路由 | 前端调用 | 状态 |
|------|----------|---------|------|
| GET | `/api/v1/admin/overview` | — | — |
| GET | `/api/v1/admin/users` | — | — |

## 变更记录

| 日期 | 变更 | 影响 |
|------|------|------|
| 2026-07-23 | 前端 `/scheduling/assignments/me` → `/users/me/schedule` | 修复我的页面404 |
| 2026-07-23 | 前端 `/groups/join` 对齐后端 `/api/v1/groups/join` | 修复加入分组404 |
