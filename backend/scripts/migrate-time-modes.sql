-- 已有库增量迁移（可重复执行需人工确认）
-- 1) tasks 增加 time_mode / schedule_profile_*
ALTER TABLE `tasks`
  ADD COLUMN IF NOT EXISTS `time_mode` VARCHAR(32) NOT NULL DEFAULT 'section_range' COMMENT 'section|range|section_range' AFTER `mode`,
  ADD COLUMN IF NOT EXISTS `schedule_profile_id` VARCHAR(64) DEFAULT NULL AFTER `time_mode`,
  ADD COLUMN IF NOT EXISTS `schedule_profile_version` INT DEFAULT NULL AFTER `schedule_profile_id`;

-- 若 MySQL 版本不支持 IF NOT EXISTS 列语法，请改用：
-- ALTER TABLE tasks ADD COLUMN time_mode VARCHAR(32) NOT NULL DEFAULT 'section_range';
-- ALTER TABLE tasks ADD COLUMN schedule_profile_id VARCHAR(64) DEFAULT NULL;
-- ALTER TABLE tasks ADD COLUMN schedule_profile_version INT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS `schedule_profiles` (
  `id`          VARCHAR(64)  NOT NULL,
  `name`        VARCHAR(128) NOT NULL,
  `scope`       ENUM('system','group') NOT NULL DEFAULT 'system',
  `group_id`    BIGINT       DEFAULT NULL,
  `slots`       JSON         NOT NULL,
  `version`     INT          NOT NULL DEFAULT 1,
  `status`      ENUM('active','archived') NOT NULL DEFAULT 'active',
  `is_default`  TINYINT(1)   NOT NULL DEFAULT 0,
  `description` VARCHAR(512) DEFAULT NULL,
  `source_profile_id` VARCHAR(64) DEFAULT NULL,
  `locale`      VARCHAR(16)  DEFAULT 'zh-CN',
  `tags`        JSON         DEFAULT NULL,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scope_status` (`scope`, `status`),
  KEY `idx_group_id` (`group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_settings` (
  `k` VARCHAR(64) NOT NULL,
  `v` VARCHAR(255) NOT NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
