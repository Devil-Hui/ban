import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_deletion_requests')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('pending'))
    .addColumn('requested_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('execute_after', 'datetime(3)', (c) => c.notNull())
    .addColumn('cancelled_at', 'datetime(3)')
    .addColumn('completed_at', 'datetime(3)')
    .addForeignKeyConstraint('fk_user_deletion_user', ['user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_user_deletion_status').on('user_deletion_requests').columns(['user_id', 'status']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> { await db.schema.dropTable('user_deletion_requests').ifExists().execute(); }
