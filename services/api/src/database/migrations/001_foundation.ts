import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('users')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('openid', 'varchar(64)', (c) => c.unique())
    .addColumn('nickname', 'varchar(80)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('anonymized_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .execute();

  await db.schema
    .createTable('admin_accounts')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('username', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('password_hash', 'varchar(255)', (c) => c.notNull())
    .addColumn('role', 'varchar(24)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .execute();

  await db.schema
    .createTable('audit_logs')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('actor_type', 'varchar(24)', (c) => c.notNull())
    .addColumn('actor_id', sql`binary(16)`)
    .addColumn('action', 'varchar(96)', (c) => c.notNull())
    .addColumn('target_type', 'varchar(64)', (c) => c.notNull())
    .addColumn('target_id', sql`binary(16)`)
    .addColumn('request_id', 'varchar(64)', (c) => c.notNull())
    .addColumn('metadata_json', 'json')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .execute();

  await db.schema.createIndex('idx_audit_created_at').on('audit_logs').column('created_at').execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('audit_logs').execute();
  await db.schema.dropTable('admin_accounts').execute();
  await db.schema.dropTable('users').execute();
}
