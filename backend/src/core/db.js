'use strict';

/**
 * 数据库连接层。
 * - DB_MODE=mysql：使用 mysql2 连接池（生产/联调）。mysql2 为 lazy require，测试期不加载。
 * - DB_MODE=memory：不创建真实连接，仓储层使用内存实现（见 repositories/memory.js）。
 * 同时提供 withTransaction 事务封装，保障发布方案等操作的原子性。
 */

const config = require('../config');

let pool = null;
let mockPool = null; // 仅供测试注入

function getPool() {
  if (mockPool) return mockPool;
  if (config.dbMode !== 'mysql') {
    // 非 mysql 模式下不应调用真实连接；仓储会改用内存实现
    return null;
  }
  if (!pool) {
    const mysql = require('mysql2/promise');
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      charset: config.db.charset,
      timezone: config.db.timezone,
      connectionLimit: config.db.connectionLimit,
      waitForConnections: config.db.waitForConnections,
      connectTimeout: config.db.connectTimeout,
      supportBigNumbers: true,
      bigNumberStrings: false,
    });
  }
  return pool;
}

/** 测试/本地注入模拟连接池 */
function setMockPool(p) {
  mockPool = p;
}

/**
 * 事务封装：在事务中执行 fn(conn)，成功 COMMIT，异常 ROLLBACK。
 * fn 内所有 SQL 必须使用传入的 conn（而非 getPool()）以保证在同一连接。
 * @param {function} fn async (conn) => any
 */
async function withTransaction(fn) {
  const p = getPool();
  if (!p) throw new Error('事务需要 mysql 模式连接池');
  const conn = await p.getConnection();
  try {
    await conn.query('START TRANSACTION');
    const result = await fn(conn);
    await conn.query('COMMIT');
    return result;
  } catch (e) {
    await conn.query('ROLLBACK');
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, setMockPool, withTransaction };
