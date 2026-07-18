-- 初始化默认配置（幂等）
USE `paiban`;

INSERT INTO `app_settings` (`k`, `v`, `remark`) VALUES
  ('defaultTimeMode', 'section_range', '默认任务时段模式'),
  ('defaultProfileId', 'sys_uni_45min_v1', '默认系统作息模板')
ON DUPLICATE KEY UPDATE `v` = VALUES(`v`), `updated_at` = CURRENT_TIMESTAMP(3);
