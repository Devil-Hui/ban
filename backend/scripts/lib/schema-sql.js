'use strict';

/**
 * schema.sql 含 CREATE DATABASE `paiban` + USE `paiban`，适合 Docker 首次初始化。
 * 向「已选定」的临时库/目标库导入时，必须剥离这两句，否则表会落到 paiban，
 * 当前连接库仍是空的（import-schema 等脚本会踩坑）。
 */
function stripDatabaseSwitch(sql) {
  return String(sql || '')
    .replace(/CREATE\s+DATABASE[\s\S]*?;/gi, '')
    .replace(/USE\s+`?[\w]+`?\s*;/gi, '');
}

module.exports = { stripDatabaseSwitch };
