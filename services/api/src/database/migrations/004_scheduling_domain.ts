import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('shift_templates')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('group_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('name', 'varchar(120)', (c) => c.notNull())
    .addColumn('template_type', 'varchar(24)', (c) => c.notNull().defaultTo('custom'))
    .addColumn('timezone', 'varchar(64)', (c) => c.notNull().defaultTo('Asia/Shanghai'))
    .addColumn('deleted_at', 'datetime(3)')
    .addColumn('created_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_shift_template_group', ['group_id'], 'groups', ['id'], (c) => c.onDelete('restrict'))
    .addForeignKeyConstraint('fk_shift_template_creator', ['created_by'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema
    .createTable('shift_periods')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('template_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('code', 'varchar(40)', (c) => c.notNull())
    .addColumn('label', 'varchar(80)', (c) => c.notNull())
    .addColumn('start_minute', 'smallint', (c) => c.notNull())
    .addColumn('end_minute', 'smallint', (c) => c.notNull())
    .addColumn('end_day_offset', 'smallint', (c) => c.notNull().defaultTo(0))
    .addColumn('sort_order', 'smallint', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_shift_period_code', ['template_id', 'code'])
    .addForeignKeyConstraint('fk_shift_period_template', ['template_id'], 'shift_templates', ['id'], (c) => c.onDelete('cascade'))
    .execute();

  await db.schema
    .createTable('schedule_tasks')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('group_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('template_id', sql`binary(16)`)
    .addColumn('title', 'varchar(160)', (c) => c.notNull())
    .addColumn('description', 'text')
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('draft'))
    .addColumn('date_start', 'date', (c) => c.notNull())
    .addColumn('date_end', 'date', (c) => c.notNull())
    .addColumn('deadline', 'datetime(3)', (c) => c.notNull())
    .addColumn('publisher_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('version', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('published_version', 'integer')
    .addColumn('closed_at', 'datetime(3)')
    .addColumn('deleted_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_schedule_task_group', ['group_id'], 'groups', ['id'], (c) => c.onDelete('restrict'))
    .addForeignKeyConstraint('fk_schedule_task_template', ['template_id'], 'shift_templates', ['id'], (c) => c.onDelete('set null'))
    .addForeignKeyConstraint('fk_schedule_task_publisher', ['publisher_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_schedule_task_group_status').on('schedule_tasks').columns(['group_id', 'status', 'updated_at']).execute();

  await db.schema
    .createTable('task_slots')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('period_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('slot_date', 'date', (c) => c.notNull())
    .addColumn('starts_at', 'datetime(3)', (c) => c.notNull())
    .addColumn('ends_at', 'datetime(3)', (c) => c.notNull())
    .addColumn('min_people', 'smallint', (c) => c.notNull().defaultTo(1))
    .addColumn('target_people', 'smallint', (c) => c.notNull().defaultTo(1))
    .addColumn('max_people', 'smallint', (c) => c.notNull().defaultTo(1))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_task_slot_period_date', ['task_id', 'period_id', 'slot_date'])
    .addForeignKeyConstraint('fk_task_slot_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_task_slot_period', ['period_id'], 'shift_periods', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_task_slot_time').on('task_slots').columns(['task_id', 'starts_at']).execute();

  await db.schema
    .createTable('availability_submissions')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('submission_version', 'integer', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('submitted'))
    .addColumn('submitted_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_availability_submission_version', ['task_id', 'user_id', 'submission_version'])
    .addForeignKeyConstraint('fk_availability_submission_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_availability_submission_user', ['user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema
    .createTable('availability_entries')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('submission_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('slot_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('state', 'varchar(16)', (c) => c.notNull())
    .addColumn('note', 'varchar(500)')
    .addForeignKeyConstraint('fk_availability_entry_submission', ['submission_id'], 'availability_submissions', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_availability_entry_slot', ['slot_id'], 'task_slots', ['id'], (c) => c.onDelete('cascade'))
    .addUniqueConstraint('uq_availability_entry_slot', ['submission_id', 'slot_id'])
    .execute();

  await db.schema
    .createTable('solver_jobs')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('snapshot_hash', 'char(64)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('queued'))
    .addColumn('progress', 'smallint', (c) => c.notNull().defaultTo(0))
    .addColumn('attempts', 'smallint', (c) => c.notNull().defaultTo(0))
    .addColumn('idempotency_key', 'varchar(160)', (c) => c.notNull().unique())
    .addColumn('error_json', 'json')
    .addColumn('created_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_solver_job_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_solver_job_creator', ['created_by'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema
    .createTable('solver_snapshots')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('job_id', sql`binary(16)`, (c) => c.notNull().unique())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('snapshot_json', 'json', (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_solver_snapshot_job', ['job_id'], 'solver_jobs', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_solver_snapshot_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .execute();
  await db.schema
    .createTable('schedule_candidates')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('job_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('candidate_index', 'smallint', (c) => c.notNull())
    .addColumn('score', 'integer', (c) => c.notNull())
    .addColumn('explanation_json', 'json', (c) => c.notNull())
    .addColumn('assignments_json', 'json', (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_schedule_candidate_index', ['job_id', 'candidate_index'])
    .addForeignKeyConstraint('fk_schedule_candidate_job', ['job_id'], 'solver_jobs', ['id'], (c) => c.onDelete('cascade'))
    .execute();

  await db.schema
    .createTable('schedule_versions')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('version_number', 'integer', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('published'))
    .addColumn('published_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('published_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_schedule_version_number', ['task_id', 'version_number'])
    .addForeignKeyConstraint('fk_schedule_version_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_schedule_version_publisher', ['published_by'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema
    .createTable('schedule_assignments')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('version_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('slot_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('source', 'varchar(24)', (c) => c.notNull().defaultTo('solver'))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addForeignKeyConstraint('fk_schedule_assignment_version', ['version_id'], 'schedule_versions', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_schedule_assignment_slot', ['slot_id'], 'task_slots', ['id'], (c) => c.onDelete('restrict'))
    .addForeignKeyConstraint('fk_schedule_assignment_user', ['user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .addUniqueConstraint('uq_schedule_assignment', ['version_id', 'slot_id', 'user_id'])
    .execute();
  await db.schema
    .createTable('schedule_receipts')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('version_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('pending'))
    .addColumn('received_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addUniqueConstraint('uq_schedule_receipt_user', ['version_id', 'user_id'])
    .addForeignKeyConstraint('fk_schedule_receipt_version', ['version_id'], 'schedule_versions', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_schedule_receipt_user', ['user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema
    .createTable('schedule_objections')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('receipt_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('slot_id', sql`binary(16)`)
    .addColumn('reason', 'varchar(1000)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('open'))
    .addColumn('resolved_by', sql`binary(16)`)
    .addColumn('resolved_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_schedule_objection_receipt', ['receipt_id'], 'schedule_receipts', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_schedule_objection_slot', ['slot_id'], 'task_slots', ['id'], (c) => c.onDelete('set null'))
    .addForeignKeyConstraint('fk_schedule_objection_resolver', ['resolved_by'], 'users', ['id'], (c) => c.onDelete('set null'))
    .execute();

  await db.schema
    .createTable('share_links')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('version_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('token_hash', 'char(64)', (c) => c.notNull().unique())
    .addColumn('expires_at', 'datetime(3)', (c) => c.notNull())
    .addColumn('revoked_at', 'datetime(3)')
    .addColumn('access_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_share_link_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_share_link_version', ['version_id'], 'schedule_versions', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_share_link_creator', ['created_by'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ['share_links', 'schedule_objections', 'schedule_receipts', 'schedule_assignments', 'schedule_versions', 'schedule_candidates', 'solver_snapshots', 'solver_jobs', 'availability_entries', 'availability_submissions', 'task_slots', 'schedule_tasks', 'shift_periods', 'shift_templates']) {
    await db.schema.dropTable(table).ifExists().execute();
  }
}
