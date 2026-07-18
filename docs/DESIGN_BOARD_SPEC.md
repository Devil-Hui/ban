# 设计板一比一对照（根目录 PNG）

> 源文件：`ChatGPT Image 2026年7月18日 20_46_47.png`  
> 产品名：**智能排班小程序**

## 01 设计规范（已落到 token）

| 项 | 设计板 | 代码 |
|----|--------|------|
| 主色 | `#22C55E` | `app.wxss --c-primary` |
| 辅蓝 | `#3B82F6` | `--c-info` |
| 警告 | `#F59E0B` | `--c-warning` |
| 危险 | `#EF4444` | `--c-danger` |
| 中性灰 | `#64748B` 系 | `--c-text-2/3` |
| 圆角 | 4/6/8/12/16 | `--r-sm`…`--r-2xl` |
| 阴影 | 轻/中/深 | `--shadow-card/elevated` |
| Tab 选中 | 绿色 | `app.json selectedColor #22C55E` |

## 02 核心业务 ↔ API

| 流程 | 接口 |
|------|------|
| 创建分组 | `POST /groups` |
| 生成/分享邀请码 | 创建返回 `inviteCode` |
| 成员加入 | `POST /groups/join` |
| 配置参数建任务 | `POST /groups/:id/tasks`（constraints 含 slotMaxPeople/allowOvertime/slotDurationMinutes） |
| 填写可用时间 | `PUT /tasks/:id/responses/me` |
| 收集状态/未填名单 | `GET /groups/:id/unfilled-members?taskId=` |
| 提醒未填写 | `POST /groups/:id/remind-unfilled` |
| 删除分组 | `DELETE /groups/:id` body `{confirm:true}` |
| 智能排班/发布 | `POST /tasks/:id/scheme-jobs` · `POST /tasks/:id/publish` |
| 同步到日历 | `POST /users/me/calendar/sync-from-published` |
| 分享结果 | `GET /share/tasks/:id?token=` |

## 03 三种模板

| 设计板 | 代码 timeMode |
|--------|----------------|
| 时间轴模式 | `range` |
| 节次模式 | `section` |
| 自定义模式 | `section_range` / customRanges |

## 04 数据库

- `tasks.constraints` JSON：人数上下限、加班、时长等  
- `groups.is_deleted` + `status=archived`：删除分组  
- `personal_calendars`：同步班次 slots（source=`schedule_sync`）  
- 脚本：`scripts/migrate-design-board.sql`（说明性）

## 05 验证

```bash
cd backend
npm test          # 含 design-board-api
npm run smoke
```
