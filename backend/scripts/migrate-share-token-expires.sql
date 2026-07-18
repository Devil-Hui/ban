-- 增量：分享 token 过期时间。若列已存在会报错，可忽略。
ALTER TABLE `tasks`
  ADD COLUMN `share_token_expires_at` DATETIME(3) DEFAULT NULL COMMENT '分享 token 过期(UTC)' AFTER `share_token`;
