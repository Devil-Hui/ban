import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('group_invite_codes')
    .modifyColumn('code', 'char(8)', (c) => c.notNull().unique())
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('group_invite_codes')
    .modifyColumn('code', 'char(6)', (c) => c.notNull().unique())
    .execute();
}
