import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.tokens.js';
import { newId, parseId, stringifyId } from '../ids/uuid.js';
import { OutboxService } from '../notifications/outbox.service.js';
import { PrivacyService } from '../users/privacy.service.js';

export type TaskRules = {
  requiredFields: Array<'name' | 'studentId' | 'phone'>;
  participantScope: 'all_members' | 'share_link' | 'reserved_list';
  reservedNames?: string[];
  allowEditAfterSubmit: boolean;
  maxEditCount: number;
  remindBeforeMinutes: number | null;
  saveAsTemplate?: boolean;
  templateName?: string;
};
export type SelectedSlotInput = { date: string; periodCode: string; maxPeople?: number };
export type ScheduleTask = {
  id: string; groupId: string; title: string; description: string | null; status: string;
  dateStart: string; dateEnd: string; deadline: Date; publisherId: string; version: number;
  timeMode?: string | null;
  rules?: TaskRules | null;
  reservedNames?: string[];
};
export type TaskSlot = { id: string; taskId: string; periodId: string; slotDate: string; startsAt: Date; endsAt: Date; minPeople: number; targetPeople: number; maxPeople: number };
export type AvailabilityEntry = { slotId: string; state: 'unavailable' | 'available' | 'preferred'; note?: string | null };
export type ShiftPeriodDefinition = { code: string; label: string; startMinute: number; endMinute: number; endDayOffset?: number; minPeople?: number; targetPeople?: number; maxPeople?: number };
export type ShiftTemplate = { id: string; groupId: string; name: string; templateType: string; periods: ShiftPeriodDefinition[] };

function parseJsonField<T>(value: unknown): T | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

function taskFromRow(row: any, reservedNames: string[] = []): ScheduleTask {
  const rules = parseJsonField<TaskRules>(row.rules_json);
  let nextRules: TaskRules | null = null;
  if (rules) {
    nextRules = { ...rules };
    if (reservedNames.length) nextRules.reservedNames = reservedNames;
    else if (rules.reservedNames) nextRules.reservedNames = rules.reservedNames;
    else delete nextRules.reservedNames;
  }
  return {
    id: stringifyId(row.id),
    groupId: stringifyId(row.group_id),
    title: row.title,
    description: row.description,
    status: row.status,
    dateStart: asYmd(row.date_start),
    dateEnd: asYmd(row.date_end),
    deadline: row.deadline,
    publisherId: stringifyId(row.publisher_id),
    version: row.version,
    timeMode: row.time_mode ?? null,
    rules: nextRules,
    reservedNames,
  };
}
function slotFromRow(row: any): TaskSlot {
  return { id: stringifyId(row.id), taskId: stringifyId(row.task_id), periodId: stringifyId(row.period_id), slotDate: asYmd(row.slot_date), startsAt: row.starts_at, endsAt: row.ends_at, minPeople: row.min_people, targetPeople: row.target_people, maxPeople: row.max_people };
}

/** DATE columns may arrive as Date; String(date).slice(0,10) yields "Mon Jul 20". */
function asYmd(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') {
    const match = value.match(/(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1]!;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value);
  const match = raw.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : raw.slice(0, 10);
}
function dateRange(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return result;
}

function rulesJsonForStorage(rules?: TaskRules | null): string | null {
  if (!rules) return null;
  const { reservedNames: _reservedNames, saveAsTemplate: _saveAsTemplate, templateName: _templateName, ...stored } = rules;
  return JSON.stringify(stored);
}

function slotBounds(date: string, period: { start_minute: number; end_minute: number; end_day_offset: number }) {
  const start = new Date(`${date}T00:00:00Z`); start.setUTCMinutes(period.start_minute);
  const end = new Date(`${date}T00:00:00Z`); end.setUTCMinutes(period.end_minute); end.setUTCDate(end.getUTCDate() + period.end_day_offset + (period.end_minute <= period.start_minute && period.end_day_offset === 0 ? 1 : 0));
  return { start, end };
}

@Injectable()
export class ScheduleRepository {
  constructor(@Inject(DATABASE) private readonly db: Kysely<unknown>, @Inject(AuditService) private readonly audit: AuditService, @Inject(OutboxService) private readonly outbox: OutboxService, @Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  async createTemplate(input: { groupId: string; creatorId: string; name: string; templateType: string; periods: ShiftPeriodDefinition[]; requestId: string }): Promise<ShiftTemplate> {
    const templateId = newId();
    await this.db.transaction().execute(async (trx) => {
      await sql`insert into shift_templates (id, group_id, name, template_type, is_reusable, created_by) values (${parseId(templateId)}, ${parseId(input.groupId)}, ${input.name}, ${input.templateType}, true, ${parseId(input.creatorId)})`.execute(trx);
      for (const [index, period] of input.periods.entries()) {
        await sql`insert into shift_periods (id, template_id, code, label, start_minute, end_minute, end_day_offset, sort_order, default_min_people, default_target_people, default_max_people) values (${parseId(newId())}, ${parseId(templateId)}, ${period.code}, ${period.label}, ${period.startMinute}, ${period.endMinute}, ${period.endDayOffset ?? 0}, ${index}, ${period.minPeople ?? 1}, ${period.targetPeople ?? period.minPeople ?? 1}, ${period.maxPeople ?? period.targetPeople ?? period.minPeople ?? 1})`.execute(trx);
      }
      await this.audit.record({ actorId: input.creatorId, action: 'schedule.template.create', targetType: 'shift_template', targetId: templateId, requestId: input.requestId }, trx);
    });
    return (await this.findTemplate(input.groupId, templateId))!;
  }

  async findTemplate(groupId: string, templateId: string): Promise<ShiftTemplate | null> {
    const template = await sql<any>`select id, group_id, name, template_type from shift_templates where id = ${parseId(templateId)} and group_id = ${parseId(groupId)} and is_reusable = true and deleted_at is null limit 1`.execute(this.db);
    if (!template.rows[0]) return null;
    const periods = await sql<any>`select code, label, start_minute, end_minute, end_day_offset, default_min_people, default_target_people, default_max_people from shift_periods where template_id = ${parseId(templateId)} order by sort_order`.execute(this.db);
    return {
      id: stringifyId(template.rows[0].id),
      groupId: stringifyId(template.rows[0].group_id),
      name: template.rows[0].name,
      templateType: template.rows[0].template_type,
      periods: periods.rows.map((row) => ({ code: row.code, label: row.label, startMinute: row.start_minute, endMinute: row.end_minute, endDayOffset: row.end_day_offset, minPeople: row.default_min_people, targetPeople: row.default_target_people, maxPeople: row.default_max_people })),
    };
  }

  async getTemplate(groupId: string, templateId: string) { return this.findTemplate(groupId, templateId); }

  async listTemplates(groupId: string): Promise<ShiftTemplate[]> {
    const result = await sql<{ id: Buffer }>`select id from shift_templates where group_id = ${parseId(groupId)} and is_reusable = true and deleted_at is null order by updated_at desc`.execute(this.db);
    const templates = await Promise.all(result.rows.map((row) => this.findTemplate(groupId, stringifyId(row.id))));
    return templates.filter((template): template is ShiftTemplate => template !== null);
  }

  /** Global campus schedule presets (task-create Step2) stored in campus_schedule_presets. */
  async listCampusSchedulePresets() {
    const result = await sql<{
      code: string;
      label: string;
      first_start: string;
      duration_min: number;
      morning_count: number;
      afternoon_count: number;
      evening_count: number;
      break_min: number;
      sort_order: number;
      source_note: string | null;
    }>`
      select code, label, first_start, duration_min, morning_count, afternoon_count, evening_count, break_min, sort_order, source_note
      from campus_schedule_presets
      where is_active = true
      order by sort_order asc, code asc
    `.execute(this.db);
    return result.rows.map((row) => ({
      code: row.code,
      label: row.label,
      firstStart: row.first_start,
      durationMin: Number(row.duration_min),
      morningCount: Number(row.morning_count),
      afternoonCount: Number(row.afternoon_count),
      eveningCount: Number(row.evening_count),
      breakMin: Number(row.break_min),
      sortOrder: Number(row.sort_order),
      sourceNote: row.source_note,
    }));
  }

  async listOptionCatalog(categories?: string[]) {
    const filter =
      categories && categories.length
        ? sql`and category in (${sql.join(categories.map((c) => sql`${c}`))})`
        : sql``;
    const result = await sql<{
      category: string;
      code: string;
      label: string;
      value_json: unknown;
      sort_order: number;
    }>`
      select category, code, label, value_json, sort_order
      from app_option_catalogs
      where is_active = true
      ${filter}
      order by category asc, sort_order asc, code asc
    `.execute(this.db);
    return result.rows.map((row) => ({
      category: row.category,
      code: row.code,
      label: row.label,
      value: row.value_json,
      sortOrder: Number(row.sort_order),
    }));
  }

  async getOptionLabel(category: string, code: string): Promise<string | null> {
    const result = await sql<{ label: string }>`
      select label from app_option_catalogs
      where category = ${category} and code = ${code} and is_active = true
      limit 1
    `.execute(this.db);
    return result.rows[0]?.label ?? null;
  }

  async createTask(input: {
    groupId: string;
    publisherId: string;
    title: string;
    description?: string;
    dateStart: string;
    dateEnd: string;
    deadline: Date;
    templateId?: string;
    periods: ShiftPeriodDefinition[];
    timeMode?: string;
    selectedSlots?: SelectedSlotInput[];
    rules?: TaskRules;
    requestId: string;
  }): Promise<ScheduleTask> {
    const taskId = newId(); const templateId = input.templateId ?? newId();
    const rulesJson = rulesJsonForStorage(input.rules ?? null);
    const reservedNames = input.rules?.reservedNames?.map((name) => name.trim()).filter(Boolean) ?? [];
    await this.db.transaction().execute(async (trx) => {
      if (!input.templateId) {
        await sql`insert into shift_templates (id, group_id, name, template_type, is_reusable, created_by) values (${parseId(templateId)}, ${parseId(input.groupId)}, ${input.title}, 'custom', false, ${parseId(input.publisherId)})`.execute(trx);
        for (const [index, period] of input.periods.entries()) {
          await sql`insert into shift_periods (id, template_id, code, label, start_minute, end_minute, end_day_offset, sort_order, default_min_people, default_target_people, default_max_people) values (${parseId(newId())}, ${parseId(templateId)}, ${period.code}, ${period.label}, ${period.startMinute}, ${period.endMinute}, ${period.endDayOffset ?? 0}, ${index}, ${period.minPeople ?? 1}, ${period.targetPeople ?? period.minPeople ?? 1}, ${period.maxPeople ?? period.targetPeople ?? period.minPeople ?? 1})`.execute(trx);
        }
      } else {
        const template = await sql<{ id: Buffer }>`select id from shift_templates where id = ${parseId(input.templateId)} and group_id = ${parseId(input.groupId)} and is_reusable = true and deleted_at is null limit 1`.execute(trx);
        if (!template.rows[0]) throw new Error('template not found');
      }
      if (input.rules?.saveAsTemplate && input.rules.templateName) {
        const reusableTemplateId = newId();
        await sql`insert into shift_templates (id, group_id, name, template_type, is_reusable, created_by) values (${parseId(reusableTemplateId)}, ${parseId(input.groupId)}, ${input.rules.templateName}, 'custom', true, ${parseId(input.publisherId)})`.execute(trx);
        for (const [index, period] of input.periods.entries()) {
          await sql`insert into shift_periods (id, template_id, code, label, start_minute, end_minute, end_day_offset, sort_order, default_min_people, default_target_people, default_max_people) values (${parseId(newId())}, ${parseId(reusableTemplateId)}, ${period.code}, ${period.label}, ${period.startMinute}, ${period.endMinute}, ${period.endDayOffset ?? 0}, ${index}, ${period.minPeople ?? 1}, ${period.targetPeople ?? period.minPeople ?? 1}, ${period.maxPeople ?? period.targetPeople ?? period.minPeople ?? 1})`.execute(trx);
        }
      }
      await sql`insert into schedule_tasks (id, group_id, template_id, title, description, status, date_start, date_end, deadline, publisher_id, time_mode, rules_json) values (${parseId(taskId)}, ${parseId(input.groupId)}, ${parseId(templateId)}, ${input.title}, ${input.description ?? null}, 'collecting', ${input.dateStart}, ${input.dateEnd}, ${input.deadline}, ${parseId(input.publisherId)}, ${input.timeMode ?? null}, ${rulesJson})`.execute(trx);
      const periodRows = await sql<{ id: Buffer; code: string; start_minute: number; end_minute: number; end_day_offset: number }>`select id, code, start_minute, end_minute, end_day_offset from shift_periods where template_id = ${parseId(templateId)} order by sort_order`.execute(trx);
      const periodByCode = new Map(periodRows.rows.map((row) => [row.code, row]));
      const periodDefaults = new Map(input.periods.map((period) => [period.code, period]));

      if (input.selectedSlots?.length) {
        for (const selected of input.selectedSlots) {
          const period = periodByCode.get(selected.periodCode);
          if (!period) throw new Error(`period not found: ${selected.periodCode}`);
          const source = periodDefaults.get(selected.periodCode);
          const { start, end } = slotBounds(selected.date, period);
          const maxPeople = selected.maxPeople ?? 1;
          await sql`insert into task_slots (id, task_id, period_id, slot_date, starts_at, ends_at, min_people, target_people, max_people) values (${parseId(newId())}, ${parseId(taskId)}, ${period.id}, ${selected.date}, ${start}, ${end}, ${source?.minPeople ?? 1}, ${source?.targetPeople ?? source?.minPeople ?? 1}, ${maxPeople})`.execute(trx);
        }
      } else {
        for (const date of dateRange(input.dateStart, input.dateEnd)) {
          for (const period of periodRows.rows) {
            const source = periodDefaults.get(period.code) ?? input.periods[periodRows.rows.indexOf(period)]!;
            const { start, end } = slotBounds(date, period);
            await sql`insert into task_slots (id, task_id, period_id, slot_date, starts_at, ends_at, min_people, target_people, max_people) values (${parseId(newId())}, ${parseId(taskId)}, ${period.id}, ${date}, ${start}, ${end}, ${source.minPeople ?? 1}, ${source.targetPeople ?? source.minPeople ?? 1}, ${source.maxPeople ?? source.targetPeople ?? source.minPeople ?? 1})`.execute(trx);
          }
        }
      }

      for (const [index, name] of reservedNames.entries()) {
        await sql`insert into task_reserved_names (id, task_id, name, sort_order) values (${parseId(newId())}, ${parseId(taskId)}, ${name}, ${index})`.execute(trx);
      }

      await this.audit.record({ actorId: input.publisherId, action: 'schedule.task.create', targetType: 'task', targetId: taskId, requestId: input.requestId }, trx);
      const context = await sql<{ creator_name: string }>`select coalesce(m.display_name, u.nickname) as creator_name from users u left join group_members m on m.group_id = ${parseId(input.groupId)} and m.user_id = u.id where u.id = ${parseId(input.publisherId)} limit 1`.execute(trx);
      await this.outbox.enqueueGroup(input.groupId, 'schedule.collection.started', {
        taskId,
        title: input.title,
        description: input.description || '请在截止前提交可用时间',
        creatorName: context.rows[0]?.creator_name || '排班管理员',
        deadline: input.deadline.toISOString(),
      }, `task-created:${taskId}`, trx);
    });
    return (await this.findTask(taskId))!;
  }

  async findTask(taskId: string, executor: Kysely<unknown> = this.db): Promise<ScheduleTask | null> {
    const result = await sql<any>`select id, group_id, title, description, status, date_start, date_end, deadline, publisher_id, version, time_mode, rules_json from schedule_tasks where id = ${parseId(taskId)} and deleted_at is null limit 1`.execute(executor);
    if (!result.rows[0]) return null;
    const reserved = await sql<{ name: string }>`select name from task_reserved_names where task_id = ${parseId(taskId)} order by sort_order, created_at`.execute(executor);
    return taskFromRow(result.rows[0], reserved.rows.map((row) => row.name));
  }
  async listTasks(groupId: string): Promise<ScheduleTask[]> {
    const result = await sql<any>`select id, group_id, title, description, status, date_start, date_end, deadline, publisher_id, version, time_mode, rules_json from schedule_tasks where group_id = ${parseId(groupId)} and deleted_at is null order by updated_at desc`.execute(this.db);
    if (!result.rows.length) return [];
    const taskIds = result.rows.map((row) => row.id as Buffer);
    const reserved = await sql<{ task_id: Buffer; name: string }>`
      select task_id, name
      from task_reserved_names
      where task_id in (${sql.join(taskIds)})
      order by sort_order, created_at
    `.execute(this.db);
    const namesByTask = new Map<string, string[]>();
    for (const row of reserved.rows) {
      const taskId = stringifyId(row.task_id);
      const names = namesByTask.get(taskId) ?? [];
      names.push(row.name);
      namesByTask.set(taskId, names);
    }
    return result.rows.map((row) => taskFromRow(row, namesByTask.get(stringifyId(row.id)) ?? []));
  }
  async listSlots(taskId: string): Promise<TaskSlot[]> {
    const result = await sql<any>`select id, task_id, period_id, slot_date, starts_at, ends_at, min_people, target_people, max_people from task_slots where task_id = ${parseId(taskId)} order by starts_at`.execute(this.db);
    return result.rows.map(slotFromRow);
  }
  async collectionSummary(task: ScheduleTask) {
    const [members, submitted, riskSlots] = await Promise.all([
      sql<any>`select count(*) as count from group_members where group_id = ${parseId(task.groupId)} and status = 'active'`.execute(this.db),
      sql<any>`select count(*) as count from availability_submissions s join group_members m on m.group_id = ${parseId(task.groupId)} and m.user_id = s.user_id and m.status = 'active' where s.task_id = ${parseId(task.id)} and s.submission_version = (select max(s2.submission_version) from availability_submissions s2 where s2.task_id = s.task_id and s2.user_id = s.user_id)`.execute(this.db),
      sql<any>`select ts.id, ts.slot_date, ts.starts_at, ts.ends_at, ts.min_people, count(distinct case when e.state in ('available','preferred') then s.user_id end) as available_count from task_slots ts left join availability_entries e on e.slot_id = ts.id left join availability_submissions s on s.id = e.submission_id and s.task_id = ${parseId(task.id)} and s.submission_version = (select max(s2.submission_version) from availability_submissions s2 where s2.task_id = s.task_id and s2.user_id = s.user_id) where ts.task_id = ${parseId(task.id)} group by ts.id, ts.slot_date, ts.starts_at, ts.ends_at, ts.min_people order by ts.starts_at`.execute(this.db),
    ]);
    const totalMembers = Number(members.rows[0]?.count ?? 0); const submittedMembers = Number(submitted.rows[0]?.count ?? 0);
    return { totalMembers, submittedMembers, missingMembers: Math.max(totalMembers - submittedMembers, 0), progress: totalMembers ? Math.round((submittedMembers / totalMembers) * 100) : 0, riskSlots: riskSlots.rows.filter((row) => Number(row.available_count) < Number(row.min_people)).map((row) => ({ slotId: stringifyId(row.id), slotDate: asYmd(row.slot_date), startsAt: row.starts_at, endsAt: row.ends_at, minPeople: Number(row.min_people), availableCount: Number(row.available_count) })) };
  }
  async listFixedAssignments(taskId: string) {
    const result = await sql<any>`select slot_id, user_id from task_fixed_assignments where task_id = ${parseId(taskId)} order by slot_id, user_id`.execute(this.db);
    return result.rows.map((row) => ({ slotId: stringifyId(row.slot_id), userId: stringifyId(row.user_id) }));
  }
  async replaceFixedAssignments(taskId: string, actorId: string, assignments: Array<{ slotId: string; userId: string }>, requestId: string) {
    await this.db.transaction().execute(async (trx) => {
      await sql`delete from task_fixed_assignments where task_id = ${parseId(taskId)}`.execute(trx);
      for (const assignment of assignments) {
        await sql`insert into task_fixed_assignments (id, task_id, slot_id, user_id, created_by) values (${parseId(newId())}, ${parseId(taskId)}, ${parseId(assignment.slotId)}, ${parseId(assignment.userId)}, ${parseId(actorId)})`.execute(trx);
      }
      await this.audit.record({ actorId, action: 'schedule.fixed_assignments.replace', targetType: 'task', targetId: taskId, requestId, metadata: { count: assignments.length } }, trx);
    });
    return this.listFixedAssignments(taskId);
  }
  async saveAvailability(taskId: string, userId: string, entries: AvailabilityEntry[], requestId: string): Promise<{ version: number }> {
    return this.db.transaction().execute(async (trx) => {
      const latest = await sql<{ version: number }>`select coalesce(max(submission_version), 0) as version from availability_submissions where task_id = ${parseId(taskId)} and user_id = ${parseId(userId)}`.execute(trx);
      const version = Number(latest.rows[0]?.version ?? 0) + 1; const submissionId = newId();
      await sql`insert into availability_submissions (id, task_id, user_id, submission_version) values (${parseId(submissionId)}, ${parseId(taskId)}, ${parseId(userId)}, ${version})`.execute(trx);
      for (const entry of entries) await sql`insert into availability_entries (id, submission_id, slot_id, state, note) values (${parseId(newId())}, ${parseId(submissionId)}, ${parseId(entry.slotId)}, ${entry.state}, ${entry.note ?? null})`.execute(trx);
      await this.audit.record({ actorId: userId, action: 'schedule.availability.submit', targetType: 'task', targetId: taskId, requestId, metadata: { version } }, trx);
      return { version };
    });
  }
  async latestAvailability(taskId: string, userId: string) {
    const result = await sql<any>`select e.slot_id, e.state, e.note, s.submission_version from availability_entries e join availability_submissions s on s.id = e.submission_id where s.task_id = ${parseId(taskId)} and s.user_id = ${parseId(userId)} and s.submission_version = (select max(s2.submission_version) from availability_submissions s2 where s2.task_id = s.task_id and s2.user_id = s.user_id) order by e.slot_id`.execute(this.db);
    return result.rows.map((row) => ({ slotId: stringifyId(row.slot_id), state: row.state, note: row.note, version: row.submission_version }));
  }
  async latestAvailabilityStates(taskId: string) {
    const result = await sql<any>`select s.user_id, e.slot_id, e.state from availability_entries e join availability_submissions s on s.id = e.submission_id where s.task_id = ${parseId(taskId)} and s.submission_version = (select max(s2.submission_version) from availability_submissions s2 where s2.task_id = s.task_id and s2.user_id = s.user_id)`.execute(this.db);
    return result.rows.map((row) => ({ userId: stringifyId(row.user_id), slotId: stringifyId(row.slot_id), state: row.state }));
  }
  async buildSolverSnapshot(task: ScheduleTask) {
    const [membersResult, slots, availabilityResult] = await Promise.all([
      sql<any>`select user_id from group_members where group_id = ${parseId(task.groupId)} and status = 'active'`.execute(this.db),
      this.listSlots(task.id),
      sql<any>`select s.user_id, e.slot_id, e.state from availability_entries e join availability_submissions s on s.id = e.submission_id where s.task_id = ${parseId(task.id)} and s.submission_version = (select max(s2.submission_version) from availability_submissions s2 where s2.task_id = s.task_id and s2.user_id = s.user_id)`.execute(this.db),
    ]);
    const members = membersResult.rows.map((row: any) => stringifyId(row.user_id));
    const availability: Record<string, Record<string, string>> = Object.fromEntries(members.map((id: string) => [id, {}]));
    for (const row of availabilityResult.rows) availability[stringifyId(row.user_id)]![stringifyId(row.slot_id)] = row.state;
    const fixedAssignments = await this.listFixedAssignments(task.id);
    return {
      taskId: task.id,
      taskVersion: task.version,
      members: members.map((id: string) => ({ id })),
      slots: slots.map((slot) => ({ id: slot.id, start: slot.startsAt.toISOString(), end: slot.endsAt.toISOString(), minPeople: slot.minPeople, targetPeople: slot.targetPeople, maxPeople: slot.maxPeople })),
      availability,
      maxShiftsPerMember: slots.length,
      fixedAssignments: fixedAssignments.map((item) => ({ slotId: item.slotId, memberId: item.userId })),
    };
  }
  async setStatus(taskId: string, status: string, expectedVersion: number | undefined, executor: Kysely<unknown> = this.db): Promise<void> {
    const result = await sql`update schedule_tasks set status = ${status}, version = version + 1, updated_at = current_timestamp(3) where id = ${parseId(taskId)} and deleted_at is null ${expectedVersion === undefined ? sql`` : sql`and version = ${expectedVersion}`}`.execute(executor);
    if (Number((result as any).numAffectedRows) !== 1) throw new Error('task version conflict');
  }
  async updateDeadline(taskId: string, deadline: Date, expectedVersion: number, actorId: string, requestId: string) {
    return this.db.transaction().execute(async (trx) => {
      const result = await sql`update schedule_tasks set deadline = ${deadline}, version = version + 1 where id = ${parseId(taskId)} and version = ${expectedVersion} and deleted_at is null`.execute(trx);
      if (Number((result as any).numAffectedRows) !== 1) throw new Error('task version conflict');
      await this.audit.record({ actorId, action: 'schedule.task.extend', targetType: 'task', targetId: taskId, requestId, metadata: { deadline: deadline.toISOString() } }, trx);
    });
  }
  async transition(task: ScheduleTask, status: string, actorId: string, requestId: string) {
    await this.db.transaction().execute(async (trx) => {
      await this.setStatus(task.id, status, task.version, trx);
      await this.audit.record({ actorId, action: `schedule.task.${status}`, targetType: 'task', targetId: task.id, requestId }, trx);
    });
  }
  async createSolverJob(task: ScheduleTask, userId: string, idempotencyKey: string, snapshot: Record<string, unknown>, snapshotHash: string, requestId: string) {
    return this.db.transaction().execute(async (trx) => {
      const existing = await sql<any>`select id, task_id, status, progress, snapshot_hash from solver_jobs where idempotency_key = ${idempotencyKey} limit 1`.execute(trx);
      if (existing.rows[0]) return { id: stringifyId(existing.rows[0].id), status: existing.rows[0].status, progress: existing.rows[0].progress, snapshotHash: existing.rows[0].snapshot_hash };
      const jobId = newId();
      await sql`insert into solver_jobs (id, task_id, snapshot_hash, status, idempotency_key, created_by) values (${parseId(jobId)}, ${parseId(task.id)}, ${snapshotHash}, 'queued', ${idempotencyKey}, ${parseId(userId)})`.execute(trx);
      await sql`insert into solver_snapshots (id, job_id, task_id, snapshot_json) values (${parseId(newId())}, ${parseId(jobId)}, ${parseId(task.id)}, ${JSON.stringify(snapshot)})`.execute(trx);
      await this.setStatus(task.id, 'solving', task.version, trx);
      await this.audit.record({ actorId: userId, action: 'schedule.solve.request', targetType: 'task', targetId: task.id, requestId, metadata: { jobId } }, trx);
      return { id: jobId, status: 'queued', progress: 0, snapshotHash };
    });
  }
  async findJob(jobId: string) { const result = await sql<any>`select id, task_id, status, progress, snapshot_hash, error_json from solver_jobs where id = ${parseId(jobId)} limit 1`.execute(this.db); return result.rows[0] ? { id: stringifyId(result.rows[0].id), taskId: stringifyId(result.rows[0].task_id), status: result.rows[0].status, progress: result.rows[0].progress, snapshotHash: result.rows[0].snapshot_hash, error: result.rows[0].error_json } : null; }
  async findJobByIdempotencyKey(key: string) { const result = await sql<any>`select id, task_id, status, progress, snapshot_hash, error_json from solver_jobs where idempotency_key = ${key} limit 1`.execute(this.db); return result.rows[0] ? { id: stringifyId(result.rows[0].id), taskId: stringifyId(result.rows[0].task_id), status: result.rows[0].status, progress: result.rows[0].progress, snapshotHash: result.rows[0].snapshot_hash, error: result.rows[0].error_json } : null; }
  async listCandidates(jobId: string) { const result = await sql<any>`select id, candidate_index, score, explanation_json, assignments_json from schedule_candidates where job_id = ${parseId(jobId)} order by candidate_index`.execute(this.db); return result.rows.map((row) => ({ id: stringifyId(row.id), index: row.candidate_index, score: row.score, explanation: row.explanation_json, assignments: row.assignments_json })); }
  async publish(task: ScheduleTask, userId: string, assignments: Array<{ slotId: string; userId: string }>, requestId: string) {
    return this.db.transaction().execute(async (trx) => {
      const versionId = newId();
      const latest = await sql<{ version_number: number }>`select coalesce(max(version_number), 0) as version_number from schedule_versions where task_id = ${parseId(task.id)}`.execute(trx);
      const versionNumber = Number(latest.rows[0]?.version_number ?? 0) + 1;
      await sql`insert into schedule_versions (id, task_id, version_number, published_by) values (${parseId(versionId)}, ${parseId(task.id)}, ${versionNumber}, ${parseId(userId)})`.execute(trx);
      for (const assignment of assignments) await sql`insert into schedule_assignments (id, version_id, slot_id, user_id, source) values (${parseId(newId())}, ${parseId(versionId)}, ${parseId(assignment.slotId)}, ${parseId(assignment.userId)}, 'manual')`.execute(trx);
      const members = await sql<{ user_id: Buffer }>`select user_id from group_members where group_id = ${parseId(task.groupId)} and status = 'active'`.execute(trx);
      for (const member of members.rows) await sql`insert into schedule_receipts (id, version_id, user_id) values (${parseId(newId())}, ${parseId(versionId)}, ${member.user_id})`.execute(trx);
      await sql`update share_links set revoked_at = current_timestamp(3) where task_id = ${parseId(task.id)} and revoked_at is null`.execute(trx);
      await sql`update schedule_tasks set status = 'published', published_version = ${versionNumber}, version = version + 1 where id = ${parseId(task.id)}`.execute(trx);
      await this.audit.record({ actorId: userId, action: 'schedule.publish', targetType: 'task', targetId: task.id, requestId, metadata: { versionId, assignmentCount: assignments.length } }, trx);
      await this.outbox.enqueueGroup(task.groupId, 'schedule.published', { taskId: task.id, versionId, versionNumber }, `schedule-published:${versionId}`, trx);
      return { versionId, versionNumber };
    });
  }
  async receipt(userId: string, versionId: string, status: 'received' | 'objected') { await sql`update schedule_receipts set status = ${status}, received_at = current_timestamp(3) where version_id = ${parseId(versionId)} and user_id = ${parseId(userId)}`.execute(this.db); }
  async objection(task: ScheduleTask, userId: string, versionId: string, slotId: string | null, reason: string, requestId: string) {
    return this.db.transaction().execute(async (trx) => {
      const result = await sql<{ id: Buffer }>`select r.id from schedule_receipts r join schedule_versions v on v.id = r.version_id where v.task_id = ${parseId(task.id)} and r.version_id = ${parseId(versionId)} and r.user_id = ${parseId(userId)} limit 1 for update`.execute(trx);
      if (!result.rows[0]) throw new Error('receipt not found');
      const objectionId = newId();
      await sql`insert into schedule_objections (id, receipt_id, slot_id, reason) values (${parseId(objectionId)}, ${result.rows[0].id}, ${slotId ? parseId(slotId) : null}, ${reason})`.execute(trx);
      await sql`update schedule_receipts set status = 'objected', received_at = current_timestamp(3) where id = ${result.rows[0].id}`.execute(trx);
      await this.audit.record({ actorId: userId, action: 'schedule.objection.create', targetType: 'objection', targetId: objectionId, requestId, metadata: { taskId: task.id, versionId } }, trx);
      await this.outbox.enqueueUser(task.publisherId, 'schedule.objection.created', { taskId: task.id, versionId, objectionId }, `objection-created:${objectionId}`, trx);
      return { id: objectionId, status: 'open' };
    });
  }
  async listObjections(taskId: string, versionId: string) {
    const result = await sql<any>`select o.id, o.slot_id, o.reason, o.status, o.resolution_note, o.created_at, o.resolved_at, o.resolved_by, r.user_id, r.version_id from schedule_objections o join schedule_receipts r on r.id = o.receipt_id where r.version_id = ${parseId(versionId)} and exists (select 1 from schedule_versions v where v.id = r.version_id and v.task_id = ${parseId(taskId)}) order by o.created_at desc`.execute(this.db);
    return result.rows.map((row) => ({ id: stringifyId(row.id), versionId: stringifyId(row.version_id), slotId: row.slot_id ? stringifyId(row.slot_id) : null, userId: stringifyId(row.user_id), reason: row.reason, status: row.status, resolutionNote: row.resolution_note, createdAt: row.created_at, resolvedAt: row.resolved_at, resolvedBy: row.resolved_by ? stringifyId(row.resolved_by) : null }));
  }
  async resolveObjection(taskId: string, versionId: string, objectionId: string, actorId: string, status: 'accepted' | 'rejected', note: string, requestId: string) {
    return this.db.transaction().execute(async (trx) => {
      const objection = await sql<{ user_id: Buffer }>`select r.user_id from schedule_objections o join schedule_receipts r on r.id = o.receipt_id join schedule_versions v on v.id = r.version_id where o.id = ${parseId(objectionId)} and r.version_id = ${parseId(versionId)} and v.task_id = ${parseId(taskId)} and o.status = 'open' limit 1 for update`.execute(trx);
      if (!objection.rows[0]) throw new Error('objection not found or already resolved');
      const result = await sql<any>`update schedule_objections set status = ${status}, resolution_note = ${note}, resolved_by = ${parseId(actorId)}, resolved_at = current_timestamp(3) where id = ${parseId(objectionId)} and status = 'open'`.execute(trx);
      if (Number((result as any).numAffectedRows) !== 1) throw new Error('objection not found or already resolved');
      if (status === 'accepted') await sql`update schedule_tasks set status = 'adjusting', version = version + 1 where id = ${parseId(taskId)} and status = 'published'`.execute(trx);
      await this.audit.record({ actorId, action: `schedule.objection.${status}`, targetType: 'objection', targetId: objectionId, requestId, metadata: { taskId, versionId, note } }, trx);
      const objectorId = stringifyId(objection.rows[0].user_id);
      await this.outbox.enqueueUser(objectorId, 'schedule.objection.resolved', { taskId, versionId, objectionId, status }, `objection-resolved:${objectionId}`, trx);
      return { id: objectionId, status, resolutionNote: note };
    });
  }
  async createShare(taskId: string, versionId: string, tokenHash: string, expiresAt: Date, actorId: string) { const id = newId(); await sql`insert into share_links (id, task_id, version_id, token_hash, expires_at, created_by) values (${parseId(id)}, ${parseId(taskId)}, ${parseId(versionId)}, ${tokenHash}, ${expiresAt}, ${parseId(actorId)})`.execute(this.db); return { id, expiresAt }; }

  /** Ensure a draft schedule_versions row exists for collection-phase share_links FK. */
  async ensureCollectionDraftVersion(taskId: string, actorId: string): Promise<string> {
    const existing = await sql<{ id: Buffer }>`
      select id from schedule_versions
      where task_id = ${parseId(taskId)} and status = 'draft'
      order by version_number asc
      limit 1
    `.execute(this.db);
    if (existing.rows[0]) return stringifyId(existing.rows[0].id);
    const versionId = newId();
    await sql`
      insert into schedule_versions (id, task_id, version_number, status, published_by)
      values (${parseId(versionId)}, ${parseId(taskId)}, 0, 'draft', ${parseId(actorId)})
    `.execute(this.db);
    return versionId;
  }

  async createCollectionShare(taskId: string, tokenHash: string, expiresAt: Date, actorId: string) {
    const versionId = await this.ensureCollectionDraftVersion(taskId, actorId);
    return this.createShare(taskId, versionId, tokenHash, expiresAt, actorId);
  }

  async latestSubmissionVersion(taskId: string, userId: string): Promise<number> {
    const latest = await sql<{ version: number }>`
      select coalesce(max(submission_version), 0) as version
      from availability_submissions
      where task_id = ${parseId(taskId)} and user_id = ${parseId(userId)}
    `.execute(this.db);
    return Number(latest.rows[0]?.version ?? 0);
  }

  async findValidShareForTask(taskId: string, tokenHash: string): Promise<boolean> {
    const result = await sql<{ id: Buffer }>`
      select id from share_links
      where task_id = ${parseId(taskId)}
        and token_hash = ${tokenHash}
        and revoked_at is null
        and expires_at > current_timestamp(3)
      limit 1
    `.execute(this.db);
    return result.rows.length > 0;
  }
  async revokeShare(shareId: string, actorId: string) { const result = await sql`update share_links l join schedule_tasks t on t.id = l.task_id join group_members m on m.group_id = t.group_id and m.user_id = ${parseId(actorId)} and m.status = 'active' and m.role_in_group in ('owner','admin') set l.revoked_at = current_timestamp(3) where l.id = ${parseId(shareId)} and l.revoked_at is null`.execute(this.db); if (Number((result as any).numAffectedRows) !== 1) throw new Error('share not found'); }
  async publicShare(tokenHash: string) {
    const link = await sql<any>`select id, task_id, version_id, expires_at from share_links where token_hash = ${tokenHash} and revoked_at is null and expires_at > current_timestamp(3) limit 1`.execute(this.db);
    if (!link.rows[0]) return null;
    await sql`update share_links set access_count = access_count + 1 where id = ${link.rows[0].id}`.execute(this.db);
    const task = await sql<any>`select t.title, g.name as group_name, v.version_number, v.published_at from schedule_tasks t join \`groups\` g on g.id = t.group_id join schedule_versions v on v.id = ${link.rows[0].version_id} where t.id = ${link.rows[0].task_id}`.execute(this.db);
    const assignments = await sql<any>`select s.starts_at, s.ends_at, u.nickname from schedule_assignments a join task_slots s on s.id = a.slot_id join users u on u.id = a.user_id where a.version_id = ${link.rows[0].version_id} and a.is_active = true order by s.starts_at, u.nickname`.execute(this.db);
    return { title: task.rows[0]?.title, groupName: task.rows[0]?.group_name, version: task.rows[0]?.version_number, publishedAt: task.rows[0]?.published_at, expiresAt: link.rows[0].expires_at, assignments: assignments.rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at, displayName: row.nickname })) };
  }
  async publishedSchedule(taskId: string) {
    const version = await sql<any>`select id, version_number, published_at from schedule_versions where task_id = ${parseId(taskId)} and status = 'published' order by version_number desc limit 1`.execute(this.db);
    if (!version.rows[0]) return null;
    const assignments = await sql<any>`select a.slot_id, a.user_id, s.starts_at, s.ends_at, u.nickname, p.phone_ciphertext, p.phone_iv, p.phone_auth_tag, p.phone_key_version from schedule_assignments a join task_slots s on s.id = a.slot_id join users u on u.id = a.user_id left join user_private_profiles p on p.user_id = u.id and p.deleted_at is null where a.version_id = ${version.rows[0].id} and a.is_active = true order by s.starts_at, u.nickname`.execute(this.db);
    return { versionId: stringifyId(version.rows[0].id), versionNumber: version.rows[0].version_number, publishedAt: version.rows[0].published_at, assignments: assignments.rows.map((row) => ({ slotId: stringifyId(row.slot_id), userId: stringifyId(row.user_id), displayName: row.nickname, phone: row.phone_ciphertext ? this.privacy.projectMaskedPhone({ ciphertext: row.phone_ciphertext, iv: row.phone_iv, authTag: row.phone_auth_tag, keyVersion: row.phone_key_version }, true) : null, startsAt: row.starts_at, endsAt: row.ends_at })) };
  }

  async personalPublishedSchedule(userId: string) {
    const result = await sql<any>`
      select a.id, a.slot_id, a.user_id, s.starts_at, s.ends_at, s.slot_date,
             t.id as task_id, t.title, g.id as group_id, g.name as group_name,
             v.id as version_id, v.version_number, v.published_at,
             u.nickname, p.phone_ciphertext, p.phone_iv, p.phone_auth_tag, p.phone_key_version
      from schedule_assignments a
      join schedule_versions v on v.id = a.version_id and v.status = 'published'
      join schedule_tasks t on t.id = v.task_id and t.deleted_at is null
      join \`groups\` g on g.id = t.group_id and g.deleted_at is null
      join task_slots s on s.id = a.slot_id
      join group_members gm on gm.group_id = g.id and gm.user_id = ${parseId(userId)} and gm.status = 'active'
      join users u on u.id = a.user_id
      left join user_private_profiles p on p.user_id = u.id and p.deleted_at is null
      where a.user_id = ${parseId(userId)} and a.is_active = true
        and v.id = (select v2.id from schedule_versions v2 where v2.task_id = t.id and v2.status = 'published' order by v2.version_number desc limit 1)
      order by s.starts_at, g.name, t.title
    `.execute(this.db);
    return result.rows.map((row) => ({
      id: stringifyId(row.id), taskId: stringifyId(row.task_id), groupId: stringifyId(row.group_id),
      groupName: row.group_name, taskTitle: row.title, versionId: stringifyId(row.version_id),
      versionNumber: row.version_number, publishedAt: row.published_at, slotDate: asYmd(row.slot_date),
      startsAt: row.starts_at, endsAt: row.ends_at, displayName: row.nickname ?? null,
      phone: row.phone_ciphertext ? this.privacy.projectMaskedPhone({ ciphertext: row.phone_ciphertext, iv: row.phone_iv, authTag: row.phone_auth_tag, keyVersion: row.phone_key_version }, true) : null,
    }));
  }
}
