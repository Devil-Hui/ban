# 排班运维台（admin-web）

H5 最小运维前端：登录、平台默认 timeMode/profile、系统作息模板只读列表、订阅模板状态。

## 启动

```bash
# 终端 1：后端
cd backend
npm run dev
# 或 npm run dev:mysql

# 终端 2：运维台
cd admin-web
npm install
npm run dev
```

浏览器打开 http://127.0.0.1:5173

默认账号密码见 `backend/.env` / `.env.example` 的 `H5_ADMIN_USER` / `H5_ADMIN_PASS`（示例 `admin` / `admin123`）。

Vite 已将 `/api` 代理到 `http://127.0.0.1:3000`。

## API

- `POST /api/v1/auth/h5/login`
- `GET  /api/v1/admin/overview`
- `GET  /api/v1/admin/settings`
- `PUT  /api/v1/admin/settings`
- `GET  /api/v1/schedule-profiles`
- `GET  /api/v1/meta/notify-templates`

## 构建

```bash
npm run build
```

产物在 `dist/`，可挂到任意静态服务器；需自行把 `/api` 反代到后端。
