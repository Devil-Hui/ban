'use strict';

/**
 * 本地 MySQL 模式端到端冒烟测试。
 * - 连接本地 mysql-db 容器，建一个独立的临时库 paiban_smoke_xxx
 * - 导入 schema.sql，跑核心业务流（建用户→建组→加入→建任务→填报→发布→分配快照→通知→支付→异议→调整）
 * - 全程断言，结束自动 DROP 临时库，绝不污染你的 backend 库
 *
 * 运行：cd backend && node scripts/db-smoke.js
 */

require('../src/config'); // 加载 .env（DB_MODE 无关，只用到 db 连接参数）
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const config = require('../src/config');
const { createMysqlRepos } = require('../src/repositories/mysql');
const { stripDatabaseSwitch } = require('./lib/schema-sql');

const TEST_DB = 'paiban_smoke_' + Date.now().toString().slice(-6);

async function main() {
  const admin = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    multipleStatements: true,
  });
  let pool = null;
  try {
    // 1) 建临时库 + 导入 schema（必须剥离 CREATE DATABASE/USE，否则表会建到 paiban）
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`USE \`${TEST_DB}\``);
    const schemaRaw = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    const schema = stripDatabaseSwitch(schemaRaw);
    await admin.query(schema);
    const [tables] = await admin.query('SHOW TABLES');
    if (!tables.length) {
      throw new Error('schema 导入后当前库无表（请检查 stripDatabaseSwitch / schema.sql）');
    }
    console.log(`✓ 临时库 ${TEST_DB} 已建表（${tables.length} 张，schema.sql 导入完成）`);

    // 2) 业务连接池 + mysql 仓储
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: TEST_DB,
      charset: 'utf8mb4',
      timezone: 'Z',
      connectionLimit: 5,
      waitForConnections: true,
    });
    const repos = createMysqlRepos(pool);

    // 3) 核心业务流
    const publisher = await repos.users.upsertByOpenid('smoke_pub_' + Date.now(), { nickname: '发布者', avatarUrl: '' });
    const member = await repos.users.upsertByOpenid('smoke_mem_' + Date.now(), { nickname: '成员', avatarUrl: '' });
    assert(publisher.id && member.id, '用户创建失败');

    const group = await repos.groups.create({ name: '值班小组', createdBy: publisher.id });
    assert(group.id && group.status === 'active', '分组创建失败');
    const g2 = await repos.groups.getById(group.id);
    assert(g2.createdBy === publisher.id, '分组 createdBy 不一致');

    const m = await repos.groups.addMember({ groupId: group.id, userId: member.id, roleInGroup: 'member' });
    assert(m.status === 'active', '成员加入失败');
    const members = await repos.groups.listMembers(group.id);
    assert(members.length === 2, '成员列表应为 2');

    const task = await repos.tasks.create({
      groupId: group.id,
      publisherId: publisher.id,
      title: '7月排班',
      periods: [{ date: '2026-07-10', slots: ['morning'] }],
    });
    assert(task.id && task.status === 'collecting', '任务创建失败');

    const resp = await repos.responses.upsert({
      taskId: task.id,
      userId: member.id,
      availableSlots: [{ date: '2026-07-10', slots: ['morning'] }],
    });
    assert(resp.isValid === 1, '填报失败');

    // 发布（等价于 handlers/tasks.publish 的 deriveAssignments 结果）
    const finalSchedule = { assignments: [{ date: '2026-07-10', periodId: 'morning', userIds: [member.id] }] };
    const assignments = [{ taskId: task.id, userId: member.id, date: '2026-07-10', periodId: 'morning' }];
    const shareToken = await repos.tasks.createShareToken(task.id, 604800);
    const published = await repos.tasks.publish(task.id, { finalSchedule, candidateSchedules: null, shareToken, assignments });
    assert(published.status === 'published', '发布失败');
    assert(published.shareToken === shareToken, 'shareToken 未写入');
    assert(published.finalSchedule && published.finalSchedule.assignments.length === 1, 'finalSchedule 未写入');

    const byToken = await repos.tasks.getByShareToken(shareToken);
    assert(byToken && byToken.id === task.id, 'getByShareToken 失败');

    const assigns = await repos.tasks.listAssignments(task.id);
    assert(assigns.length === 1 && assigns[0].userId === member.id, '分配快照失败');

    const msg = await repos.notify.enqueue({ userId: member.id, taskId: task.id, templateId: 'task_published', title: '排班已发布', body: '请查看' });
    assert(msg.id, '通知入队失败');
    const unread = await repos.notify.countUnread(member.id);
    assert(unread >= 1, '未读计数失败');

    const order = await repos.payments.createOrder({ userId: publisher.id, amount: 100, channel: 'wechat_mini' });
    assert(order.outTradeNo && order.status === 'pending', '下单失败');
    const paid = await repos.payments.updateOrder(order.id, { status: 'paid' });
    assert(paid.status === 'paid' && paid.paidAt, '支付状态更新失败');

    const receipt = await repos.receipts.upsert({ taskId: task.id, userId: member.id, receiptStatus: 'objection', objectionReason: '日期冲突' });
    assert(receipt.receiptStatus === 'objection', '异议失败');
    // 模拟管理员已处理该异议（将 resolved 置 1），再次提交应抛 1502（防御性校验）
    await pool.execute('UPDATE task_receipts SET resolved = 1 WHERE task_id = ? AND user_id = ?', [task.id, member.id]);
    let threw = false;
    try {
      await repos.receipts.upsert({ taskId: task.id, userId: member.id, receiptStatus: 'objection', objectionReason: 'x' });
    } catch (e) {
      threw = e.code === 1502;
    }
    assert(threw, '已处理异议应抛 1502');

    // 调整（再发布一次，应把上一份 final 备份进 previous_schedule）
    const final2 = { assignments: [{ date: '2026-07-11', periodId: 'afternoon', userIds: [member.id] }] };
    const assignments2 = [{ taskId: task.id, userId: member.id, date: '2026-07-11', periodId: 'afternoon' }];
    const adjusted = await repos.tasks.publish(task.id, { finalSchedule: final2, candidateSchedules: null, shareToken, assignments: assignments2 });
    assert(adjusted.previousSchedule && adjusted.previousSchedule.assignments[0].date === '2026-07-10', '调整未备份 previousSchedule');

    console.log('✅ MySQL 模式端到端冒烟全部断言通过');
  } finally {
    if (pool) await pool.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``).catch(() => {});
    await admin.end().catch(() => {});
    console.log(`✓ 临时库 ${TEST_DB} 已清理`);
  }
}

main().catch((e) => {
  console.error('❌ 冒烟失败：', e && e.message ? e.message : e);
  if (e && e.sql) console.error('SQL:', e.sql);
  process.exit(1);
});
