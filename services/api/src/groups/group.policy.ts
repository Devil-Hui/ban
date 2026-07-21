export type GroupRole = 'owner' | 'admin' | 'member';
export type GroupAction = 'view' | 'manageTasks' | 'manageMembers' | 'manageAdmins' | 'dissolve';

const capabilities: Record<GroupRole, ReadonlySet<GroupAction>> = {
  owner: new Set(['view', 'manageTasks', 'manageMembers', 'manageAdmins', 'dissolve']),
  admin: new Set(['view', 'manageTasks', 'manageMembers']),
  member: new Set(['view']),
};

export function canGroup(role: GroupRole, action: GroupAction): boolean {
  return capabilities[role].has(action);
}
