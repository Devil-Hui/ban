// utils/config.js — 运行配置
// dataMode:
//   - 'local'  纯本地（不启后端、不连 Docker/MySQL），数据在 wx.storage
//   - 'api'    请求 baseUrl（本机 node 即可，DB_MODE=memory 无需 Docker）
const env = 'dev';
const dataMode = 'api'; // local | api

const PRESETS = {
  dev: { baseUrl: 'http://127.0.0.1:3000/api/v1', wsBase: '' },
  staging: { baseUrl: 'https://staging-api.example.com/api/v1', wsBase: 'wss://staging-api.example.com' },
  prod: { baseUrl: 'https://api.example.com/api/v1', wsBase: 'wss://api.example.com' },
};
const preset = PRESETS[env] || PRESETS.dev;
const timeConst = require('../constants/time');
const timeDomain = require('../domain/time');

module.exports = {
  env,
  dataMode,
  useLocalMock: dataMode === 'local',
  appName: '排班小助手',
  baseUrl: preset.baseUrl,
  wsBase: preset.wsBase,
  requestTimeoutMs: 10000,
  jobPollIntervalMs: 1000,
  jobPollMaxTimes: 30,
  /**
   * 订阅消息模板 ID（与公众平台「我的模板」一致，并与 backend WX_TMPL_* 对齐）
   * - 排班加入通知 → 发布/入组相关
   * - 未提交日志   → 填报截止/未提交提醒
   */
  subscribeTemplateIds: {
    // 排班加入通知
    taskPublished: 'mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg',
    groupJoined: 'mrVvyweEKlTCsCP75XhrgyDu3OlWFwk9mtHOjIMRBqg',
    // 未提交日志
    deadlineRemind: 'JQYOa6W-Fq1qZBSvJVD3vVRxfm2iQ2IaYQs-ex5DYic',
  },
  // 兼容旧数组读取（去重）
  getSubscribeTmplList() {
    const m = this.subscribeTemplateIds || {};
    return [...new Set([m.taskPublished, m.groupJoined, m.deadlineRemind].filter(Boolean))];
  },
  share: { title: '你有一份新的排班待确认，快来查看～', imageUrl: '' },
  TIME_MODES: timeConst.TIME_MODES,
  DEFAULT_TASK_TIME_MODE: timeConst.DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META: timeConst.TIME_MODE_META,
  TIME_MODE_OPTIONS: timeConst.TIME_MODE_OPTIONS,
  DEFAULT_PROFILE_ID: timeConst.DEFAULT_PROFILE_ID,
  normalizePeriod: timeDomain.normalizePeriod,
  normalizePeriods: timeDomain.normalizePeriods,
  resolvePeriods: timeDomain.resolvePeriods,
  displayLabel: timeDomain.displayLabel,
  periodsToLabels: timeDomain.periodsToLabels,
  periodsToIds: timeDomain.periodsToIds,
};
