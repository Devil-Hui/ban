import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('user_private_profiles')
    .addColumn('user_id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('phone_ciphertext', 'varbinary(512)')
    .addColumn('phone_iv', 'varbinary(16)')
    .addColumn('phone_auth_tag', 'varbinary(32)')
    .addColumn('phone_key_version', 'varchar(32)')
    .addColumn('phone_authorized_at', 'datetime(3)')
    .addColumn('deleted_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_private_profile_user', ['user_id'], 'users', ['id'], (constraint) => constraint.onDelete('restrict')).execute();

  await db.schema
    .createTable('admin_sessions')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('admin_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('refresh_token_hash', 'char(64)', (c) => c.notNull().unique())
    .addColumn('expires_at', 'datetime(3)', (c) => c.notNull())
    .addColumn('revoked_at', 'datetime(3)')
    .addColumn('last_used_at', 'datetime(3)')
    .addColumn('user_agent', 'varchar(512)')
    .addColumn('ip_address', 'varchar(64)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_admin_session_admin', ['admin_id'], 'admin_accounts', ['id'], (constraint) => constraint.onDelete('restrict')).execute();

  await db.schema
    .createTable('groups')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('name', 'varchar(120)', (c) => c.notNull())
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('owner_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('timezone', 'varchar(64)', (c) => c.notNull().defaultTo('Asia/Shanghai'))
    .addColumn('version', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('deleted_at', 'datetime(3)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addForeignKeyConstraint('fk_group_owner', ['owner_id'], 'users', ['id'], (constraint) => constraint.onDelete('restrict')).execute();

  await db.schema
    .createTable('group_members')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('group_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('user_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('display_name', 'varchar(80)', (c) => c.notNull())
    .addColumn('role_in_group', 'varchar(24)', (c) => c.notNull().defaultTo('member'))
    .addColumn('status', 'varchar(24)', (c) => c.notNull().defaultTo('active'))
    .addColumn('is_blacklisted', 'boolean', (c) => c.notNull().defaultTo(false))
    .addColumn('kicked_at', 'datetime(3)')
    .addColumn('left_at', 'datetime(3)')
    .addColumn('kicked_reason', 'varchar(500)')
    .addColumn('version', 'integer', (c) => c.notNull().defaultTo(1))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`))
    .addUniqueConstraint('uq_group_member_user', ['group_id', 'user_id'])
    .addForeignKeyConstraint('fk_member_group', ['group_id'], 'groups', ['id'], (constraint) => constraint.onDelete('restrict'))
    .addForeignKeyConstraint('fk_member_user', ['user_id'], 'users', ['id'], (constraint) => constraint.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_group_member_status').on('group_members').columns(['group_id', 'status']).execute();

  await db.schema
    .createTable('group_invite_codes')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('group_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('code', 'char(6)', (c) => c.notNull().unique())
    .addColumn('expires_at', 'datetime(3)')
    .addColumn('revoked_at', 'datetime(3)')
    .addColumn('created_by', sql`binary(16)`, (c) => c.notNull())
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_invite_group', ['group_id'], 'groups', ['id'], (constraint) => constraint.onDelete('restrict'))
    .addForeignKeyConstraint('fk_invite_creator', ['created_by'], 'users', ['id'], (constraint) => constraint.onDelete('restrict'))
    .execute();

  await db.schema
    .createTable('group_member_events')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('group_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('member_id', sql`binary(16)`, (c) => c.notNull())
    .addColumn('actor_user_id', sql`binary(16)`)
    .addColumn('event_type', 'varchar(48)', (c) => c.notNull())
    .addColumn('reason', 'varchar(500)')
    .addColumn('metadata_json', 'json')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addForeignKeyConstraint('fk_member_event_group', ['group_id'], 'groups', ['id'], (constraint) => constraint.onDelete('restrict'))
    .addForeignKeyConstraint('fk_member_event_member', ['member_id'], 'group_members', ['id'], (constraint) => constraint.onDelete('restrict'))
    .addForeignKeyConstraint('fk_member_event_actor', ['actor_user_id'], 'users', ['id'], (constraint) => constraint.onDelete('restrict'))
    .execute();
  await db.schema.createIndex('idx_member_event_time').on('group_member_events').columns(['group_id', 'created_at']).execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('group_member_events').execute();
  await db.schema.dropTable('group_invite_codes').execute();
  await db.schema.dropTable('group_members').execute();
  await db.schema.dropTable('groups').execute();
  await db.schema.dropTable('admin_sessions').execute();
  await db.schema.dropTable('user_private_profiles').execute();
}
