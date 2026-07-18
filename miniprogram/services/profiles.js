// services/profiles.js — 系统/分组作息模板
const { get, put, post } = require('../utils/request');
const { DEFAULT_PROFILE_ID } = require('../constants/time');

let _cache = null;

function loadLocalSeed() {
  try {
    // 小程序可 require 同包 JSON
    const seed = require('../constants/schedule-profiles.seed.json');
    return (seed && seed.profiles) || [];
  } catch (_) {
    return [];
  }
}

/** 系统模板列表：优先 API，失败用本地众数种子 */
const listSystem = async () => {
  try {
    const res = await get('/schedule-profiles', null, { silent: true });
    const list = (res && res.list) || [];
    if (list.length) {
      _cache = list;
      return {
        list,
        settings: (res && res.settings) || { defaultProfileId: DEFAULT_PROFILE_ID, defaultTimeMode: 'section_range' },
      };
    }
  } catch (_) {}
  const list = loadLocalSeed().filter((p) => p.status !== 'archived');
  _cache = list;
  return {
    list,
    settings: { defaultProfileId: DEFAULT_PROFILE_ID, defaultTimeMode: 'section_range' },
  };
};

const getCached = () => _cache || loadLocalSeed();

const getById = (id) => {
  const list = getCached();
  return list.find((p) => p.id === id) || list.find((p) => p.isDefault) || list[0] || null;
};

const getGroupProfile = async (groupId) => {
  try {
    const res = await get(`/groups/${groupId}/schedule-profile`, null, { silent: true });
    return res || { profile: null, inherited: true };
  } catch (_) {
    return { profile: getById(DEFAULT_PROFILE_ID), inherited: true };
  }
};

const importGroupProfile = (groupId, profileId) =>
  post(`/groups/${groupId}/schedule-profile/import`, { profileId });

const putGroupProfile = (groupId, data) => put(`/groups/${groupId}/schedule-profile`, data);

module.exports = {
  listSystem,
  getById,
  getCached,
  getGroupProfile,
  importGroupProfile,
  putGroupProfile,
  loadLocalSeed,
};
