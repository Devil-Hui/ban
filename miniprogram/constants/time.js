// constants/time.js — 与 shared/time-constants.json / backend domain 对齐
// 禁止在页面散落 mode 魔法字符串

const TIME_MODES = {
  SECTION: 'section',
  RANGE: 'range',
  SECTION_RANGE: 'section_range',
};

const DEFAULT_TASK_TIME_MODE = TIME_MODES.SECTION_RANGE;

const TIME_MODE_META = {
  section: {
    label: '按节次',
    showSectionName: true,
    showTimeRange: false,
    editor: 'section_checkbox',
    desc: '只展示第N节；适合课表勾选',
  },
  range: {
    label: '按时间段',
    showSectionName: false,
    showTimeRange: true,
    editor: 'range_list',
    desc: '只展示起止时间；适合值班/轮岗',
  },
  section_range: {
    label: '节次+时间段',
    showSectionName: true,
    showTimeRange: true,
    editor: 'section_with_time',
    desc: '同时展示节次名与时间；校内最常用',
  },
};

const TIME_MODE_OPTIONS = [
  { id: TIME_MODES.SECTION_RANGE, name: TIME_MODE_META.section_range.label, desc: TIME_MODE_META.section_range.desc },
  { id: TIME_MODES.SECTION, name: TIME_MODE_META.section.label, desc: TIME_MODE_META.section.desc },
  { id: TIME_MODES.RANGE, name: TIME_MODE_META.range.label, desc: TIME_MODE_META.range.desc },
];

/** 默认系统模板 id（与种子一致；具体钟点来自种子/API） */
const DEFAULT_PROFILE_ID = 'sys_uni_45min_v1';

module.exports = {
  TIME_MODES,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
  TIME_MODE_OPTIONS,
  DEFAULT_PROFILE_ID,
};
