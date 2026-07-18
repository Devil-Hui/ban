-- =============================================================
-- 排班小程序 · MySQL 8.x 建库建表脚本
-- 规范参考：
--   · 阿里巴巴 Java 开发手册（数据库规约）：表名/字段小写下划线、必备 created_at/updated_at、
--     禁止物理删除优先软删、utf8mb4、InnoDB、合理索引、注释完整
--   · 大厂实践：业务主键 BIGINT、JSON 扩展字段、乐观锁 version、状态机 ENUM、
--     逻辑外键 + 关键物理外键、审计表、幂等唯一键
-- 契约对齐：src/repositories/memory.js / mysql.js
-- 字符集 utf8mb4 / 排序 utf8mb4_unicode_ci / 时区应用层 UTC
-- =============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ----------------------------
-- 0. 建库（本地开发库名 paiban；生产可改）
-- ----------------------------
CREATE DATABASE IF NOT EXISTS `paiban`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `paiban`;

-- ----------------------------
-- 1. 用户表（微信用户 + 后台管理员合表）
--    规约：openid 可空唯一；管理员走 username；软禁用 status/is_banned
-- ----------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `openid`        VARCHAR(64)   DEFAULT NULL COMMENT '微信 openid',
  `unionid`       VARCHAR(64)   DEFAULT NULL COMMENT '微信 unionid',
  `account_type`  ENUM('wechat','admin') NOT NULL DEFAULT 'wechat' COMMENT '账号类型',
  `username`      VARCHAR(64)   DEFAULT NULL COMMENT '管理员登录名',
  `password_hash` VARCHAR(128)  DEFAULT NULL COMMENT '管理员密码哈希',
  `nickname`      VARCHAR(64)   DEFAULT NULL COMMENT '昵称',
  `avatar_url`    VARCHAR(512)  DEFAULT NULL COMMENT '头像 URL',
  `phone_enc`     VARCHAR(128)  DEFAULT NULL COMMENT '手机号密文/脱敏',
  `is_banned`     TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否封禁 0否1是',
  `status`        TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1正常 0禁用',
  `banned_reason` VARCHAR(255)  DEFAULT NULL COMMENT '封禁原因',
  `is_deleted`    TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '逻辑删除 0否1是',
  `created_at`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at`    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_account_type_status` (`account_type`, `status`),
  KEY `idx_is_banned` (`is_banned`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户（微信/管理员）';

-- ----------------------------
-- 2. 分组
-- ----------------------------
CREATE TABLE IF NOT EXISTS `groups` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name`           VARCHAR(128) NOT NULL COMMENT '分组名称',
  `invite_code`    VARCHAR(16)  DEFAULT NULL COMMENT '邀请码',
  `mode`           VARCHAR(16)  NOT NULL DEFAULT 'shift' COMMENT '业务模式 timeline/shift/custom',
  `time_config`    JSON         DEFAULT NULL COMMENT '默认时段配置',
  `cycle_rule`     VARCHAR(16)  NOT NULL DEFAULT 'weekly' COMMENT '周期规则',
  `template_style` INT          NOT NULL DEFAULT 1 COMMENT '模板样式',
  `periods`        JSON         DEFAULT NULL COMMENT '默认时段定义',
  `created_by`     BIGINT UNSIGNED NOT NULL COMMENT '创建者用户ID',
  `status`         VARCHAR(16)  NOT NULL DEFAULT 'active' COMMENT 'active/archived',
  `version`        INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观锁版本',
  `is_deleted`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_code` (`invite_code`),
  KEY `idx_created_by` (`created_by`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='排班分组';

-- ----------------------------
-- 3. 分组成员（软删：left/kicked）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `group_members` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `group_id`       BIGINT UNSIGNED NOT NULL COMMENT '分组ID',
  `user_id`        BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `display_name`   VARCHAR(64)  DEFAULT NULL COMMENT '组内显示名',
  `role_in_group`  ENUM('publisher','member') NOT NULL DEFAULT 'member' COMMENT '组内角色',
  `status`         ENUM('active','left','kicked') NOT NULL DEFAULT 'active' COMMENT '成员状态',
  `is_blacklisted` TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否黑名单',
  `joined_at`      DATETIME(3)  DEFAULT NULL COMMENT '加入时间',
  `left_at`        DATETIME(3)  DEFAULT NULL COMMENT '退出时间',
  `kicked_at`      DATETIME(3)  DEFAULT NULL COMMENT '踢出时间',
  `kicked_reason`  VARCHAR(255) DEFAULT NULL COMMENT '踢出原因',
  `created_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_user` (`group_id`, `user_id`),
  KEY `idx_group_status` (`group_id`, `status`),
  KEY `idx_user_status` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='分组成员';

-- ----------------------------
-- 4. 排班任务（状态机 + 时段三模式快照）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `tasks` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `group_id`                 BIGINT UNSIGNED NOT NULL COMMENT '分组ID',
  `publisher_id`             BIGINT UNSIGNED NOT NULL COMMENT '发布者用户ID',
  `title`                    VARCHAR(128) NOT NULL COMMENT '任务标题',
  `description`              VARCHAR(512) DEFAULT NULL COMMENT '任务说明',
  `mode`                     VARCHAR(16)  NOT NULL DEFAULT 'shift' COMMENT '业务模式',
  `time_mode`                VARCHAR(32)  NOT NULL DEFAULT 'section_range' COMMENT 'section|range|section_range',
  `schedule_profile_id`      VARCHAR(64)  DEFAULT NULL COMMENT '来源作息模板ID',
  `schedule_profile_version` INT          DEFAULT NULL COMMENT '作息模板版本快照',
  `periods`                  JSON         DEFAULT NULL COMMENT '时段快照 TimeSlot[]',
  `constraints`              JSON         DEFAULT NULL COMMENT '约束 JSON：slotMinPeople/slotMaxPeople/maxShiftsPerWeek/maxShiftsPerDay/allowOvertime/slotDurationMinutes',
  `deadline`                 DATETIME(3)  DEFAULT NULL COMMENT '填报截止(UTC)',
  `date_range_start`         DATE         DEFAULT NULL COMMENT '排班开始日期',
  `date_range_end`           DATE         DEFAULT NULL COMMENT '排班结束日期',
  `cycle_rule`               VARCHAR(16)  DEFAULT 'weekly' COMMENT '循环规则',
  `status`                   ENUM('collecting','reviewing','adjusting','published','archived') NOT NULL DEFAULT 'collecting' COMMENT '任务状态',
  `candidate_schedules`      JSON         DEFAULT NULL COMMENT '候选方案',
  `final_schedule`           JSON         DEFAULT NULL COMMENT '最终方案',
  `previous_schedule`        JSON         DEFAULT NULL COMMENT '上一版方案',
  `share_token`              VARCHAR(64)  DEFAULT NULL COMMENT '分享只读 token',
  `share_token_expires_at`   DATETIME(3)  DEFAULT NULL COMMENT '分享 token 过期(UTC)',
  `generating_job_id`        BIGINT UNSIGNED DEFAULT NULL COMMENT '异步生成 job',
  `version`                  INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '乐观锁',
  `published_at`             DATETIME(3)  DEFAULT NULL COMMENT '发布时间',
  `is_deleted`               TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  `created_at`               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`               DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_group_status` (`group_id`, `status`),
  KEY `idx_publisher` (`publisher_id`),
  KEY `idx_deadline` (`deadline`),
  KEY `idx_time_mode` (`time_mode`),
  KEY `idx_date_range` (`date_range_start`, `date_range_end`),
  UNIQUE KEY `uk_share_token` (`share_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='排班任务';

-- ----------------------------
-- 5. 个人日历
-- ----------------------------
CREATE TABLE IF NOT EXISTS `personal_calendars` (
  `user_id`       BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `semester_name` VARCHAR(64)  DEFAULT NULL COMMENT '学期/日历名',
  `cycle_rule`    VARCHAR(16)  NOT NULL DEFAULT 'weekly' COMMENT '周期',
  `slots`         JSON         DEFAULT NULL COMMENT '忙闲 slots',
  `source`        VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT 'manual/ai_vision',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='个人日历';

-- ----------------------------
-- 6. 意愿填报（唯一约束防重复）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `task_responses` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`         BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
  `user_id`         BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `available_slots` JSON         DEFAULT NULL COMMENT '[{date,slots[]}]',
  `source`          VARCHAR(16)  NOT NULL DEFAULT 'manual' COMMENT 'manual/imported',
  `is_valid`        TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否有效',
  `created_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`, `user_id`),
  KEY `idx_task_valid` (`task_id`, `is_valid`),
  KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='空闲意愿填报';

-- ----------------------------
-- 7. 查收/异议
-- ----------------------------
CREATE TABLE IF NOT EXISTS `task_receipts` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`          BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
  `user_id`          BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `receipt_status`   VARCHAR(16)  NOT NULL DEFAULT 'pending' COMMENT 'pending/confirmed/objected',
  `objection_reason` VARCHAR(1024) DEFAULT NULL COMMENT '异议原因',
  `resolved`         TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '异议是否处理',
  `resolved_at`      DATETIME(3)  DEFAULT NULL COMMENT '处理时间',
  `created_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_user` (`task_id`, `user_id`),
  KEY `idx_task_resolved` (`task_id`, `resolved`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='查收与异议';

-- ----------------------------
-- 8. 消息收件箱
-- ----------------------------
CREATE TABLE IF NOT EXISTS `notify_inbox` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `user_id`     BIGINT UNSIGNED NOT NULL COMMENT '接收用户',
  `task_id`     BIGINT UNSIGNED DEFAULT NULL COMMENT '关联任务',
  `template_id` VARCHAR(64)  DEFAULT NULL COMMENT '模板标识',
  `title`       VARCHAR(128) DEFAULT NULL COMMENT '标题',
  `body`        VARCHAR(512) DEFAULT NULL COMMENT '正文',
  `is_read`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '已读',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_user_read_created` (`user_id`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内消息';

-- ----------------------------
-- 9. 异步任务（方案生成 / OCR）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `schedule_jobs` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `type`       VARCHAR(32) NOT NULL DEFAULT 'scheme_generate' COMMENT 'scheme_generate/calendar_ocr',
  `status`     ENUM('pending','running','success','succeeded','failed') NOT NULL DEFAULT 'pending' COMMENT '状态',
  `progress`   TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-100',
  `payload`    JSON         DEFAULT NULL COMMENT '入参',
  `result`     JSON         DEFAULT NULL COMMENT '结果',
  `error`      VARCHAR(512) DEFAULT NULL COMMENT '错误信息',
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (`id`),
  KEY `idx_status_created` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='异步任务';

-- 说明：产品不接入微信支付，故无 payments_orders 表。

-- ----------------------------
-- 10. 作息模板（系统种子 + 分组覆盖）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `schedule_profiles` (
  `id`                VARCHAR(64)  NOT NULL COMMENT '模板ID',
  `name`              VARCHAR(128) NOT NULL COMMENT '名称',
  `scope`             ENUM('system','group') NOT NULL DEFAULT 'system' COMMENT '作用域',
  `group_id`          BIGINT UNSIGNED DEFAULT NULL COMMENT '分组ID',
  `slots`             JSON         NOT NULL COMMENT 'TimeSlot[]',
  `version`           INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本',
  `status`            ENUM('active','archived') NOT NULL DEFAULT 'active',
  `is_default`        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否默认',
  `description`       VARCHAR(512) DEFAULT NULL,
  `source_profile_id` VARCHAR(64)  DEFAULT NULL COMMENT '导入来源模板',
  `locale`            VARCHAR(16)  DEFAULT 'zh-CN',
  `tags`              JSON         DEFAULT NULL,
  `is_deleted`        TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_scope_status` (`scope`, `status`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_is_default` (`is_default`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='作息模板';

-- ----------------------------
-- 12. 应用设置键值
-- ----------------------------
CREATE TABLE IF NOT EXISTS `app_settings` (
  `k`          VARCHAR(64)  NOT NULL COMMENT '配置键',
  `v`          VARCHAR(512) NOT NULL COMMENT '配置值',
  `remark`     VARCHAR(255) DEFAULT NULL COMMENT '说明',
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`k`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应用配置';

-- ----------------------------
-- 13. 分配快照（发布后写入）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `user_assignments` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`      BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
  `user_id`      BIGINT UNSIGNED NOT NULL COMMENT '用户ID',
  `date`         DATE         DEFAULT NULL COMMENT '值班日期',
  `period_id`    VARCHAR(64)  DEFAULT NULL COMMENT '时段ID',
  `period_name`  VARCHAR(64)  DEFAULT NULL COMMENT '时段名称快照',
  `group_name`   VARCHAR(128) DEFAULT NULL COMMENT '分组名冗余',
  `is_confirmed` TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否确认',
  `is_active`    TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '是否有效',
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_task_active` (`task_id`, `is_active`),
  KEY `idx_user_date_active` (`user_id`, `date`, `is_active`),
  KEY `idx_task_period` (`task_id`, `period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='排班分配快照';

-- ----------------------------
-- 14. 截止调度
-- ----------------------------
CREATE TABLE IF NOT EXISTS `countdowns` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `task_id`     BIGINT UNSIGNED NOT NULL COMMENT '任务ID',
  `type`        ENUM('reminder','deadline') NOT NULL DEFAULT 'reminder' COMMENT '类型',
  `trigger_at`  DATETIME(3)  NOT NULL COMMENT '触发时间UTC',
  `status`      ENUM('pending','done','cancelled') NOT NULL DEFAULT 'pending',
  `created_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_task_status` (`task_id`, `status`),
  KEY `idx_trigger_status` (`trigger_at`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='截止/提醒调度';

-- ----------------------------
-- 15. 推送发送队列
-- ----------------------------
CREATE TABLE IF NOT EXISTS `notify_queue` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `target_type`  ENUM('user','group','task') NOT NULL DEFAULT 'user',
  `target_id`    BIGINT UNSIGNED NOT NULL,
  `template_id`  VARCHAR(64)  NOT NULL,
  `payload`      JSON         DEFAULT NULL,
  `scheduled_at` DATETIME(3)  NOT NULL,
  `sent_at`      DATETIME(3)  DEFAULT NULL,
  `status`       ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending',
  `retry_count`  INT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_status_scheduled` (`status`, `scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订阅消息发送队列';

-- ----------------------------
-- 16. 审计日志（敏感操作）
-- ----------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `operator_id`  BIGINT UNSIGNED DEFAULT NULL COMMENT '操作人',
  `target_type`  VARCHAR(32)  NOT NULL COMMENT 'user/group/task/member',
  `target_id`    VARCHAR(64)  NOT NULL COMMENT '目标ID',
  `action`       VARCHAR(64)  NOT NULL COMMENT '动作',
  `before_value` JSON         DEFAULT NULL,
  `after_value`  JSON         DEFAULT NULL,
  `reason`       VARCHAR(512) DEFAULT NULL,
  `ip_address`   VARCHAR(64)  DEFAULT NULL,
  `request_id`   VARCHAR(64)  DEFAULT NULL,
  `created_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_operator_created` (`operator_id`, `created_at`),
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_action_created` (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审计日志';

SET FOREIGN_KEY_CHECKS = 1;
