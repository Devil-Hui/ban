// constants/time-modes.js — campus task-create display modes
// Keep in sync with product timeMode values: range | section | section_range

const TIME_MODES = {
  RANGE: 'range',
  SECTION: 'section',
  SECTION_RANGE: 'section_range',
};

const DEFAULT_TASK_TIME_MODE = TIME_MODES.SECTION_RANGE;

const TIME_MODE_META = {
  range: {
    label: '按时间段',
    showSectionName: false,
    showTimeRange: true,
    desc: '只展示起止时间；适合值班/轮岗',
  },
  section: {
    label: '按节次',
    showSectionName: true,
    showTimeRange: false,
    desc: '只展示第N节；适合课表勾选',
  },
  section_range: {
    label: '节次+时间段',
    showSectionName: true,
    showTimeRange: true,
    desc: '同时展示节次名与时间；校内最常用',
  },
};

module.exports = {
  TIME_MODES,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
};
