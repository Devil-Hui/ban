// domain/time.js — 小程序端时段归一与展示（与 backend/src/domain/time 同构精简版）
const { TIME_MODES, DEFAULT_TASK_TIME_MODE, TIME_MODE_META } = require('../constants/time');

const LEGACY_SLOT_MAP = {
  morning: { id: 'morning', name: '时段A', start: '08:00', end: '12:00', kind: 'range' },
  afternoon: { id: 'afternoon', name: '时段B', start: '14:00', end: '18:00', kind: 'range' },
  night: { id: 'night', name: '时段C', start: '18:00', end: '22:00', kind: 'range' },
};

function normalizePeriod(p, index) {
  if (!p) return null;
  if (typeof p === 'string') {
    if (LEGACY_SLOT_MAP[p]) return Object.assign({}, LEGACY_SLOT_MAP[p]);
    return { id: p, name: p, start: '', end: '', kind: 'range' };
  }
  const id = p.id || p.slot || p.periodId || `p${(index || 0) + 1}`;
  if (LEGACY_SLOT_MAP[id] && !p.start && !p.name) return Object.assign({}, LEGACY_SLOT_MAP[id]);
  const name = p.name || p.label || id;
  const start = p.start || p.begin || '';
  const end = p.end || '';
  let kind = p.kind;
  if (!kind) {
    if (p.sectionIndex != null && start && end) kind = 'hybrid';
    else if (p.sectionIndex != null) kind = 'section';
    else kind = 'range';
  }
  const slot = { id: String(id), name: String(name), start, end, kind };
  if (p.sectionIndex != null) slot.sectionIndex = Number(p.sectionIndex);
  return slot;
}

function normalizePeriods(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizePeriod).filter(Boolean);
}

function resolvePeriods(opts) {
  const mode = (opts && opts.mode) || DEFAULT_TASK_TIME_MODE;
  const meta = TIME_MODE_META[mode];
  if (!meta) throw new Error('INVALID_TIME_MODE');
  const profileSlots = normalizePeriods((opts && opts.profileSlots) || []);
  const selectedIds = opts && Array.isArray(opts.selectedIds) ? opts.selectedIds.map(String) : null;
  const customRanges = normalizePeriods((opts && opts.customRanges) || []);
  const overrides = (opts && opts.timeOverrides) || {};

  let result = [];
  if (mode === TIME_MODES.RANGE) {
    result = customRanges.length
      ? customRanges
      : profileSlots.filter((s) => s.kind === 'range' || s.sectionIndex == null);
    if (!result.length) result = profileSlots;
  } else {
    let base = profileSlots.length ? profileSlots : customRanges;
    if (selectedIds && selectedIds.length) {
      base = selectedIds
        .map((id) => base.find((s) => s.id === id) || profileSlots.find((s) => s.id === id))
        .filter(Boolean);
    }
    result = base.map((s, i) => {
      const o = overrides[s.id];
      if (!o) return normalizePeriod(s, i);
      return normalizePeriod(
        Object.assign({}, s, {
          start: o.start != null ? o.start : s.start,
          end: o.end != null ? o.end : s.end,
          name: o.name != null ? o.name : s.name,
        }),
        i
      );
    });
  }
  result = normalizePeriods(result);
  if (!result.length) throw new Error('PERIODS_EMPTY');
  return result;
}

function displayLabel(slot, mode) {
  const meta = TIME_MODE_META[mode] || TIME_MODE_META[DEFAULT_TASK_TIME_MODE];
  if (!slot) return '';
  if (meta.showSectionName && meta.showTimeRange && slot.start && slot.end) {
    return `${slot.name} ${slot.start}-${slot.end}`;
  }
  if (meta.showTimeRange && slot.start && slot.end) return `${slot.start}-${slot.end}`;
  return slot.name || slot.id;
}

function periodsToLabels(periods, mode) {
  const labels = {};
  normalizePeriods(periods).forEach((p) => {
    labels[p.id] = displayLabel(p, mode || DEFAULT_TASK_TIME_MODE);
    labels[p.id + '_short'] = p.name;
  });
  return labels;
}

function periodsToIds(periods) {
  return normalizePeriods(periods).map((p) => p.id);
}

module.exports = {
  normalizePeriod,
  normalizePeriods,
  resolvePeriods,
  displayLabel,
  periodsToLabels,
  periodsToIds,
  TIME_MODES,
  DEFAULT_TASK_TIME_MODE,
  TIME_MODE_META,
};
