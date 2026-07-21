import { type Kysely, sql } from 'kysely';

/**
 * Scheduling share / profile enhancements:
 *  - share_links.used_at : one-time use marker for collection invite links (E3).
 *  - availability_submissions.profile_json : persist submitted profile
 *    (name/studentId/phone + arbitrary custom_* fields) (E4).
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('share_links')
    .addColumn('used_at', 'datetime(3)')
    .execute();

  await db.schema
    .alterTable('availability_submissions')
    .addColumn('profile_json', 'json')
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable('share_links').dropColumn('used_at').execute();
  await db.schema.alterTable('availability_submissions').dropColumn('profile_json').execute();
}
