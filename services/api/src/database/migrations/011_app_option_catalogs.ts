import { type Kysely, sql } from 'kysely';

/**
 * Generic UI/business option catalogs (labels & values) stored in DB.
 * Replaces client hard-coded option arrays for task-create / status display.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('app_option_catalogs')
    .addColumn('id', sql`binary(16)`, (c) => c.primaryKey())
    .addColumn('category', 'varchar(64)', (c) => c.notNull())
    .addColumn('code', 'varchar(64)', (c) => c.notNull())
    .addColumn('label', 'varchar(120)', (c) => c.notNull())
    .addColumn('value_json', 'json')
    .addColumn('sort_order', 'integer', (c) => c.notNull().defaultTo(0))
    .addColumn('is_active', 'boolean', (c) => c.notNull().defaultTo(true))
    .addColumn('created_at', 'datetime(3)', (c) => c.notNull().defaultTo(sql`current_timestamp(3)`))
    .addColumn('updated_at', 'datetime(3)', (c) =>
      c.notNull().defaultTo(sql`current_timestamp(3) on update current_timestamp(3)`),
    )
    .addUniqueConstraint('uq_app_option_category_code', ['category', 'code'])
    .execute();

  await db.schema
    .createIndex('idx_app_option_category_active')
    .on('app_option_catalogs')
    .columns(['category', 'is_active', 'sort_order'])
    .execute();

  type Row = [string, string, string, string | null, number];
  const rows: Row[] = [
    // required fields
    ['required_field', 'name', '姓名', '"name"', 10],
    ['required_field', 'studentId', '学号', '"studentId"', 20],
    ['required_field', 'phone', '联系方式', '"phone"', 30],
    // participant scope
    ['participant_scope', 'all_members', '所有组员', '"all_members"', 10],
    ['participant_scope', 'share_link', '分享链接', '"share_link"', 20],
    ['participant_scope', 'reserved_list', '预留名单', '"reserved_list"', 30],
    // remind minutes (value is number or null)
    ['remind_minutes', '15', '15 分钟', '15', 10],
    ['remind_minutes', '30', '30 分钟', '30', 20],
    ['remind_minutes', '60', '60 分钟', '60', 30],
    ['remind_minutes', '120', '120 分钟', '120', 40],
    ['remind_minutes', 'off', '关闭', 'null', 50],
    // task status labels
    ['task_status', 'draft', '草稿', '"draft"', 10],
    ['task_status', 'collecting', '收集中', '"collecting"', 20],
    ['task_status', 'ready', '待排班', '"ready"', 30],
    ['task_status', 'solving', '求解中', '"solving"', 40],
    ['task_status', 'reviewing', '方案评审', '"reviewing"', 50],
    ['task_status', 'published', '已发布', '"published"', 60],
    ['task_status', 'adjusting', '调整中', '"adjusting"', 70],
    ['task_status', 'failed', '失败', '"failed"', 80],
    ['task_status', 'cancelled', '已取消', '"cancelled"', 90],
    ['task_status', 'completed', '已完成', '"completed"', 100],
    // group role labels
    ['group_role', 'owner', '发布者', '"owner"', 10],
    ['group_role', 'admin', '管理员', '"admin"', 20],
    ['group_role', 'member', '成员', '"member"', 30],
    // group default description template
    ['group_default', 'description', '排班协作分组', '"排班协作分组"', 10],
    // wizard step labels
    ['wizard_step', '1', '任务信息', '1', 10],
    ['wizard_step', '2', '时段规则', '2', 20],
    ['wizard_step', '3', '初预览', '3', 30],
    ['wizard_step', '4', '时间选定', '4', 40],
    ['wizard_step', '5', '详细规则', '5', 50],
    // time mode labels
    ['time_mode', 'range', '按时间段', '"range"', 10],
    ['time_mode', 'section', '按节次', '"section"', 20],
    ['time_mode', 'section_range', '节次+时间段', '"section_range"', 30],
  ];

  for (const [category, code, label, valueJson, sortOrder] of rows) {
    await sql`
      insert into app_option_catalogs (id, category, code, label, value_json, sort_order)
      values (unhex(md5(uuid())), ${category}, ${code}, ${label}, cast(${valueJson} as json), ${sortOrder})
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('app_option_catalogs').ifExists().execute();
}
