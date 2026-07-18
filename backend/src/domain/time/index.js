'use strict';

/**
 * 时段领域：mode 元数据 + resolvePeriods
 * 页面/Handler 禁止散落 if(mode==='section') 业务规则，统一走本模块。
 */

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
  },
  range: {
    label: '按时间段',
    showSectionName: false,
    showTimeRange: true,
    editor: 'range_list',
  },
  section_range: {
    label: '节次+时间段',
    showSectionName: true,
    showTimeRange: true,
    editor: 'section_with_time',
  },
};

/** legacy 三班 → range 三段（仅兼容旧数据，集中一处） */
const LEGACY_SLOT_MAP = {
  morning: { id: 'morning', name: '时段A', start: '08:00', end: '12:00', kind: 'range' },
  afternoon: { id: 'afternoon', name: '时段B', start: '14:00', end: '18:00', kind: 'range' },
  night: { id: 'night', name: '时段C', start: '18:00', end: '22:00', kind: 'range' },
};

function normalizeSlot(raw, index) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    if (LEGACY_SLOT_MAP[raw]) return Object.assign({}, LEGACY_SLOT_MAP[raw]);
    return { id: raw, name: raw, start: '', end: '', kind: 'range' };
  }
  const id = raw.id || raw.slot || raw.periodId || `p${(index || 0) + 1}`;
  if (LEGACY_SLOT_MAP[id] && !raw.start && !raw.name) {
    return Object.assign({}, LEGACY_SLOT_MAP[id]);
  }
  const name = raw.name || raw.label || id;
  const start = raw.start || raw.begin || '';
  const end = raw.end || '';
  let kind = raw.kind;
  if (!kind) {
    if (raw.sectionIndex != null && start && end) kind = 'hybrid';
    else if (raw.sectionIndex != null) kind = 'section';
    else kind = 'range';
  }
  const slot = { id: String(id), name: String(name), start, end, kind };
  if (raw.sectionIndex != null) slot.sectionIndex = Number(raw.sectionIndex);
  return slot;
}

function normalizeSlots(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeSlot).filter(Boolean);
}

function assertTimeOrder(slot) {
  if (!slot.start || !slot.end) return true;
  return slot.start < slot.end;
}

/**
 * @param {object} opts
 * @param {string} opts.mode - section | range | section_range
 * @param {array}  opts.profileSlots - 作息表 slots
 * @param {string[]} [opts.selectedIds] - 勾选的 period id
 * @param {array} [opts.customRanges] - 自定义时间段
 * @param {object} [opts.timeOverrides] - { [id]: { start, end, name? } }
 * @returns {array} TimeSlot[]
 */
function resolvePeriods(opts) {
  const mode = (opts && opts.mode) || DEFAULT_TASK_TIME_MODE;
  if (!TIME_MODE_META[mode]) {
    const e = new Error('INVALID_TIME_MODE');
    e.code = 'INVALID_TIME_MODE';
    throw e;
  }
  const profileSlots = normalizeSlots((opts && opts.profileSlots) || []);
  const selectedIds = opts && Array.isArray(opts.selectedIds) ? opts.selectedIds.map(String) : null;
  const customRanges = normalizeSlots((opts && opts.customRanges) || []);
  const overrides = (opts && opts.timeOverrides) || {};

  let result = [];

  if (mode === TIME_MODES.RANGE) {
    if (customRanges.length) {
      result = customRanges;
    } else {
      // 无自定义时用 profile 中 range/hybrid 槽，或全部
      const ranges = profileSlots.filter((s) => s.kind === 'range' || !s.sectionIndex);
      result = ranges.length ? ranges : profileSlots;
    }
  } else {
    // section | section_range
    let base = profileSlots.length ? profileSlots : customRanges;
    if (selectedIds && selectedIds.length) {
      const set = new Set(selectedIds);
      base = base.filter((s) => set.has(s.id));
      // 保持 selectedIds 顺序
      base = selectedIds
        .map((id) => base.find((s) => s.id === id) || profileSlots.find((s) => s.id === id))
        .filter(Boolean)
        .map(normalizeSlot);
    }
    result = base.map((s, i) => {
      const o = overrides[s.id];
      if (!o) return normalizeSlot(s, i);
      return normalizeSlot(
        Object.assign({}, s, {
          start: o.start != null ? o.start : s.start,
          end: o.end != null ? o.end : s.end,
          name: o.name != null ? o.name : s.name,
        }),
        i
      );
    });
  }

  result = result.map(normalizeSlot).filter(Boolean);
  for (const s of result) {
    if (!assertTimeOrder(s)) {
      const e = new Error('INVALID_PERIOD_TIME: ' + s.id);
      e.code = 'INVALID_PERIOD_TIME';
      throw e;
    }
  }
  if (!result.length) {
    const e = new Error('PERIODS_EMPTY');
    e.code = 'PERIODS_EMPTY';
    throw e;
  }
  return result;
}

function displayLabel(slot, mode) {
  const meta = TIME_MODE_META[mode] || TIME_MODE_META[DEFAULT_TASK_TIME_MODE];
  if (!slot) return '';
  if (meta.showSectionName && meta.showTimeRange && slot.start && slot.end) {
    return `${slot.name} ${slot.start}-${slot.end}`;
  }
  if (meta.showTimeRange && slot.start && slot.end) {
    return `${slot.start}-${slot.end}`;
  }
  return slot.name || slot.id;
}

function getTimeConstants() {
  return {
    TIME_MODES,
    DEFAULT_TASK_TIME_MODE,
    TIME_MODE_META,
  };
}

module.exports = {
  TIME_MODES,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
  LEGACY_SLOT_MAP,
  normalizeSlot,
  normalizeSlots,
  resolvePeriods,
  displayLabel,
  getTimeConstants,
};
