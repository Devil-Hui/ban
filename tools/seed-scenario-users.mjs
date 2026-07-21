import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../services/api/dist/app.module.js';
import { GroupService } from '../services/api/dist/groups/group.service.js';
import { UserRepository } from '../services/api/dist/users/user.repository.js';
import { parseEnvironment } from '../services/api/dist/config/env.schema.js';

const env = parseEnvironment(process.env);
if (env.NODE_ENV === 'production') throw new Error('Scenario seed is disabled in production');
if (env.WECHAT_MODE !== 'mock') throw new Error('Scenario seed requires WECHAT_MODE=mock');

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const users = app.get(UserRepository);
  const groups = app.get(GroupService);
  const ids = Object.fromEntries(
    await Promise.all(Array.from({ length: 13 }, async (_, index) => {
      const code = `U${String(index + 1).padStart(2, '0')}`;
      const user = await users.upsertWechat(`mock:${code}`, code, null);
      return [code, user.id];
    })),
  );

  const requestId = 'scenario-seed';
  const ensureGroup = async (ownerCode, name) => {
    const owned = await groups.listMine(ids[ownerCode]);
    return owned.find((group) => group.name === name) ?? groups.create(ids[ownerCode], name, requestId);
  };
  const g01 = await ensureGroup('U03', 'G01-scenario');
  const g02 = await ensureGroup('U06', 'G02-scenario');
  const g03 = await ensureGroup('U12', 'G03-scenario');

  const join = async (userCode, group) => {
    try {
      await groups.join(ids[userCode], group.inviteCode, userCode, requestId);
    } catch (error) {
      if (!(error instanceof Error) || !/active|blacklist/i.test(error.message)) throw error;
    }
  };
  for (const code of ['U04', 'U05', 'U08', 'U11', 'U12']) await join(code, g01);
  for (const code of ['U03', 'U07', 'U09', 'U12']) await join(code, g02);
  await join('U13', g03);

  const g01Members = await groups.members(ids.U03, g01.id);
  const u05 = g01Members.find((member) => member.userId === ids.U05);
  if (u05?.status === 'active') await groups.kick(ids.U03, g01.id, ids.U05, 'scenario reset', false, requestId);
  const u11 = g01Members.find((member) => member.userId === ids.U11);
  if (u11?.status === 'active' || (u11 && !u11.blacklisted)) await groups.kick(ids.U03, g01.id, ids.U11, 'scenario blacklist', true, requestId);
  const g02Members = await groups.members(ids.U06, g02.id);
  const u09 = g02Members.find((member) => member.userId === ids.U09);
  if (u09?.status === 'active') await groups.leave(ids.U09, g02.id, requestId);

  console.log(JSON.stringify({ users: 13, groups: 3, memberships: 'seeded' }));
} finally {
  await app.close();
}
