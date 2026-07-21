import { type Kysely, sql } from 'kysely';

/**
 * Move remaining hard-coded catalogs into DB:
 * - groups.description
 * - campus_schedule_presets (task-create period presets)
 * - wechat_mock_identities (develop WECHAT_MODE=mock)
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable('groups')
    .addColumn('description', 'varchar(255)')
    .execute();

  await db.schema
    .createTable('campus_schedule_presets')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('code', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('label', 'varchar(120)', (c) => c.notNull())
    .addColumn('first_start', 'char(5)', (c) => c.notNull())
    .addColumn('duration_min', 'integer', (c) => c.notNull())
    .addColumn('morning_count', 'integer', (c) => c.notNull().defaultTo(4))
    .addColumn('afternoon_count', 'integer', (c) => c.notNull().defaultTo(4))
    .addColumn('evening_count', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('break_min', 'integer', (c) => c.notNull().defaultTo(10))
    .addColumn('sort_order', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('source_note', 'varchar(500)')
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) =>
      c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`),
    )
    .execute();

  await db.schema
    .createTable('wechat_mock_identities')
    .addColumn('code', 'varchar(16)', (c) => c.primaryKey())
    .addColumn('openid', 'varchar(64)', (c) => c.notNull().unique())
    .addColumn('nickname', 'varchar(80)', (c) => c.notNull())
    .addColumn('avatar_url', 'varchar(512)')
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .execute();

  // Seed campus presets (replaces client hard-coded PRESET_TWEAKS defaults)
  const presets: Array<[string, string, string, number, number, number, number, number, number, string]> = [
    ['start0800_45', '08:00·45分钟', '08:00', 45, 4, 4, 0, 10, 10, '小样本公开作息归纳'],
    ['start0830_45', '08:30·45分钟', '08:30', 45, 4, 4, 0, 10, 20, '小样本公开作息归纳'],
    ['manual', '手动', '08:00', 45, 4, 4, 0, 10, 30, '用户自定义起点'],
  ];
  for (const [code, label, firstStart, durationMin, morning, afternoon, evening, breakMin, sortOrder, note] of presets) {
    await sql`
      insert into campus_schedule_presets
        (id, code, label, first_start, duration_min, morning_count, afternoon_count, evening_count, break_min, sort_order, source_note)
      values
        (unhex(md5(uuid())), ${code}, ${label}, ${firstStart}, ${durationMin}, ${morning}, ${afternoon}, ${evening}, ${breakMin}, ${sortOrder}, ${note})
    `.execute(db);
  }

  // Seed develop mock identities (replaces hard-coded names map in WechatLoginAdapter)
  const mocks: Array<[string, string]> = [
    ['U01', '张三'],
    ['U02', '李四'],
    ['U03', '小明'],
    ['U04', '小红'],
    ['U05', '小刚'],
    ['U06', '小强'],
    ['U07', '小王'],
    ['U08', '小丽'],
    ['U09', '小华'],
    ['U10', '小赵'],
    ['U11', '小钱'],
    ['U12', '小孙'],
    ['U13', '小李'],
  ];
  for (const [code, nickname] of mocks) {
    await sql`
      insert into wechat_mock_identities (code, openid, nickname)
      values (${code}, ${`mock:${code}`}, ${nickname})
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('wechat_mock_identities').ifExists().execute();
  await db.schema.dropTable('campus_schedule_presets').ifExists().execute();
  await db.schema.alterTable('groups').dropColumn('description').execute();
}
