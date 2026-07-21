import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('users').addColumn('avatar_url', 'varchar(512)').execute();
  await db.schema.alterTable('users').addColumn('last_login_at', 'datetime(3)').execute();

  await db.schema
    .createTable('user_sessions')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('refresh_token_hash', 'char(64)', (c) => c.notNull().unique())
    .addColumn('expires_at', 'datetime(3)', (c) => c.notNull())
    .addColumn('revoked_at', 'datetime(3)')
    .addColumn('last_used_at', 'datetime(3)')
    .addColumn('user_agent', 'varchar(512)')
    .addColumn('ip_address', 'varchar(64)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_user_session_user', ['user_id'], 'users', ['id'], (constraint) => constraint.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_user_session_active').on('user_sessions').columns(['user_id', 'expires_at']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('user_sessions').execute();
  await db.schema.alterTable('users').dropColumn('last_login_at').execute();
  await db.schema.alterTable('users').dropColumn('avatar_url').execute();
}
