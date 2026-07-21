import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { resolveRemindBeforeMinutes, isWithinRemindWindow } from './remind-window.mjs';

const pool = mysql.createPool({ host: process.env.MYSQL_HOST || 'mysql', port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, connectionLimit: 2, timezone: 'Z' });
const binaryId = (value) => Buffer.from(value.replaceAll('-', ''), 'hex');
const uuid = (value) => { const hex = Buffer.from(value).toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`; };

export async function runOnce() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Collecting tasks with future deadline; remind window filtered in JS per-task
    // Prefer nearer deadlines so LIMIT 100 does not starve soon-due tasks.
    const [reminderCandidates] = await connection.query(
      "select t.id, t.title, t.deadline, t.group_id, t.rules_json, g.name as group_name, coalesce(pm.display_name, u.nickname) as publisher_name from schedule_tasks t join `groups` g on g.id=t.group_id join users u on u.id=t.publisher_id left join group_members pm on pm.group_id=t.group_id and pm.user_id=t.publisher_id where t.status='collecting' and t.deadline > current_timestamp(3) and t.deleted_at is null order by t.deadline asc limit 100 for update skip locked",
    );
    const now = new Date();
    const reminderTasks = reminderCandidates.filter((task) => {
      const remindMinutes = resolveRemindBeforeMinutes(task.rules_json);
      return isWithinRemindWindow(task.deadline, remindMinutes, now);
    });
    let reminders = 0;
    for (const task of reminderTasks) {
      const [missing] = await connection.query("select m.user_id from group_members m where m.group_id=? and m.status='active' and not exists (select 1 from availability_submissions s where s.task_id=? and s.user_id=m.user_id) and not exists (select 1 from notification_outbox n where n.business_key = concat('availability-missing:', lower(bin_to_uuid(?)), ':', lower(bin_to_uuid(m.user_id))))", [task.group_id, task.id, task.id]);
      for (const member of missing) {
        const taskUuid = uuid(task.id); const userUuid = uuid(member.user_id);
        const [inserted] = await connection.query("insert ignore into notification_outbox (id, business_key, recipient_user_id, event_type, payload_json) values (?, ?, ?, 'schedule.availability.missing', ?)", [binaryId(randomUUID()), `availability-missing:${taskUuid}:${userUuid}`, member.user_id, JSON.stringify({ taskId: taskUuid, deadline: task.deadline, publisherName: task.publisher_name, taskTitle: task.title, groupName: task.group_name })]);
        reminders += Number(inserted.affectedRows || 0);
      }
    }
    const [tasks] = await connection.query("select id from schedule_tasks where status='collecting' and deadline <= current_timestamp(3) and deleted_at is null limit 100 for update skip locked");
    for (const task of tasks) {
      await connection.query("update schedule_tasks set status='ready', version=version+1, closed_at=current_timestamp(3) where id=? and status='collecting'", [task.id]);
      await connection.query("insert into audit_logs (id, actor_type, actor_id, action, target_type, target_id, request_id) values (?, 'system', null, 'schedule.task.ready', 'task', ?, ?)", [binaryId(randomUUID()), task.id, `deadline-worker:${Date.now()}`]);
    }
    const [deletions] = await connection.query("select id, user_id from user_deletion_requests where status='pending' and execute_after <= current_timestamp(3) limit 100 for update skip locked");
    for (const deletion of deletions) {
      await connection.query("update users set status='anonymized', openid=null, nickname='已注销用户', avatar_url=null, anonymized_at=current_timestamp(3), updated_at=current_timestamp(3) where id=? and anonymized_at is null", [deletion.user_id]);
      await connection.query("update user_private_profiles set phone_ciphertext=null, phone_iv=null, phone_auth_tag=null, phone_key_version=null, deleted_at=current_timestamp(3) where user_id=?", [deletion.user_id]);
      await connection.query("update user_sessions set revoked_at=current_timestamp(3) where user_id=? and revoked_at is null", [deletion.user_id]);
      await connection.query("update user_deletion_requests set status='completed', completed_at=current_timestamp(3) where id=? and status='pending'", [deletion.id]);
      await connection.query("insert into audit_logs (id, actor_type, actor_id, action, target_type, target_id, request_id) values (?, 'system', null, 'user.anonymize', 'user', ?, ?)", [binaryId(randomUUID()), deletion.user_id, `deadline-worker:${Date.now()}`]);
    }
    await connection.commit();
    if (tasks.length || reminders || deletions.length) console.log(JSON.stringify({ worker: 'deadline', closed: tasks.length, reminders, anonymized: deletions.length }));
  } catch (error) { await connection.rollback(); console.error(JSON.stringify({ worker: 'deadline', error: String(error) })); }
  finally { connection.release(); }
}
if (process.env.WORKER_RUN_ONCE === '1') {
  await runOnce();
  await pool.end();
} else {
  setInterval(runOnce, 5000);
  await runOnce();
}
