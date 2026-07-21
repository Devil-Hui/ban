import { type Kysely, sql } from 'kysely';

/**
 * Migration 013 — performance indexes and domain constraints hardening.
 *
 * All changes here are additive (new indexes) or constraint-only (CHECK),
 * so they do not alter the API contract and require no frontend changes.
 *
 * - Reverse-lookup indexes by user_id for "my schedule" / "my receipts".
 * - Actor index on audit_logs for admin trail queries.
 * - CHECK constraints pinning the verified value sets of two enum-ish columns.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createIndex('idx_schedule_assignment_user')
    .on('schedule_assignments')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_schedule_receipt_user')
    .on('schedule_receipts')
    .column('user_id')
    .execute();

  await db.schema
    .createIndex('idx_audit_actor')
    .on('audit_logs')
    .columns(['actor_type', 'actor_id'])
    .execute();

  await sql`ALTER TABLE availability_entries ADD CONSTRAINT chk_availability_state
    CHECK (state IN ('unavailable', 'available', 'preferred'))`.execute(db);

  await sql`ALTER TABLE schedule_tasks ADD CONSTRAINT chk_schedule_task_status
    CHECK (status IN ('draft', 'collecting', 'ready', 'solving', 'reviewing', 'published', 'adjusting', 'failed'))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE schedule_tasks DROP CHECK chk_schedule_task_status`.execute(db);
  await sql`ALTER TABLE availability_entries DROP CHECK chk_availability_state`.execute(db);
  await db.schema.dropIndex('idx_audit_actor').on('audit_logs').execute();
  await db.schema.dropIndex('idx_schedule_receipt_user').on('schedule_receipts').execute();
  await db.schema.dropIndex('idx_schedule_assignment_user').on('schedule_assignments').execute();
}
