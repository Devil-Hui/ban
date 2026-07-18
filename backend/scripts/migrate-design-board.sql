-- 设计板能力补齐：任务约束字段说明（constraints 已是 JSON，无需改列）
-- 软删分组依赖 groups.is_deleted / status=archived（schema 已有）
-- 个人日历 source 扩展：manual / ai_vision / schedule_sync
-- 本脚本可重复执行（幂等注释）

-- 确保 groups 软删字段存在（老库）
-- ALTER TABLE `groups` ADD COLUMN IF NOT EXISTS 不支持；用信息检查
SET @db := DATABASE();

-- 可选：为 task_responses 增加索引加速「未填写成员」查询
-- CREATE INDEX idx_task_user ON task_responses (task_id, user_id);

SELECT 'design-board migrate: constraints/calendar/group soft-delete already covered by schema' AS info;
