import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { canGroup, type GroupAction } from './group.policy.js';
import { GroupRepository, type GroupSummary, type MemberRecord } from './group.repository.js';

const INVITE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function inviteCode(): string {
  return Array.from({ length: 6 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');
}

function duplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_DUP_ENTRY';
}

@Injectable()
export class GroupService {
  constructor(@Inject(GroupRepository) private readonly repository: GroupRepository) {}

  async create(
    ownerId: string,
    name: string,
    requestId: string,
    options: { description?: string; ownerDisplayName?: string } = {},
  ): Promise<GroupSummary> {
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 120) throw new BadRequestException('Group name must contain 1 to 120 characters');

    const mine = await this.repository.listMine(ownerId);
    const finalName = this.uniqueGroupName(
      normalizedName,
      mine.map((group) => group.name),
    );
    const description = options.description?.trim() || undefined;
    const ownerDisplayName = options.ownerDisplayName?.trim() || undefined;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const createOptions: { description?: string; ownerDisplayName?: string } = {};
        if (description) createOptions.description = description;
        if (ownerDisplayName) createOptions.ownerDisplayName = ownerDisplayName;
        return await this.repository.createGroup(ownerId, finalName, inviteCode(), requestId, createOptions);
      } catch (error) {
        if (!duplicateKey(error)) throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique invite code');
  }

  private uniqueGroupName(rawName: string, existingNames: string[]): string {
    const base = String(rawName || '').trim();
    if (!base) return '';
    const set = new Set((existingNames || []).map((n) => String(n)));
    if (!set.has(base)) return base;
    let k = 2;
    while (set.has(`${base}(${k})`)) k += 1;
    return `${base}(${k})`;
  }

  listMine(userId: string): Promise<GroupSummary[]> {
    return this.repository.listMine(userId);
  }

  async get(userId: string, groupId: string): Promise<{ group: GroupSummary; membership: MemberRecord }> {
    const membership = await this.requireActiveMember(userId, groupId, 'view');
    const group = await this.repository.findGroup(groupId);
    if (!group) throw new NotFoundException('Group not found');
    return { group, membership };
  }

  async members(userId: string, groupId: string): Promise<MemberRecord[]> {
    await this.requireActiveMember(userId, groupId, 'view');
    return this.repository.listMembers(groupId);
  }

  async join(userId: string, code: string, displayName: string, requestId: string): Promise<MemberRecord> {
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = displayName.trim();
    if (!normalizedCode || !normalizedName || normalizedName.length > 80) throw new BadRequestException('Invite code and display name are required');

    const invite = await this.repository.findInvite(normalizedCode);
    if (!invite || invite.revokedAt || (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) || invite.groupStatus !== 'active') {
      throw new NotFoundException('Invite code is invalid or expired');
    }
    try {
      return await this.repository.join(invite.groupId, userId, normalizedName, requestId);
    } catch (error) {
      if (error instanceof Error && /blacklist/i.test(error.message)) throw new ForbiddenException('This account is on the group blacklist');
      throw error;
    }
  }

  async leave(userId: string, groupId: string, requestId: string): Promise<void> {
    const actor = await this.requireActiveMember(userId, groupId, 'view');
    if (actor.role === 'owner') throw new ConflictException('Transfer ownership before leaving');
    await this.repository.transitionMember(userId, groupId, userId, 'leave', null, false, requestId);
  }

  async kick(actorId: string, groupId: string, targetUserId: string, reason: string, blacklist: boolean, requestId: string): Promise<void> {
    const actor = await this.requireActiveMember(actorId, groupId, 'manageMembers');
    const target = await this.requireTarget(groupId, targetUserId);
    if (target.role === 'owner') throw new ForbiddenException('The group owner cannot be removed');
    if (target.role === 'admin' && actor.role !== 'owner') throw new ForbiddenException('Only the owner can remove an administrator');
    if (target.userId === actorId) throw new BadRequestException('Use the leave operation to remove yourself');
    await this.repository.transitionMember(actorId, groupId, targetUserId, 'kick', reason.trim() || null, blacklist, requestId);
  }

  async unblock(actorId: string, groupId: string, targetUserId: string, requestId: string): Promise<void> {
    await this.requireActiveMember(actorId, groupId, 'manageAdmins');
    const target = await this.requireTarget(groupId, targetUserId);
    if (!target.blacklisted) throw new ConflictException('Member is not blacklisted');
    await this.repository.transitionMember(actorId, groupId, targetUserId, 'unblock', null, false, requestId);
  }

  async setAdmin(actorId: string, groupId: string, targetUserId: string, requestId: string): Promise<void> {
    await this.changeAdminRole(actorId, groupId, targetUserId, 'admin', requestId);
  }

  async removeAdmin(actorId: string, groupId: string, targetUserId: string, requestId: string): Promise<void> {
    await this.changeAdminRole(actorId, groupId, targetUserId, 'member', requestId);
  }

  async transferOwnership(actorId: string, groupId: string, targetUserId: string, requestId: string): Promise<void> {
    await this.requireActiveMember(actorId, groupId, 'manageAdmins');
    const target = await this.requireTarget(groupId, targetUserId);
    if (target.status !== 'active' || target.blacklisted) throw new ConflictException('Ownership can only be transferred to an active member');
    if (target.userId === actorId) throw new BadRequestException('Target already owns the group');
    await this.repository.transferOwnership(actorId, groupId, targetUserId, requestId);
  }

  async dissolve(actorId: string, groupId: string, requestId: string): Promise<void> {
    await this.requireActiveMember(actorId, groupId, 'dissolve');
    await this.repository.dissolve(actorId, groupId, requestId);
  }

  private async changeAdminRole(actorId: string, groupId: string, targetUserId: string, role: 'admin' | 'member', requestId: string): Promise<void> {
    await this.requireActiveMember(actorId, groupId, 'manageAdmins');
    const target = await this.requireTarget(groupId, targetUserId);
    if (target.role === 'owner') throw new ForbiddenException('The owner role cannot be changed');
    if (target.status !== 'active') throw new ConflictException('Only active members can be administrators');
    await this.repository.setRole(actorId, groupId, targetUserId, role, requestId);
  }

  private async requireActiveMember(userId: string, groupId: string, action: GroupAction): Promise<MemberRecord> {
    const member = await this.repository.findMember(groupId, userId);
    if (!member || member.status !== 'active') throw new NotFoundException('Group not found');
    if (!canGroup(member.role, action)) throw new ForbiddenException('Insufficient group permission');
    return member;
  }

  private async requireTarget(groupId: string, userId: string): Promise<MemberRecord> {
    const member = await this.repository.findMember(groupId, userId);
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }
}
