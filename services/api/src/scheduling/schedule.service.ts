import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { GroupRepository, type MemberRecord } from '../groups/group.repository.js';
import { canGroup, type GroupAction } from '../groups/group.policy.js';
import { REDIS } from '../redis/redis.tokens.js';
import { ScheduleRepository, type AvailabilityEntry, type ScheduleTask, type ShiftPeriodDefinition } from './schedule.repository.js';

type PeriodInput = { code: string; label: string; startMinute: number; endMinute: number; endDayOffset?: number; minPeople?: number; targetPeople?: number; maxPeople?: number };
type SelectedSlotInput = { date: string; periodCode: string; maxPeople?: number };
type TaskRulesInput = {
  requiredFields: Array<'name' | 'studentId' | 'phone'>;
  participantScope: 'all_members' | 'share_link' | 'reserved_list';
  reservedNames?: string[];
  allowEditAfterSubmit: boolean;
  maxEditCount: number;
  remindBeforeMinutes: number | null;
  saveAsTemplate?: boolean;
  templateName?: string;
};
const TIME_MODES = new Set(['range', 'section', 'section_range']);
const REQUIRED_FIELD_OPTIONS = new Set(['name', 'studentId', 'phone']);
const PARTICIPANT_SCOPES = new Set(['all_members', 'share_link', 'reserved_list']);
/** Inclusive calendar days for task dateStart..dateEnd (product cap: one week). */
const MAX_TASK_SPAN_DAYS = 7;

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(ScheduleRepository) private readonly schedules: ScheduleRepository,
    @Inject(GroupRepository) private readonly groups: GroupRepository,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async createTemplate(actorId: string, groupId: string, input: { name: string; templateType?: string; periods: PeriodInput[] }, requestId: string) {
    await this.requireGroup(actorId, groupId, 'manageTasks');
    const name = input.name?.trim();
    if (!name || name.length > 120 || !Array.isArray(input.periods) || input.periods.length === 0 || input.periods.length > 24) throw new BadRequestException('Invalid template');
    for (const period of input.periods) this.validatePeriod(period);
    return this.schedules.createTemplate({ groupId, creatorId: actorId, name, templateType: input.templateType?.trim() || 'custom', periods: input.periods, requestId });
  }
  async listTemplates(actorId: string, groupId: string) { await this.requireGroup(actorId, groupId, 'view'); return this.schedules.listTemplates(groupId); }

  async listCampusSchedulePresets(_actorId: string) {
    return this.schedules.listCampusSchedulePresets();
  }

  async listOptionCatalog(_actorId: string, categories?: string[]) {
    return this.schedules.listOptionCatalog(categories);
  }

  /** Bundled catalog payload for task-create / labels (all DB-backed). */
  async taskCreateCatalog(_actorId: string) {
    const [presets, options] = await Promise.all([
      this.schedules.listCampusSchedulePresets(),
      this.schedules.listOptionCatalog([
        'required_field',
        'participant_scope',
        'remind_minutes',
        'task_status',
        'group_role',
        'wizard_step',
        'time_mode',
        'group_default',
      ]),
    ]);
    const byCategory = (cat: string) => options.filter((o) => o.category === cat);
    return {
      campusPresets: presets,
      requiredFields: byCategory('required_field').map((o) => ({ key: o.code, label: o.label })),
      participantScopes: byCategory('participant_scope').map((o) => ({ key: o.code, label: o.label })),
      remindOptions: byCategory('remind_minutes').map((o) => ({
        key: o.code,
        label: o.label,
        value: o.value as number | null,
      })),
      taskStatuses: Object.fromEntries(byCategory('task_status').map((o) => [o.code, o.label])),
      groupRoles: Object.fromEntries(byCategory('group_role').map((o) => [o.code, o.label])),
      wizardSteps: byCategory('wizard_step').map((o) => ({
        index: Number(o.value ?? o.code),
        label: o.label,
      })),
      timeModes: byCategory('time_mode').map((o) => ({ key: o.code, label: o.label })),
      groupDefaultDescription:
        byCategory('group_default').find((o) => o.code === 'description')?.label || '排班协作分组',
    };
  }

  async createTask(
    actorId: string,
    groupId: string,
    input: {
      title: string;
      description?: string;
      dateStart: string;
      dateEnd: string;
      deadline: string;
      templateId?: string;
      periods?: PeriodInput[];
      timeMode?: 'range' | 'section' | 'section_range';
      selectedSlots?: SelectedSlotInput[];
      rules?: TaskRulesInput;
    },
    requestId: string,
  ) {
    await this.requireGroup(actorId, groupId, 'manageTasks');
    const title = input.title?.trim(); const deadline = new Date(input.deadline);
    if (!title || title.length > 160 || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateEnd) || Number.isNaN(deadline.getTime())) throw new BadRequestException('Invalid task title, date range or deadline');
    if (input.dateEnd < input.dateStart || deadline <= new Date()) throw new BadRequestException('Task dates and deadline must be in the future');
    if (this.inclusiveDaySpan(input.dateStart, input.dateEnd) > MAX_TASK_SPAN_DAYS) {
      throw new BadRequestException(`Task date range cannot exceed ${MAX_TASK_SPAN_DAYS} days`);
    }
    if (input.timeMode !== undefined && !TIME_MODES.has(input.timeMode)) throw new BadRequestException('Invalid timeMode');
    let periods = input.periods;
    if (input.templateId) {
      const template = await this.schedules.findTemplate(groupId, input.templateId);
      if (!template) throw new NotFoundException('Shift template not found');
      periods = template.periods;
    }
    if (!Array.isArray(periods) || periods.length === 0 || periods.length > 24) throw new BadRequestException('At least one period is required');
    for (const period of periods) this.validatePeriod(period);
    const selectedSlots = this.validateSelectedSlots(input.selectedSlots, periods, input.dateStart, input.dateEnd);
    const rules = this.validateRules(input.rules);
    return this.schedules.createTask({
      groupId,
      publisherId: actorId,
      title,
      ...(input.description ? { description: input.description.trim() } : {}),
      dateStart: input.dateStart,
      dateEnd: input.dateEnd,
      deadline,
      ...(input.templateId ? { templateId: input.templateId } : {}),
      periods,
      ...(input.timeMode ? { timeMode: input.timeMode } : {}),
      ...(selectedSlots ? { selectedSlots } : {}),
      ...(rules ? { rules } : {}),
      requestId,
    });
  }
  async listTasks(actorId: string, groupId: string) { await this.requireGroup(actorId, groupId, 'view'); return this.schedules.listTasks(groupId); }
  async getTask(actorId: string, taskId: string) { const task = await this.requireTask(actorId, taskId, 'view'); return { ...task, slots: await this.schedules.listSlots(taskId) }; }
  async collectionSummary(actorId: string, taskId: string) { const task = await this.requireTask(actorId, taskId, 'manageTasks'); return this.schedules.collectionSummary(task); }

  async submitAvailability(
    actorId: string,
    taskId: string,
    entries: AvailabilityEntry[],
    requestId: string,
    shareToken?: string,
    profile?: { name?: string; studentId?: string; phone?: string },
  ) {
    const task = await this.requireTaskForAvailability(actorId, taskId, shareToken);
    if (task.status !== 'collecting' || task.deadline.getTime() <= Date.now()) throw new ConflictException('Availability collection is closed');

    const rules = task.rules;
    if (rules?.requiredFields?.length) {
      for (const field of rules.requiredFields) {
        const value = profile?.[field];
        if (typeof value !== 'string' || !value.trim()) {
          throw new BadRequestException(`Required field missing: ${field}`);
        }
      }
    }

    const priorVersion = await this.schedules.latestSubmissionVersion(taskId, actorId);
    // Legacy tasks without rules keep unlimited resubmit (pre-wizard behavior).
    if (priorVersion >= 1 && rules) {
      const allowEdit = rules.allowEditAfterSubmit === true;
      const maxEditCount = rules.maxEditCount ?? 0;
      if (!allowEdit) throw new ConflictException('Availability edits are not allowed after submit');
      // priorVersion is completed submissions; next submit is edit #priorVersion when first was version 1
      if (priorVersion >= 1 + maxEditCount) throw new ConflictException('Availability edit limit reached');
    }

    const slots = await this.schedules.listSlots(taskId); const validSlots = new Set(slots.map((slot) => slot.id));
    if (!Array.isArray(entries) || entries.length !== slots.length || new Set(entries.map((entry) => entry.slotId)).size !== entries.length) throw new BadRequestException('Submit exactly one state for every task slot');
    for (const entry of entries) if (!validSlots.has(entry.slotId) || !['unavailable', 'available', 'preferred'].includes(entry.state) || (entry.note?.length ?? 0) > 500) throw new BadRequestException('Invalid availability entry');
    return this.schedules.saveAvailability(taskId, actorId, entries, requestId);
  }
  async myAvailability(actorId: string, taskId: string) { await this.requireTask(actorId, taskId, 'view'); return this.schedules.latestAvailability(taskId, actorId); }

  /** Per-slot availability board for staffing after collection closes. */
  async availabilityBoard(actorId: string, taskId: string) {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    const [slots, states, members] = await Promise.all([
      this.schedules.listSlots(taskId),
      this.schedules.latestAvailabilityStates(taskId),
      this.groups.listMembers(task.groupId),
    ]);
    const memberName = new Map(
      members
        .filter((member) => member.status === 'active')
        .map((member) => [member.userId, member.displayName || member.userId]),
    );
    const bySlot: Record<string, Array<{ userId: string; displayName: string; state: string }>> = {};
    for (const slot of slots) bySlot[slot.id] = [];
    for (const row of states) {
      if (row.state !== 'available' && row.state !== 'preferred') continue;
      if (!bySlot[row.slotId]) bySlot[row.slotId] = [];
      bySlot[row.slotId]!.push({
        userId: row.userId,
        displayName: memberName.get(row.userId) || row.userId,
        state: row.state,
      });
    }
    for (const list of Object.values(bySlot)) {
      list.sort((a, b) => {
        if (a.state === b.state) return a.displayName.localeCompare(b.displayName, 'zh');
        return a.state === 'preferred' ? -1 : 1;
      });
    }
    return { taskId, bySlot };
  }
  async closeCollection(actorId: string, taskId: string, requestId: string) { const task = await this.requireTask(actorId, taskId, 'manageTasks'); if (task.status !== 'collecting') throw new ConflictException('Task is not collecting'); await this.schedules.transition(task, 'ready', actorId, requestId); return this.schedules.findTask(taskId); }
  async reopen(actorId: string, taskId: string, requestId: string) { const task = await this.requireTask(actorId, taskId, 'manageTasks'); if (!['ready', 'reviewing', 'failed'].includes(task.status)) throw new ConflictException('Task cannot be reopened'); await this.schedules.transition(task, 'collecting', actorId, requestId); return this.schedules.findTask(taskId); }
  async extendDeadline(actorId: string, taskId: string, deadline: string, requestId: string) { const task = await this.requireTask(actorId, taskId, 'manageTasks'); const value = new Date(deadline); if (Number.isNaN(value.getTime()) || value <= new Date()) throw new BadRequestException('Deadline must be in the future'); await this.schedules.updateDeadline(taskId, value, task.version, actorId, requestId); return this.schedules.findTask(taskId); }

  async requestSolve(actorId: string, taskId: string, idempotencyKey: string, requestId: string) {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    if (!idempotencyKey || idempotencyKey.length > 160) throw new BadRequestException('Idempotency-Key is required');
    const scopedKey = `${taskId}:${idempotencyKey}`;
    const existing = await this.schedules.findJobByIdempotencyKey(scopedKey);
    if (existing) return existing;
    if (!['collecting', 'ready', 'reviewing', 'failed'].includes(task.status)) throw new ConflictException('Task cannot be solved in its current state');
    const snapshot = await this.schedules.buildSolverSnapshot(task);
    const snapshotHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const job = await this.schedules.createSolverJob(task, actorId, scopedKey, snapshot, snapshotHash, requestId);
    if (job.status === 'queued') await this.redis.lpush('scheduling:solver:jobs', JSON.stringify({ jobId: job.id, taskId, snapshotHash, snapshot }));
    return job;
  }
  async getJob(actorId: string, taskId: string, jobId: string) { await this.requireTask(actorId, taskId, 'manageTasks'); const job = await this.schedules.findJob(jobId); if (!job || job.taskId !== taskId) throw new NotFoundException('Solver job not found'); return job; }
  async candidates(actorId: string, taskId: string, jobId: string) { await this.getJob(actorId, taskId, jobId); return this.schedules.listCandidates(jobId); }

  async replaceFixedAssignments(actorId: string, taskId: string, assignments: Array<{ slotId: string; userId: string }>, requestId: string) {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    if (!['collecting', 'ready', 'reviewing', 'adjusting'].includes(task.status)) throw new ConflictException('Fixed assignments cannot be changed after publication');
    const slots = new Set((await this.schedules.listSlots(taskId)).map((slot) => slot.id));
    const members = new Set((await this.groups.listMembers(task.groupId)).filter((member) => member.status === 'active').map((member) => member.userId));
    if (!Array.isArray(assignments) || assignments.length > 500 || assignments.some((item) => !slots.has(item.slotId) || !members.has(item.userId))) throw new BadRequestException('Invalid fixed assignment');
    return this.schedules.replaceFixedAssignments(taskId, actorId, assignments, requestId);
  }
  async fixedAssignments(actorId: string, taskId: string) { await this.requireTask(actorId, taskId, 'view'); return this.schedules.listFixedAssignments(taskId); }

  async publish(actorId: string, taskId: string, assignments: Array<{ slotId: string; userId: string }>, requestId: string) {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    if (!['solving', 'reviewing', 'adjusting', 'published'].includes(task.status)) throw new ConflictException('Task cannot be published in its current state');
    const slots = await this.schedules.listSlots(taskId); const slotIds = new Set(slots.map((slot) => slot.id)); const activeMembers = new Map((await this.groups.listMembers(task.groupId)).filter((member) => member.status === 'active').map((member) => [member.userId, member]));
    if (!Array.isArray(assignments) || assignments.length === 0) throw new BadRequestException('Assignments are required');
    const assignmentKeys = new Set(assignments.map((item) => `${item.slotId}:${item.userId}`));
    if (assignmentKeys.size !== assignments.length) throw new BadRequestException('Duplicate member assignment in a slot');
    const available = new Set((await this.schedules.latestAvailabilityStates(taskId)).filter((item) => item.state === 'available' || item.state === 'preferred').map((item) => `${item.slotId}:${item.userId}`));
    for (const item of assignments) if (!available.has(`${item.slotId}:${item.userId}`)) throw new BadRequestException('Member availability does not allow this assignment');
    const counts = new Map<string, number>();
    for (const item of assignments) { if (!slotIds.has(item.slotId) || !activeMembers.has(item.userId)) throw new BadRequestException('Assignment references an invalid slot or member'); counts.set(item.slotId, (counts.get(item.slotId) ?? 0) + 1); }
    for (const slot of slots) { const count = counts.get(slot.id) ?? 0; if (count < slot.minPeople || count > slot.maxPeople) throw new BadRequestException('Assignment coverage violates slot limits'); }
    for (const fixed of await this.schedules.listFixedAssignments(taskId)) if (!assignmentKeys.has(`${fixed.slotId}:${fixed.userId}`)) throw new BadRequestException('Published schedule must include every fixed assignment');
    const slotById = new Map(slots.map((slot) => [slot.id, slot]));
    const byMember = new Map<string, typeof assignments>();
    assignments.forEach((item) => byMember.set(item.userId, [...(byMember.get(item.userId) || []), item]));
    for (const memberAssignments of byMember.values()) {
      const sorted = memberAssignments.map((item) => slotById.get(item.slotId)!).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      for (let index = 1; index < sorted.length; index += 1) if (sorted[index - 1]!.endsAt.getTime() > sorted[index]!.startsAt.getTime()) throw new BadRequestException('Member assignments overlap');
    }
    return this.schedules.publish(task, actorId, assignments, requestId);
  }
  async receipt(actorId: string, taskId: string, versionId: string) { await this.requireTask(actorId, taskId, 'view'); await this.schedules.receipt(actorId, versionId, 'received'); }
  async objection(actorId: string, taskId: string, versionId: string, slotId: string | null, reason: string, requestId = 'schedule-objection') { const task = await this.requireTask(actorId, taskId, 'view'); if (!reason.trim() || reason.length > 1000) throw new BadRequestException('Objection reason is required'); if (slotId && !(await this.schedules.listSlots(taskId)).some((slot) => slot.id === slotId)) throw new BadRequestException('Objection slot does not belong to the task'); return this.schedules.objection(task, actorId, versionId, slotId, reason.trim(), requestId); }
  async listObjections(actorId: string, taskId: string, versionId: string) { await this.requireTask(actorId, taskId, 'manageTasks'); const result = await this.schedules.listObjections(taskId, versionId); return result; }
  async resolveObjection(actorId: string, taskId: string, versionId: string, objectionId: string, status: string, note: string, requestId: string) {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    if (task.status !== 'published') throw new ConflictException('Only a published task can resolve objections');
    if (status !== 'accepted' && status !== 'rejected') throw new BadRequestException('Invalid objection resolution');
    const existing = await this.schedules.listObjections(taskId, versionId);
    const current = existing.find((item) => item.id === objectionId);
    if (!current) throw new NotFoundException('Objection not found');
    if (current.status !== 'open') throw new ConflictException('Objection is already resolved');
    const normalized = note.trim();
    if (!normalized || normalized.length > 1000) throw new BadRequestException('Resolution note is required');
    return this.schedules.resolveObjection(taskId, versionId, objectionId, actorId, status, normalized, requestId);
  }
  async createShare(actorId: string, taskId: string, versionId: string, expiresInHours: number) { await this.requireTask(actorId, taskId, 'manageTasks'); const hours = Math.min(Math.max(Number(expiresInHours) || 24, 1), 24 * 30); const token = randomBytes(32).toString('base64url'); const tokenHash = createHash('sha256').update(token).digest('hex'); const share = await this.schedules.createShare(taskId, versionId, tokenHash, new Date(Date.now() + hours * 60 * 60 * 1000), actorId); return { ...share, token }; }

  /** Mint a share token for collecting tasks (creates draft schedule_versions for FK). */
  async createCollectionShare(actorId: string, taskId: string, expiresInHours: number, _requestId = 'collection-share') {
    const task = await this.requireTask(actorId, taskId, 'manageTasks');
    if (task.status !== 'collecting') throw new ConflictException('Collection shares can only be minted while collecting');
    const hours = Math.min(Math.max(Number(expiresInHours) || 24, 1), 24 * 30);
    // Short invite code doubles as shareToken (campus UX: 邀请码 + 微信分享), not a long opaque path.
    const inviteCode = this.mintInviteCode();
    const tokenHash = createHash('sha256').update(inviteCode).digest('hex');
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const share = await this.schedules.createCollectionShare(taskId, tokenHash, expiresAt, actorId);
    return { ...share, token: inviteCode, inviteCode };
  }

  /** 8-char Crockford-like code, uppercase, no ambiguous 0/O/1/I. */
  private mintInviteCode(length = 8): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i += 1) out += alphabet[bytes[i]! % alphabet.length];
    return out;
  }
  async revokeShare(actorId: string, shareId: string) { try { await this.schedules.revokeShare(shareId, actorId); } catch { throw new NotFoundException('Share link not found'); } }
  async publicShare(token: string) { const tokenHash = createHash('sha256').update(token).digest('hex'); const result = await this.schedules.publicShare(tokenHash); if (!result) throw new NotFoundException('Share link is invalid or expired'); return result; }
  async published(actorId: string, taskId: string) { await this.requireTask(actorId, taskId, 'view'); const result = await this.schedules.publishedSchedule(taskId); if (!result) throw new NotFoundException('Published schedule not found'); return result; }
  async personalPublishedSchedule(actorId: string) { return this.schedules.personalPublishedSchedule(actorId); }

  private validatePeriod(period: PeriodInput) { if (!period.code?.trim() || !period.label?.trim() || !Number.isInteger(period.startMinute) || !Number.isInteger(period.endMinute) || period.startMinute < 0 || period.startMinute > 1439 || period.endMinute < 0 || period.endMinute > 1439 || (period.minPeople ?? 1) < 1 || (period.maxPeople ?? 1) < (period.minPeople ?? 1)) throw new BadRequestException('Invalid shift period'); }
  private validateSelectedSlots(selectedSlots: SelectedSlotInput[] | undefined, periods: PeriodInput[], dateStart: string, dateEnd: string): SelectedSlotInput[] | undefined {
    if (selectedSlots === undefined) return undefined;
    if (!Array.isArray(selectedSlots) || selectedSlots.length < 1) throw new BadRequestException('selectedSlots must contain at least one cell');
    const periodByCode = new Map(periods.map((period) => [period.code, period]));
    const dates = new Set(this.dateRange(dateStart, dateEnd));
    const seen = new Set<string>();
    const normalized: SelectedSlotInput[] = [];
    for (const slot of selectedSlots) {
      if (!slot || typeof slot.date !== 'string' || !dates.has(slot.date) || !periodByCode.has(slot.periodCode)) throw new BadRequestException('selectedSlots date or periodCode is invalid');
      const key = `${slot.date}|${slot.periodCode}`;
      if (seen.has(key)) throw new BadRequestException('selectedSlots contains duplicate date and periodCode pairs');
      seen.add(key);
      const maxPeople = slot.maxPeople ?? 1;
      if (!Number.isInteger(maxPeople) || maxPeople < 1 || maxPeople > 100) throw new BadRequestException('selectedSlots maxPeople must be between 1 and 100');
      const minPeople = periodByCode.get(slot.periodCode)?.minPeople ?? 1;
      if (maxPeople < minPeople) throw new BadRequestException('selectedSlots maxPeople must be >= period minPeople');
      normalized.push({ date: slot.date, periodCode: slot.periodCode, maxPeople });
    }
    return normalized;
  }
  private validateRules(rules: TaskRulesInput | undefined) {
    if (rules === undefined) return undefined;
    if (!rules || typeof rules !== 'object') throw new BadRequestException('Invalid rules');
    if (!Array.isArray(rules.requiredFields) || rules.requiredFields.some((field) => !REQUIRED_FIELD_OPTIONS.has(field))) throw new BadRequestException('Invalid requiredFields');
    if (!PARTICIPANT_SCOPES.has(rules.participantScope)) throw new BadRequestException('Invalid participantScope');
    const reservedNames = (rules.reservedNames ?? []).map((name) => String(name ?? '').trim()).filter(Boolean);
    if (rules.participantScope === 'reserved_list' && reservedNames.length < 1) throw new BadRequestException('reservedNames are required for reserved_list');
    if (typeof rules.allowEditAfterSubmit !== 'boolean') throw new BadRequestException('allowEditAfterSubmit must be boolean');
    if (!Number.isInteger(rules.maxEditCount) || rules.maxEditCount < 0) throw new BadRequestException('Invalid maxEditCount');
    if (rules.allowEditAfterSubmit && rules.maxEditCount < 1) throw new BadRequestException('maxEditCount must be at least 1 when edits are allowed');
    if (!(rules.remindBeforeMinutes === null || (Number.isInteger(rules.remindBeforeMinutes) && rules.remindBeforeMinutes >= 0))) throw new BadRequestException('Invalid remindBeforeMinutes');
    if (rules.saveAsTemplate) {
      const templateName = rules.templateName?.trim();
      if (!templateName || templateName.length > 120) throw new BadRequestException('templateName is required when saveAsTemplate is true');
      return {
        requiredFields: rules.requiredFields,
        participantScope: rules.participantScope,
        reservedNames,
        allowEditAfterSubmit: rules.allowEditAfterSubmit,
        maxEditCount: rules.maxEditCount,
        remindBeforeMinutes: rules.remindBeforeMinutes,
        saveAsTemplate: true,
        templateName,
      };
    }
    return {
      requiredFields: rules.requiredFields,
      participantScope: rules.participantScope,
      reservedNames,
      allowEditAfterSubmit: rules.allowEditAfterSubmit,
      maxEditCount: rules.maxEditCount,
      remindBeforeMinutes: rules.remindBeforeMinutes,
      ...(rules.saveAsTemplate === false ? { saveAsTemplate: false } : {}),
      ...(rules.templateName ? { templateName: rules.templateName.trim() } : {}),
    };
  }
  private inclusiveDaySpan(start: string, end: string): number {
    const a = new Date(`${start}T00:00:00Z`).getTime();
    const b = new Date(`${end}T00:00:00Z`).getTime();
    if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
    return Math.floor((b - a) / 86_400_000) + 1;
  }

  private dateRange(start: string, end: string): string[] {
    const result: string[] = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
      result.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      if (result.length > MAX_TASK_SPAN_DAYS) break;
    }
    return result;
  }
  private async requireTask(actorId: string, taskId: string, action: GroupAction): Promise<ScheduleTask> { const task = await this.schedules.findTask(taskId); if (!task) throw new NotFoundException('Task not found'); await this.requireGroup(actorId, task.groupId, action); return task; }
  private async requireTaskForAvailability(actorId: string, taskId: string, shareToken?: string): Promise<ScheduleTask> {
    const task = await this.schedules.findTask(taskId);
    if (!task) throw new NotFoundException('Task not found');

    const scope = task.rules?.participantScope ?? 'all_members';
    const member = await this.groups.findMember(task.groupId, actorId);
    const isActiveMember = Boolean(member && member.status === 'active' && canGroup(member.role, 'view'));
    if (isActiveMember) return task;

    if (scope === 'share_link') {
      const token = shareToken?.trim();
      if (token) {
        const tokenHash = createHash('sha256').update(token).digest('hex');
        if (await this.schedules.findValidShareForTask(taskId, tokenHash)) return task;
      }
    }

    // all_members, reserved_list (membership-only this round), or share_link without valid token
    throw new NotFoundException('Task not found');
  }
  private async requireGroup(actorId: string, groupId: string, action: GroupAction): Promise<MemberRecord> { const member = await this.groups.findMember(groupId, actorId); if (!member || member.status !== 'active') throw new NotFoundException('Group not found'); if (!canGroup(member.role, action)) throw new ForbiddenException('Insufficient group permission'); return member; }
}
