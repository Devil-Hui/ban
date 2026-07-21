import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('command_idempotency')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('scope', 'varchar(120)', (c) => c.notNull())
    .addColumn('idempotency_key', 'varchar(160)', (c) => c.notNull())
    .addColumn('response_json', 'json', (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addUniqueConstraint('uq_command_idempotency_scope_key', ['scope', 'idempotency_key'])
    .execute();
  await db.schema
    .createTable('notification_outbox')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('business_key', 'varchar(180)', (c) => c.notNull().unique())
    .addColumn('channel', 'varchar(24)', (c) => c.notNull().defaultTo('wechat'))
    .addColumn('recipient_user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('event_type', 'varchar(64)', (c) => c.notNull())
    .addColumn('payload_json', 'json', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('pending'))
    .addColumn('attempts', 'smallint', (c) => c.notNull().defaultTo(0))
    .addColumn('available_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('sent_at', 'datetime(3)')
    .addColumn('last_error', 'varchar(1000)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_notification_recipient', ['recipient_user_id'], 'users', ['id'], (c) => c.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_notification_pending').on('notification_outbox').columns(['status', 'available_at']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('notification_outbox').ifExists().execute();
  await db.schema.dropTable('command_idempotency').ifExists().execute();
}
