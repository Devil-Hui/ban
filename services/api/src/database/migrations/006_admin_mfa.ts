import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('admin_mfa_factors')
    .addColumn('admin_id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('secret_ciphertext', 'varbinary(128)', (c) => c.notNull())
    .addColumn('secret_iv', 'varbinary(16)', (c) => c.notNull())
    .addColumn('secret_auth_tag', 'varbinary(32)', (c) => c.notNull())
    .addColumn('enabled_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('last_used_step', 'bigint')
    .addForeignKeyConstraint('fk_admin_mfa_admin', ['admin_id'], 'admin_accounts', ['id'], (c) => c.onDelete('cascade'))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('admin_mfa_factors').ifExists().execute();
}
