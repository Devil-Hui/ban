import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import mysql from 'mysql2/promise';

const required = ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  timezone: 'Z',
  connectionLimit: 2,
});
const binaryId = (value) => Buffer.from(value.replaceAll('-', ''), 'hex');
const userId = randomUUID();
const requestId = randomUUID();
const sessionId = randomUUID();
const groupId = randomUUID();
const memberId = randomUUID();
const taskId = randomUUID();

try {
  await pool.query("insert into users (id, openid, nickname, avatar_url) values (?, ?, 'lifecycle-test', 'https://example.invalid/avatar')", [binaryId(userId), `lifecycle-test:${randomUUID()}`]);
  await pool.query("insert into user_private_profiles (user_id, phone_ciphertext, phone_iv, phone_auth_tag, phone_key_version, phone_authorized_at) values (?, ?, ?, ?, 'test', current_timestamp(3))", [binaryId(userId), randomBytes(16), randomBytes(12), randomBytes(16)]);
  await pool.query("insert into user_sessions (id, user_id, refresh_token_hash, expires_at) values (?, ?, ?, date_add(current_timestamp(3), interval 1 day))", [binaryId(sessionId), binaryId(userId), randomBytes(32).toString('hex')]);
  await pool.query("insert into user_deletion_requests (id, user_id, execute_after) values (?, ?, date_sub(current_timestamp(3), interval 1 second))", [binaryId(requestId), binaryId(userId)]);
  await pool.query("insert into `groups` (id, name, owner_id) values (?, 'reminder-group', ?)", [binaryId(groupId), binaryId(userId)]);
  await pool.query("insert into group_members (id, group_id, user_id, display_name, role_in_group) values (?, ?, ?, 'reminder-owner', 'owner')", [binaryId(memberId), binaryId(groupId), binaryId(userId)]);
  await pool.query("insert into schedule_tasks (id, group_id, title, description, status, date_start, date_end, deadline, publisher_id) values (?, ?, 'reminder-task', 'submit availability', 'collecting', current_date(), current_date(), date_add(current_timestamp(3), interval 20 minute), ?)", [binaryId(taskId), binaryId(groupId), binaryId(userId)]);

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['services/deadline-worker/worker.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, WORKER_RUN_ONCE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`deadline worker failed (${code}): ${stderr.slice(0, 500)}`)));
  });

  const [rows] = await pool.query("select u.status, u.openid, u.nickname, u.avatar_url, u.anonymized_at, p.phone_ciphertext, s.revoked_at, d.status as deletion_status, d.completed_at from users u join user_private_profiles p on p.user_id=u.id join user_sessions s on s.user_id=u.id join user_deletion_requests d on d.user_id=u.id where u.id=?", [binaryId(userId)]);
  const row = rows[0];
  if (!row || row.status !== 'anonymized' || row.openid !== null || row.avatar_url !== null || row.phone_ciphertext !== null || row.revoked_at === null || row.deletion_status !== 'completed' || row.completed_at === null || row.anonymized_at === null) {
    throw new Error('lifecycle anonymization verification failed');
  }
  const [notifications] = await pool.query("select event_type, payload_json from notification_outbox where business_key=?", [`availability-missing:${taskId}:${userId}`]);
  if (notifications.length !== 1 || notifications[0].event_type !== 'schedule.availability.missing') throw new Error('missing availability reminder was not enqueued');
  console.log('lifecycle-worker: PASS');
} finally {
  await pool.end();
}
