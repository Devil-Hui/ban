import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('shift_templates').addColumn('is_reusable', 'boolean', (c) => c.notNull().defaultTo(false)).execute();
  await db.schema.alterTable('shift_periods').addColumn('default_min_people', 'smallint', (c) => c.notNull().defaultTo(1)).execute();
  await db.schema.alterTable('shift_periods').addColumn('default_target_people', 'smallint', (c) => c.notNull().defaultTo(1)).execute();
  await db.schema.alterTable('shift_periods').addColumn('default_max_people', 'smallint', (c) => c.notNull().defaultTo(1)).execute();
  await db.schema.alterTable('schedule_objections').addColumn('resolution_note', 'varchar(1000)').execute();
  await db.schema
    .createTable('task_fixed_assignments')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('task_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('slot_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_task_fixed_assignment', ['task_id', 'slot_id', 'user_id'])
    .addForeignKeyConstraint('fk_fixed_assignment_task', ['task_id'], 'schedule_tasks', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_fixed_assignment_slot', ['slot_id'], 'task_slots', ['id'], (c) => c.onDelete('cascade'))
    .addForeignKeyConstraint('fk_fixed_assignment_user', ['user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .addForeignKeyConstraint('fk_fixed_assignment_creator', ['created_by'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_fixed_assignment_task').on('task_fixed_assignments').columns(['task_id', 'slot_id']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('task_fixed_assignments').ifExists().execute();
  await db.schema.alterTable('schedule_objections').dropColumn('resolution_note').execute();
  await db.schema.alterTable('shift_periods').dropColumn('default_max_people').execute();
  await db.schema.alterTable('shift_periods').dropColumn('default_target_people').execute();
  await db.schema.alterTable('shift_periods').dropColumn('default_min_people').execute();
  await db.schema.alterTable('shift_templates').dropColumn('is_reusable').execute();
}
