import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Algorithm, hash } from '@node-rs/argon2';
import type { Redis } from 'ioredis';
import { sql, type Kysely } from 'kysely';
import { AuditService } from '../audit/audit.service.js';
import { AdminSessionRepository } from '../admin-auth/admin-session.repository.js';
import { DATABASE } from '../database/database.tokens.js';
import { parseId, stringifyId } from '../ids/uuid.js';
import { REDIS } from '../redis/redis.tokens.js';

@Injectable()
export class AdminOperationsService {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>, @Inject(REDIS) private readonly redis: Redis, @Inject(AuditService) private readonly auditTrail: AuditService, @Inject(AdminSessionRepository) private readonly adminsRepo: AdminSessionRepository) {}
  async overview() {
    const [users, groups, tasks, assignments] = await Promise.all([
      sql<{ count: number }>`select count(*) as count from users where status = 'active' and anonymized_at is null`.execute(this.db),
      sql<{ count: number }>`select count(*) as count from \`groups\` where status = 'active' and deleted_at is null`.execute(this.db),
      sql<{ count: number }>`select count(*) as count from schedule_tasks where status in ('collecting','ready','solving','reviewing','adjusting') and deleted_at is null`.execute(this.db),
      sql<{ count: number }>`select count(*) as count from schedule_assignments a join schedule_versions v on v.id = a.version_id where a.is_active = true and date(v.published_at) = current_date()`.execute(this.db),
    ]);
    return { activeUsers: Number(users.rows[0]?.count ?? 0), activeGroups: Number(groups.rows[0]?.count ?? 0), activeTasks: Number(tasks.rows[0]?.count ?? 0), todayAssignments: Number(assignments.rows[0]?.count ?? 0) };
  }
  async users(limit = 50) { const result = await sql<any>`select id, nickname, status, created_at, updated_at from users order by created_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id) })); }
  async groups(limit = 50) { const result = await sql<any>`select id, name, status, owner_id, created_at, updated_at from \`groups\` where deleted_at is null order by updated_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id), owner_id: stringifyId(row.owner_id) })); }
  async tasks(limit = 50) { const result = await sql<any>`select id, group_id, title, status, deadline, updated_at from schedule_tasks where deleted_at is null order by updated_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id), group_id: stringifyId(row.group_id) })); }
  async audit(limit = 50) { const result = await sql<any>`select id, actor_type, actor_id, action, target_type, target_id, request_id, metadata_json, created_at from audit_logs order by created_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows; }
  async admins(limit = 50) { const result = await sql<any>`select id, username, role, status, created_at, updated_at from admin_accounts order by created_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id) })); }
  async notifications(limit = 50) { const result = await sql<any>`select id, business_key, channel, recipient_user_id, event_type, status, attempts, available_at, sent_at, last_error, created_at, updated_at from notification_outbox order by created_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id), recipient_user_id: stringifyId(row.recipient_user_id) })); }
  async solverJobs(limit = 50) { const result = await sql<any>`select j.id, j.task_id, t.title, j.status, j.progress, j.attempts, j.error_json, j.created_at, j.updated_at from solver_jobs j join schedule_tasks t on t.id = j.task_id order by j.created_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id), task_id: stringifyId(row.task_id) })); }
  async templates(limit = 50) { const result = await sql<any>`select s.id, s.name, s.template_type, s.is_reusable, s.group_id, g.name as group_name, s.created_at, s.updated_at, count(p.id) as period_count from shift_templates s join \`groups\` g on g.id = s.group_id left join shift_periods p on p.template_id = s.id where s.deleted_at is null group by s.id, s.name, s.template_type, s.is_reusable, s.group_id, g.name, s.created_at, s.updated_at order by s.updated_at desc limit ${Math.min(Math.max(limit, 1), 100)}`.execute(this.db); return result.rows.map((row) => ({ ...row, id: stringifyId(row.id), group_id: stringifyId(row.group_id), period_count: Number(row.period_count) })); }
  async system() {
    const [migration, pending, jobs] = await Promise.all([
      sql<any>`select name, timestamp as executed_at from kysely_migration order by timestamp desc limit 1`.execute(this.db).catch(() => ({ rows: [] })),
      sql<any>`select count(*) as count from notification_outbox where status in ('pending','sending')`.execute(this.db),
      sql<any>`select count(*) as count from solver_jobs where status in ('queued','running')`.execute(this.db),
    ]);
    let redis: 'up' | 'down' = 'down'; try { redis = (await this.redis.ping()) === 'PONG' ? 'up' : 'down'; } catch { /* surfaced as a degraded service */ }
    return { services: { mysql: 'up', redis }, queues: { notifications: Number(pending.rows[0]?.count ?? 0), solver: Number(jobs.rows[0]?.count ?? 0) }, migration: migration.rows[0] ?? null, backup: { mode: 'external-script', configured: true, lastCompletedAt: null } };
  }
  async retryNotification(actorId: string, notificationId: string, requestId: string) {
    const result = await sql`update notification_outbox set status = 'pending', available_at = current_timestamp(3), last_error = null, updated_at = current_timestamp(3) where id = ${parseId(notificationId)} and status <> 'sent'`.execute(this.db);
    if (Number((result as any).numAffectedRows) !== 1) throw new NotFoundException('Notification not found or already sent');
    await this.auditTrail.record({ actorType: 'admin', actorId, action: 'notification.retry', targetType: 'notification', targetId: notificationId, requestId });
    return { queued: true, id: notificationId };
  }
  async setUserStatus(actorId: string, userId: string, status: 'active' | 'banned', requestId: string) {
    const result = await sql`update users set status = ${status}, updated_at = current_timestamp(3) where id = ${Buffer.from(userId.replaceAll('-', ''), 'hex')}`.execute(this.db);
    if (Number((result as any).numAffectedRows) !== 1) throw new NotFoundException('User not found');
    await this.auditTrail.record({ actorType: 'admin', actorId, action: `admin.user.${status}`, targetType: 'user', targetId: userId, requestId });
  }
  async createAdmin(actorId: string, username: string, password: string, role: 'admin' | 'superadmin', requestId: string) {
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,64}$/.test(normalized) || password.length < 12) throw new BadRequestException('Invalid username or password');
    if (await this.adminsRepo.findByUsername(normalized)) throw new ConflictException('Admin account already exists');
    const passwordHash = await hash(password, { algorithm: Algorithm.Argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const account = await this.adminsRepo.create(normalized, passwordHash, role);
    await this.auditTrail.record({ actorType: 'admin', actorId, action: 'admin.account.create', targetType: 'admin', targetId: account.id, requestId, metadata: { role } });
    return { id: account.id, username: account.username, role: account.role, status: account.status };
  }
}
