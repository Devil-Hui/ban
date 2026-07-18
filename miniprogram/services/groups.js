// services/groups.js — 分组接口（统一解包，避免页面各自猜 data 形状）
const { get, post, del } = require('../utils/request');

function unwrapList(data, keys) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of keys) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

const create = async (data) => {
  const res = await post('/groups', data);
  return (res && res.group) || res;
};
const listMine = async () => {
  const res = await get('/groups');
  return unwrapList(res, ['groups', 'list']);
};
const getOne = async (groupId) => {
  const res = await get(`/groups/${groupId}`);
  const g = (res && res.group) || res;
  // 统一 myRole，兼容后端 roleInGroup
  if (g && !g.myRole && g.roleInGroup) g.myRole = g.roleInGroup;
  return g;
};
const join = async (data) => {
  const res = await post('/groups/join', data);
  return (res && res.group) || res;
};
const listMembers = async (groupId) => {
  const res = await get(`/groups/${groupId}/members`);
  const list = unwrapList(res, ['members', 'list']);
  // 归一展示字段，供 wxml 使用 name/role
  return list.map((m) =>
    Object.assign({}, m, {
      name: m.name || m.nickname || m.displayName || '成员',
      role: m.role || m.roleInGroup,
      avatar: m.avatar || m.avatarUrl || '',
      phoneMasked: m.phoneMasked || m.phone || '',
    })
  );
};
const kick = (groupId, userId) => del(`/groups/${groupId}/members/${userId}`);
const leave = (groupId) => post(`/groups/${groupId}/members/leave`);

module.exports = { create, listMine, getOne, join, listMembers, kick, leave };
