import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { AuditService } from '../audit/audit.service.js';
import { DATABASE } from '../database/database.tokens.js';
import { newId, parseId, stringifyId } from '../ids/uuid.js';

export type GroupSummary = {
  id: string;
  name: string;
  ownerId: string;
  status: string;
  inviteCode: string;
  description?: string | null;
  role?: 'owner' | 'admin' | 'member';
};

export type MemberRecord = {
  id: string;
  groupId: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  status: string;
  blacklisted: boolean;
};

export type InviteRecord = {
  id: string;
  groupId: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  groupStatus: string;
};

type MemberRow = {
  id: Buffer;
  group_id: Buffer;
  user_id: Buffer;
  display_name: string;
  role_in_group: 'owner' | 'admin' | 'member';
  status: string;
  is_blacklisted: number;
};

function memberFromRow(row: MemberRow): MemberRecord {
  return {
    id: stringifyId(row.id),
    groupId: stringifyId(row.group_id),
    userId: stringifyId(row.user_id),
    displayName: row.display_name,
    role: row.role_in_group,
    status: row.status,
    blacklisted: Boolean(row.is_blacklisted),
  };
}

@Injectable()
export class GroupRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Kysely<unknown>,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async createGroup(
    ownerId: string,
    name: string,
    code: string,
    requestId: string,
    options: { description?: string | null; ownerDisplayName?: string } = {},
  ): Promise<GroupSummary> {
    const groupId = newId();
    const memberId = newId();
    const inviteId = newId();
    // Default description: prefer caller value, else DB catalog, else empty (never invent business data in multiple places).
    let description = (options.description ?? '').trim().slice(0, 255);
    if (!description) {
      const fallback = await sql<{ label: string }>`
        select label from app_option_catalogs
        where category = 'group_default' and code = 'description' and is_active = true
        limit 1
      `.execute(this.db);
      description = fallback.rows[0]?.label?.trim().slice(0, 255) || '';
    }
    const ownerDisplayName = (options.ownerDisplayName ?? name).trim().slice(0, 80) || name;
    await this.db.transaction().execute(async (trx) => {
      await sql`insert into \`groups\` (id, name, owner_id, description) values (${parseId(groupId)}, ${name}, ${parseId(ownerId)}, ${description})`.execute(trx);
      await sql`insert into group_members (id, group_id, user_id, display_name, role_in_group) values (${parseId(memberId)}, ${parseId(groupId)}, ${parseId(ownerId)}, ${ownerDisplayName}, 'owner')`.execute(trx);
      await sql`insert into group_invite_codes (id, group_id, code, created_by) values (${parseId(inviteId)}, ${parseId(groupId)}, ${code}, ${parseId(ownerId)})`.execute(trx);
      await sql`insert into group_member_events (id, group_id, member_id, actor_user_id, event_type) values (${parseId(newId())}, ${parseId(groupId)}, ${parseId(memberId)}, ${parseId(ownerId)}, 'created')`.execute(trx);
      await this.audit.record({ actorId: ownerId, action: 'group.create', targetType: 'group', targetId: groupId, requestId }, trx);
    });
    return { id: groupId, name, ownerId, status: 'active', inviteCode: code, description };
  }

  async findGroup(id: string): Promise<GroupSummary | null> {
    const result = await sql<{ id: Buffer; name: string; owner_id: Buffer; status: string; invite_code: string; description: string | null }>`
      select g.id, g.name, g.owner_id, g.status, g.description, coalesce(i.code, '') as invite_code
      from \`groups\` g
      left join group_invite_codes i on i.group_id = g.id and i.revoked_at is null
      where g.id = ${parseId(id)} and g.deleted_at is null
      order by i.created_at desc limit 1
    `.execute(this.db);
    const row = result.rows[0];
    return row
      ? {
          id: stringifyId(row.id),
          name: row.name,
          ownerId: stringifyId(row.owner_id),
          status: row.status,
          inviteCode: row.invite_code,
          description: row.description,
        }
      : null;
  }

  async listMine(userId: string): Promise<GroupSummary[]> {
    const result = await sql<{
      id: Buffer;
      name: string;
      owner_id: Buffer;
      status: string;
      invite_code: string;
      role_in_group: 'owner' | 'admin' | 'member';
      description: string | null;
    }>`
      select g.id, g.name, g.owner_id, g.status, g.description, coalesce(i.code, '') as invite_code, m.role_in_group
      from \`groups\` g
      join group_members m on m.group_id = g.id and m.user_id = ${parseId(userId)} and m.status = 'active'
      left join group_invite_codes i on i.group_id = g.id and i.revoked_at is null
      where g.deleted_at is null
      order by g.updated_at desc
    `.execute(this.db);
    return result.rows.map((row) => ({
      id: stringifyId(row.id),
      name: row.name,
      ownerId: stringifyId(row.owner_id),
      status: row.status,
      inviteCode: row.invite_code,
      role: row.role_in_group,
      description: row.description,
    }));
  }

  async findMember(groupId: string, userId: string, executor: Kysely<unknown> = this.db, lock = false): Promise<MemberRecord | null> {
    const lockClause = lock ? sql`for update` : sql``;
    const result = await sql<MemberRow>`
      select id, group_id, user_id, display_name, role_in_group, status, is_blacklisted
      from group_members
      where group_id = ${parseId(groupId)} and user_id = ${parseId(userId)}
      limit 1 ${lockClause}
    `.execute(executor);
    return result.rows[0] ? memberFromRow(result.rows[0]) : null;
  }

  async listMembers(groupId: string): Promise<MemberRecord[]> {
    const result = await sql<MemberRow>`
      select id, group_id, user_id, display_name, role_in_group, status, is_blacklisted
      from group_members where group_id = ${parseId(groupId)} order by created_at asc
    `.execute(this.db);
    return result.rows.map(memberFromRow);
  }

  async findInvite(code: string): Promise<InviteRecord | null> {
    const result = await sql<{ id: Buffer; group_id: Buffer; expires_at: Date | null; revoked_at: Date | null; group_status: string }>`
      select i.id, i.group_id, i.expires_at, i.revoked_at, g.status as group_status
      from group_invite_codes i
      join \`groups\` g on g.id = i.group_id and g.deleted_at is null
      where i.code = ${code} limit 1
    `.execute(this.db);
    const row = result.rows[0];
    return row
      ? {
          id: stringifyId(row.id),
          groupId: stringifyId(row.group_id),
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at,
          groupStatus: row.group_status,
        }
      : null;
  }

  async join(groupId: string, userId: string, displayName: string, requestId: string): Promise<MemberRecord> {
    return this.db.transaction().execute(async (trx) => {
      const member = await this.findMember(groupId, userId, trx, true);
      if (member?.blacklisted) throw new Error('blacklisted member cannot rejoin');
      if (member?.status === 'active') return member;

      if (member) {
        await sql`
          update group_members
          set status = 'active', is_blacklisted = false, display_name = ${displayName},
              kicked_at = null, left_at = null, kicked_reason = null, version = version + 1
          where id = ${parseId(member.id)}
        `.execute(trx);
        await this.recordMemberEvent(trx, groupId, member.id, userId, 'rejoined', null);
        await this.audit.record({ actorId: userId, action: 'group.member.rejoin', targetType: 'member', targetId: member.id, requestId }, trx);
        return { ...member, displayName, status: 'active', blacklisted: false };
      }

      const id = newId();
      await sql`insert into group_members (id, group_id, user_id, display_name, role_in_group) values (${parseId(id)}, ${parseId(groupId)}, ${parseId(userId)}, ${displayName}, 'member')`.execute(trx);
      await this.recordMemberEvent(trx, groupId, id, userId, 'joined', null);
      await this.audit.record({ actorId: userId, action: 'group.member.join', targetType: 'member', targetId: id, requestId }, trx);
      return { id, groupId, userId, displayName, role: 'member', status: 'active', blacklisted: false };
    });
  }

  async transitionMember(
    actorId: string,
    groupId: string,
    targetUserId: string,
    transition: 'leave' | 'kick' | 'unblock',
    reason: string | null,
    blacklist: boolean,
    requestId: string,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const target = await this.findMember(groupId, targetUserId, trx, true);
      if (!target) throw new Error('member not found');

      const status = transition === 'leave' ? 'left' : 'kicked';
      const blacklisted = transition === 'kick' ? blacklist : false;
      await sql`
        update group_members
        set status = ${status}, is_blacklisted = ${blacklisted},
            left_at = ${transition === 'leave' ? new Date() : null},
            kicked_at = ${transition === 'kick' ? new Date() : null},
            kicked_reason = ${transition === 'kick' ? reason : null}, version = version + 1
        where id = ${parseId(target.id)}
      `.execute(trx);
      await this.recordMemberEvent(trx, groupId, target.id, actorId, transition, reason);
      await this.audit.record({ actorId, action: `group.member.${transition}`, targetType: 'member', targetId: target.id, requestId, metadata: { blacklist: blacklisted } }, trx);
    });
  }

  async setRole(actorId: string, groupId: string, targetUserId: string, role: 'admin' | 'member', requestId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const target = await this.findMember(groupId, targetUserId, trx, true);
      if (!target) throw new Error('member not found');
      await sql`update group_members set role_in_group = ${role}, version = version + 1 where id = ${parseId(target.id)}`.execute(trx);
      const eventType = role === 'admin' ? 'admin_set' : 'admin_removed';
      await this.recordMemberEvent(trx, groupId, target.id, actorId, eventType, null);
      await this.audit.record({ actorId, action: `group.member.${eventType}`, targetType: 'member', targetId: target.id, requestId }, trx);
    });
  }

  async transferOwnership(actorId: string, groupId: string, targetUserId: string, requestId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const current = await this.findMember(groupId, actorId, trx, true);
      const target = await this.findMember(groupId, targetUserId, trx, true);
      if (!current || !target) throw new Error('member not found');
      await sql`update group_members set role_in_group = 'member', version = version + 1 where id = ${parseId(current.id)}`.execute(trx);
      await sql`update group_members set role_in_group = 'owner', version = version + 1 where id = ${parseId(target.id)}`.execute(trx);
      await sql`update \`groups\` set owner_id = ${parseId(targetUserId)}, version = version + 1 where id = ${parseId(groupId)}`.execute(trx);
      await this.recordMemberEvent(trx, groupId, target.id, actorId, 'ownership_transferred', null);
      await this.audit.record({ actorId, action: 'group.ownership.transfer', targetType: 'group', targetId: groupId, requestId, metadata: { newOwnerId: targetUserId } }, trx);
    });
  }

  async dissolve(actorId: string, groupId: string, requestId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`update \`groups\` set status = 'dissolved', deleted_at = current_timestamp(3), version = version + 1 where id = ${parseId(groupId)}`.execute(trx);
      await sql`update group_invite_codes set revoked_at = current_timestamp(3) where group_id = ${parseId(groupId)} and revoked_at is null`.execute(trx);
      await sql`update group_members set status = 'left', left_at = current_timestamp(3), version = version + 1 where group_id = ${parseId(groupId)} and status = 'active'`.execute(trx);
      await this.audit.record({ actorId, action: 'group.dissolve', targetType: 'group', targetId: groupId, requestId }, trx);
    });
  }

  private async recordMemberEvent(
    executor: Kysely<unknown>,
    groupId: string,
    memberId: string,
    actorId: string,
    eventType: string,
    reason: string | null,
  ): Promise<void> {
    await sql`
      insert into group_member_events (id, group_id, member_id, actor_user_id, event_type, reason)
      values (${parseId(newId())}, ${parseId(groupId)}, ${parseId(memberId)}, ${parseId(actorId)}, ${eventType}, ${reason})
    `.execute(executor);
  }
}
