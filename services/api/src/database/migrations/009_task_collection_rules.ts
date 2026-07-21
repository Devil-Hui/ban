import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('schedule_tasks').addColumn('time_mode', 'varchar(32)').execute();
  await db.schema.alterTable('schedule_tasks').addColumn('rules_json', 'json').execute();

  await db.schema
    .createTable('task_reserved_names')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('name', 'varchar(80)', (c) => c.notNull())
    .addColumn('sort_order', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_task_reserved_name_task', ['task_id'], 'schedule_tasks', ['id'], (c) =>
      c.onDelete('cascade'),
    )
    .execute();

  await db.schema.createIndex('idx_task_reserved_names_task').on('task_reserved_names').column('task_id').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('task_reserved_names').ifExists().execute();
  await db.schema.alterTable('schedule_tasks').dropColumn('rules_json').execute();
  await db.schema.alterTable('schedule_tasks').dropColumn('time_mode').execute();
}
